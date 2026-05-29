"""
KindCreate — Creative Workspace for the KindPath ecosystem.

Port: 7863

What this is:
  A sovereignty-first creative hub. Not a social app with a creation feature —
  a creation tool with the option to share. The creator decides when, where, and
  whether their work reaches an audience.

Layers:
  - Projects: workspaces for creative endeavours (music, writing, visual, etc.)
  - Drafts: version-managed drafts with mood/energy metadata
  - Tool Links: deep-link registry to external tools (Ableton, Logic, Figma, etc.)
  - Analysis: audio LSII + psychosomatic analysis via kindpath-analyser
  - Share: explicit push from KindCreate → KindSocials post queue (creator-initiated only)
  - Seedbank: deposit creative profiles to the kindpath-analyser seedbank

KMP endpoints: /api/module/identity + /api/health
KCE events: create.project.created, create.draft.saved, create.analysis.complete,
            create.shared.to.social

Run: python server.py
"""
from __future__ import annotations
import json, uuid, sys, subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT        = Path(__file__).parent
DATA_DIR    = ROOT / "data"
STATE_FILE  = DATA_DIR / "kindcreate_state.json"
DATA_DIR.mkdir(exist_ok=True)

# Optional: kindpath-analyser integration
ANALYSER_ROOT = ROOT.parent / "kindpath-analyser"
# Add analyser root so core.* imports resolve; skip its python3.12 venv
# site-packages (binary-incompatible with this python3.13 venv)
sys.path.insert(0, str(ANALYSER_ROOT))
try:
    from core.ingestion import load as analyser_load
    from core.segmentation import segment
    from core.feature_extractor import extract
    from core.divergence import compute_trajectory
    from core.fingerprints import analyse_fingerprints
    _analyser_available = True
except ImportError:
    _analyser_available = False

app = FastAPI(title="KindCreate", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_started_at = datetime.utcnow().isoformat()

# ── State ─────────────────────────────────────────────────────────────────────

def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"projects": {}, "tool_links": {}}


def _save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))


_state = _load_state()


# ── KCE event publishing ──────────────────────────────────────────────────────

async def _emit_event(event_type: str, data: dict):
    """Fire-and-forget event to KCE bus. Never crashes the caller."""
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://localhost:7870/events",
                json={"type": event_type, "source": "kindcreate", "data": data},
                timeout=2,
            )
    except Exception:
        pass  # KCE is optional


# ── KMP: Identity + Health ────────────────────────────────────────────────────

@app.get("/api/module/identity")
async def module_identity():
    """KMP 1.0 — stable module identity."""
    return {
        "id": "kindcreate",
        "name": "KindCreate",
        "description": "Sovereignty-first creative workspace — projects, drafts, audio analysis, optional sharing",
        "version": "0.1.0",
        "port": 7863,
        "capabilities": ["creative", "analysis", "drafts", "audio-analysis"],
        "kmpVersion": "1.0",
    }


@app.get("/api/health")
async def health():
    """KMP 1.0 — liveness check."""
    started = datetime.fromisoformat(_started_at)
    uptime = (datetime.utcnow() - started).total_seconds()
    checks = {
        "state_file": "ok" if STATE_FILE.exists() else "missing",
        "analyser": "ok" if _analyser_available else "unavailable",
        "projects": len(_state.get("projects", {})),
    }
    return {"status": "ok", "version": "0.1.0", "uptime": uptime, "checks": checks}


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    projects = _state.get("projects", {})
    total_drafts = sum(len(p.get("drafts", [])) for p in projects.values())
    return {
        "status": "active",
        "started_at": _started_at,
        "projects": len(projects),
        "total_drafts": total_drafts,
        "tool_links": len(_state.get("tool_links", {})),
        "analyser": "active" if _analyser_available else "unavailable",
    }


# ── Projects ──────────────────────────────────────────────────────────────────


class ProjectRequest(BaseModel):
    name: str
    type: str  # "music", "writing", "visual", "code", "other"
    description: Optional[str] = None
    tags: Optional[List[str]] = None


@app.get("/api/projects")
async def list_projects():
    projects = _state.get("projects", {})
    return {
        "projects": [
            {
                "id": pid,
                "name": p["name"],
                "type": p["type"],
                "description": p.get("description", ""),
                "tags": p.get("tags", []),
                "created_at": p["created_at"],
                "updated_at": p.get("updated_at", p["created_at"]),
                "draft_count": len(p.get("drafts", [])),
                "analysis_count": len(p.get("analyses", [])),
            }
            for pid, p in projects.items()
        ],
        "total": len(projects),
    }


@app.post("/api/projects", status_code=201)
async def create_project(req: ProjectRequest):
    pid = str(uuid.uuid4())[:8]
    project = {
        "id": pid,
        "name": req.name,
        "type": req.type,
        "description": req.description or "",
        "tags": req.tags or [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "drafts": [],
        "analyses": [],
        "tool_links": [],
    }
    _state.setdefault("projects", {})[pid] = project
    _save_state(_state)
    await _emit_event("create.project.created", {"projectId": pid, "name": req.name, "type": req.type})
    return project


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, f"Project {project_id!r} not found")
    return p


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    projects = _state.get("projects", {})
    if project_id not in projects:
        raise HTTPException(404, "Project not found")
    del projects[project_id]
    _save_state(_state)
    return {"ok": True}


# ── Drafts ────────────────────────────────────────────────────────────────────


class DraftRequest(BaseModel):
    title: str
    content: Optional[str] = None
    content_type: Optional[str] = "text"  # "text", "markdown", "json", "binary_ref"
    mood: Optional[str] = None            # Creator's mood at time of writing
    energy: Optional[float] = None        # 0.0–1.0 energy level
    notes: Optional[str] = None           # Private creator notes


@app.get("/api/projects/{project_id}/drafts")
async def list_drafts(project_id: str):
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return {"drafts": p.get("drafts", []), "total": len(p.get("drafts", []))}


@app.post("/api/projects/{project_id}/drafts", status_code=201)
async def create_draft(project_id: str, req: DraftRequest):
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    draft_id = str(uuid.uuid4())[:8]
    version = len(p.get("drafts", [])) + 1
    draft = {
        "id": draft_id,
        "project_id": project_id,
        "version": version,
        "title": req.title,
        "content": req.content or "",
        "content_type": req.content_type,
        "mood": req.mood,
        "energy": req.energy,
        "notes": req.notes or "",
        "created_at": datetime.utcnow().isoformat(),
    }
    p.setdefault("drafts", []).append(draft)
    p["updated_at"] = datetime.utcnow().isoformat()
    _save_state(_state)
    await _emit_event("create.draft.saved", {
        "projectId": project_id,
        "draftId": draft_id,
        "version": version,
        "mood": req.mood,
    })
    return draft


# ── Tool Links ────────────────────────────────────────────────────────────────
# External tool deep-link registry.
# Links are per-project — they represent the tools used in that creative process.
# This is creative provenance: what instruments and tools shaped this work.

KNOWN_TOOL_SCHEMES = {
    "ableton": "ableton://",
    "logic": "logic://",
    "figma": "figma://",
    "notion": "notion://",
    "reaper": "reaper://",
    "xcode": "xcode://",
    "vscode": "vscode://",
}


class ToolLinkRequest(BaseModel):
    name: str                   # Human name: "Project Session — Logic"
    tool: str                   # Tool type: "logic", "figma", "ableton", "other"
    url: Optional[str] = None   # Deep-link URL (optional — can be display-only)
    notes: Optional[str] = None


@app.get("/api/projects/{project_id}/tools")
async def list_project_tools(project_id: str):
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return {"tools": p.get("tool_links", []), "total": len(p.get("tool_links", []))}


@app.post("/api/projects/{project_id}/tools", status_code=201)
async def add_tool_link(project_id: str, req: ToolLinkRequest):
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    link = {
        "id": str(uuid.uuid4())[:8],
        "name": req.name,
        "tool": req.tool,
        "url": req.url or "",
        "notes": req.notes or "",
        "added_at": datetime.utcnow().isoformat(),
    }
    p.setdefault("tool_links", []).append(link)
    _save_state(_state)
    return link


# ── Audio Analysis ────────────────────────────────────────────────────────────
# Runs kindpath-analyser on an audio file and attaches results to a project.
# The LSII and psychosomatic profile become part of the project's creative record.

@app.post("/api/projects/{project_id}/analyse")
async def analyse_audio(project_id: str, body: dict):
    """
    Run kindpath-analyser on an audio file.
    Body: { "filepath": "/path/to/audio.wav" }
    Attaches the analysis result to the project.
    """
    p = _state.get("projects", {}).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not _analyser_available:
        raise HTTPException(503, "kindpath-analyser not available")

    filepath = body.get("filepath")
    if not filepath or not Path(filepath).exists():
        raise HTTPException(400, f"File not found: {filepath}")

    try:
        record = analyser_load(filepath)
        segments = segment(record)
        features = [extract(s) for s in segments.segments]
        trajectory = compute_trajectory(features)
        fingerprints = analyse_fingerprints(features)

        result = {
            "id": str(uuid.uuid4())[:8],
            "filepath": filepath,
            "analysed_at": datetime.utcnow().isoformat(),
            "duration_seconds": record.duration,
            "lsii_score": trajectory.lsii_result.lsii_score if trajectory.lsii_result else None,
            "lsii_flag": trajectory.lsii_result.flag_level if trajectory.lsii_result else "none",
            "era_fingerprint": (
                fingerprints.era_matches[0].name
                if fingerprints.era_matches else "unknown"
            ),
        }
        p.setdefault("analyses", []).append(result)
        p["updated_at"] = datetime.utcnow().isoformat()
        _save_state(_state)

        await _emit_event("create.analysis.complete", {
            "projectId": project_id,
            "analysisId": result["id"],
            "lsiiScore": result["lsii_score"],
            "lsiiFlag": result["lsii_flag"],
        })
        return result

    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")


# ── Share to KindSocials ──────────────────────────────────────────────────────
# Creator-initiated only. KindCreate never pushes to KindSocials automatically.
# This is the explicit "I want to share this" action.

class ShareRequest(BaseModel):
    project_id: str
    draft_id: Optional[str] = None
    caption: Optional[str] = None
    channel_id: Optional[str] = None     # KindSocials channel ID (optional)
    scheduled_at: Optional[str] = None   # ISO timestamp (optional — immediate if absent)
    platforms: Optional[List[str]] = None


@app.post("/api/share")
async def share_to_social(req: ShareRequest):
    """
    Push a creative work to KindSocials post queue.
    This is the only bridge from KindCreate to KindSocials.
    It is always explicit — never automatic.
    """
    p = _state.get("projects", {}).get(req.project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    post_payload = {
        "source": "kindcreate",
        "project_id": req.project_id,
        "project_name": p["name"],
        "draft_id": req.draft_id,
        "caption": req.caption or f"Sharing work from {p['name']}",
        "channel_id": req.channel_id,
        "scheduled_at": req.scheduled_at,
        "platforms": req.platforms or [],
        "shared_at": datetime.utcnow().isoformat(),
    }

    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "http://localhost:7862/api/posts",
                json=post_payload,
                timeout=5,
            )
        if resp.status_code in (200, 201):
            post_data = resp.json()
            await _emit_event("create.shared.to.social", {
                "projectId": req.project_id,
                "postId": post_data.get("id"),
                "caption": req.caption,
            })
            return {"ok": True, "post": post_data}
        else:
            raise HTTPException(502, f"KindSocials returned {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"KindSocials not available: {e}")


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html_path = ROOT / "static" / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text())
    return HTMLResponse("<h1>KindCreate</h1><p>Dashboard loading...</p>")


# ── KCE startup registration ──────────────────────────────────────────────────

async def _register_with_kce():
    """Register this module with KCE. Best-effort — never crashes the server."""
    try:
        import httpx
        identity = (await module_identity())
        identity["baseUrl"] = "http://localhost:7863"
        async with httpx.AsyncClient() as client:
            await client.post("http://localhost:7870/modules", json=identity, timeout=5)
        print("[KMP] Registered with KCE @ http://localhost:7870")
    except Exception as e:
        print(f"[KMP] KCE not available ({e}) — running standalone")


app.router.on_startup.append(_register_with_kce)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7863
    print(f"\n  KindCreate → http://localhost:{port}")
    print(f"  Analyser:   {'✓' if _analyser_available else '✗ not found (analysis disabled)'}\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
