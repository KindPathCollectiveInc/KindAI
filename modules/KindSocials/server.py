"""
KindSocials — All-in-one social platform layer for the KindPath ecosystem.

Port: 7862
Layers:
  - Kindfluence: constellation management, attention capital, readiness/dismantling
  - Field Studio: audio recording management + kindpath-analyser integration
  - Channels: social channel registry
  - Posts: draft / schedule / publish pipeline

Run: ./run.sh  (or: python server.py)
"""
from __future__ import annotations
import json, os, sys, uuid, subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT = Path(__file__).parent
KINDFLUENCE_ROOT = ROOT.parent / "Kindfluence"
ANALYSER_ROOT    = ROOT.parent / "kindpath-analyser"

# ── inject Kindfluence modules ──────────────────────────────────────────────
sys.path.insert(0, str(KINDFLUENCE_ROOT / "src"))

try:
    from kindfluence.constellation.account_registry import AccountRegistry, VoiceConfig
    from kindfluence.core.attention_field import AttentionField
    from kindfluence.forecasting.readiness_index import CommunityReadinessIndex
    _kindfluence_available = True
except ImportError as e:
    _kindfluence_available = False
    print(f"[WARN] Kindfluence not available: {e}")

# ── inject kindpath-analyser (optional) ────────────────────────────────────
# Borrow the analyser venv's site-packages so we don't need to re-install librosa
import glob as _glob
_analyser_site = _glob.glob(str(ANALYSER_ROOT / "venv/lib/python*/site-packages"))
if _analyser_site:
    sys.path.insert(0, _analyser_site[0])
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

app = FastAPI(title="KindSocials", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── state ───────────────────────────────────────────────────────────────────
KINDFLUENCE_STATE = KINDFLUENCE_ROOT / ".kindfluence_state.json"
KINDSOCIALS_STATE = ROOT / ".kindsocials_state.json"
RECORDINGS_DIR    = ROOT / "recordings"
RECORDINGS_DIR.mkdir(exist_ok=True)

if _kindfluence_available:
    registry       = AccountRegistry()
    attention_field = AttentionField()

_attention_log: List[Dict[str, Any]] = []
_started_at = datetime.utcnow().isoformat()

VALID_PHASES  = ["INFILTRATE","SEED","EMERGE","ACTIVATE","TRANSFER","LIBERATE"]
PHASE_WEIGHTS = {p: i / (len(VALID_PHASES) - 1) for i, p in enumerate(VALID_PHASES)}

PLATFORM_ICONS = {
    "instagram": "📸", "tiktok": "🎵", "youtube": "▶", "twitter": "🐦",
    "linkedin": "💼", "facebook": "📘", "threads": "🧵", "other": "📡",
}


# ── persistence ─────────────────────────────────────────────────────────────
def _load_kindfluence_state():
    if not _kindfluence_available or not KINDFLUENCE_STATE.exists():
        return
    try:
        raw = json.loads(KINDFLUENCE_STATE.read_text())
        for acct_id, data in raw.items():
            vc = data.pop("voice_config")
            registry.register_account(
                account_id=acct_id, archetype=data["archetype"],
                platform=data["platform"], voice_config=VoiceConfig(**vc),
                current_phase=data.get("current_phase", "INFILTRATE"),
                follower_count=data.get("follower_count", 0),
                engagement_rate=data.get("engagement_rate", 0.0),
                trust_score=data.get("trust_score", 0.0),
                metadata=data.get("metadata", {}),
            )
    except Exception as exc:
        print(f"[WARN] Could not load Kindfluence state: {exc}")


def _save_kindfluence_state():
    if not _kindfluence_available:
        return
    accounts = {k: v.model_dump(mode="json") for k, v in registry.accounts.items()}
    KINDFLUENCE_STATE.write_text(json.dumps(accounts, indent=2, default=str))


def _load_ks_state() -> dict:
    defaults = {"enabled": True, "channels": {}, "posts": [], "recordings": []}
    if KINDSOCIALS_STATE.exists():
        try:
            return {**defaults, **json.loads(KINDSOCIALS_STATE.read_text())}
        except Exception:
            pass
    return defaults


def _save_ks_state(state: dict):
    KINDSOCIALS_STATE.write_text(json.dumps(state, indent=2, default=str))


_ks = _load_ks_state()
_load_kindfluence_state()


# ── request models ───────────────────────────────────────────────────────────
class RegisterAccountRequest(BaseModel):
    account_id: Optional[str] = None
    archetype: str
    platform: str
    tone: str = "warm"
    language_style: str = "conversational"
    emoji_usage: str = "minimal"
    humor_level: str = "light"
    current_phase: str = "INFILTRATE"
    follower_count: int = 0
    engagement_rate: float = 0.0


class PhaseUpdateRequest(BaseModel):
    phase: str


class AttentionLogRequest(BaseModel):
    account_id: str
    platform: str
    metric_name: str
    value: float


class ChannelRequest(BaseModel):
    name: str
    platform: str
    handle: str
    follower_count: int = 0
    access_token: Optional[str] = None
    notes: str = ""


class PostRequest(BaseModel):
    channel_id: str
    content: str
    media_paths: List[str] = []
    scheduled_for: Optional[str] = None
    tags: List[str] = []
    account_id: Optional[str] = None


class RecordingRequest(BaseModel):
    title: str
    description: str = ""
    filepath: Optional[str] = None
    account_id: Optional[str] = None
    tags: List[str] = []


# ── module toggle ────────────────────────────────────────────────────────────
@app.get("/api/module")
async def get_module_state():
    return {"enabled": _ks.get("enabled", True)}


@app.post("/api/module/toggle")
async def toggle_module(body: dict):
    _ks["enabled"] = body.get("enabled", not _ks.get("enabled", True))
    _save_ks_state(_ks)
    return {"enabled": _ks["enabled"]}


# ── KindPath Module Protocol (KMP 1.0) ────────────────────────────────────────

@app.get("/api/module/identity")
async def module_identity():
    """KMP required endpoint — stable module identity for KCE registration."""
    return {
        "id": "kindsocials",
        "name": "KindSocials",
        "description": "Social platform sidecar — post scheduling, channel management, Kindfluence integration",
        "version": "0.1.0",
        "port": 7862,
        "capabilities": ["social", "scheduling", "attention-capital"],
        "kmpVersion": "1.0",
    }


@app.get("/api/health")
async def health():
    """KMP required endpoint — liveness and readiness check."""
    import time
    started = datetime.fromisoformat(_started_at)
    uptime = (datetime.utcnow() - started).total_seconds()
    checks = {
        "state_file": "ok" if KINDSOCIALS_STATE.exists() else "missing",
        "kindfluence": "ok" if _kindfluence_available else "unavailable",
        "analyser": "ok" if _analyser_available else "unavailable",
        "recordings_dir": "ok" if RECORDINGS_DIR.exists() else "missing",
    }
    status = "ok" if all(v == "ok" for v in checks.values() if v not in ("unavailable",)) else "degraded"
    return {"status": status, "version": "0.1.0", "uptime": uptime, "checks": checks}


# ── KCE self-registration (called at startup) ─────────────────────────────────

async def _register_with_kce():
    """Register this module with KCE. Best-effort — never crashes the server."""
    try:
        import httpx
        identity = (await module_identity())
        identity["baseUrl"] = "http://localhost:7862"
        async with httpx.AsyncClient() as client:
            await client.post("http://localhost:7870/modules", json=identity, timeout=5)
        print("[KMP] Registered with KCE @ http://localhost:7870")
    except Exception as e:
        print(f"[KMP] KCE not available ({e}) — running standalone")


app.router.on_startup.append(_register_with_kce)


# ── status ────────────────────────────────────────────────────────────────────
@app.get("/api/status")
async def get_status():
    total = len(registry.accounts) if _kindfluence_available else 0
    phases: Dict[str, int] = {}
    if _kindfluence_available:
        for a in registry.accounts.values():
            phases[a.current_phase] = phases.get(a.current_phase, 0) + 1
    avg_trust = 0.0
    if _kindfluence_available and total:
        avg_trust = sum(a.trust_score for a in registry.accounts.values()) / total
    return {
        "status": "active",
        "module_enabled": _ks.get("enabled", True),
        "started_at": _started_at,
        "accounts": total,
        "phases": phases,
        "avg_trust_score": round(avg_trust, 3),
        "attention_signals": len(_attention_log),
        "channels": len(_ks.get("channels", {})),
        "posts": len(_ks.get("posts", [])),
        "recordings": len(_ks.get("recordings", [])),
        "components": {
            "kindfluence": "active" if _kindfluence_available else "unavailable",
            "field_studio": "active" if _analyser_available else "basic",
            "channels": "active",
            "posts": "active",
        },
    }


# ── constellation (Kindfluence passthrough) ──────────────────────────────────
@app.get("/api/constellation")
async def list_accounts():
    if not _kindfluence_available:
        raise HTTPException(503, "Kindfluence not available")
    accounts = [v.model_dump(mode="json") for v in registry.accounts.values()]
    return {"accounts": accounts, "total": len(accounts)}


@app.post("/api/constellation")
async def register_account(req: RegisterAccountRequest):
    if not _kindfluence_available:
        raise HTTPException(503, "Kindfluence not available")
    acct_id = req.account_id or f"acct_{uuid.uuid4().hex[:8]}"
    vc = VoiceConfig(tone=req.tone, language_style=req.language_style,
                     emoji_usage=req.emoji_usage, humor_level=req.humor_level)
    record = registry.register_account(
        account_id=acct_id, archetype=req.archetype, platform=req.platform,
        voice_config=vc, current_phase=req.current_phase,
        follower_count=req.follower_count, engagement_rate=req.engagement_rate,
    )
    _save_kindfluence_state()
    return record.model_dump(mode="json")


@app.get("/api/constellation/{account_id}")
async def get_account(account_id: str):
    if not _kindfluence_available:
        raise HTTPException(503, "Kindfluence not available")
    a = registry.accounts.get(account_id)
    if not a:
        raise HTTPException(404, f"Account {account_id!r} not found")
    return a.model_dump(mode="json")


@app.put("/api/constellation/{account_id}/phase")
async def update_phase(account_id: str, req: PhaseUpdateRequest):
    if not _kindfluence_available:
        raise HTTPException(503, "Kindfluence not available")
    if req.phase not in VALID_PHASES:
        raise HTTPException(400, f"Invalid phase. Must be one of {VALID_PHASES}")
    a = registry.accounts.get(account_id)
    if not a:
        raise HTTPException(404, f"Account {account_id!r} not found")
    a.current_phase = req.phase
    _save_kindfluence_state()
    return a.model_dump(mode="json")


# ── attention capital ─────────────────────────────────────────────────────────
@app.post("/api/attention")
async def log_attention(req: AttentionLogRequest):
    entry = {
        "id": uuid.uuid4().hex[:8],
        "timestamp": datetime.utcnow().isoformat(),
        "account_id": req.account_id,
        "platform": req.platform,
        "metric_name": req.metric_name,
        "value": req.value,
    }
    _attention_log.append(entry)
    if _kindfluence_available:
        attention_field.ingest(
            timestamp=entry["timestamp"], metric_name=req.metric_name,
            value=req.value, account_id=req.account_id, platform=req.platform,
        )
    return entry


@app.get("/api/attention")
async def get_attention(account_id: Optional[str] = None, limit: int = 50):
    logs = _attention_log
    if account_id:
        logs = [l for l in logs if l["account_id"] == account_id]
    return {"signals": logs[-limit:], "total": len(logs)}


# ── readiness ─────────────────────────────────────────────────────────────────
@app.get("/api/readiness")
async def get_readiness():
    if not _kindfluence_available or not registry.accounts:
        return {"overall_score": 0, "level": "NASCENT", "component_scores": {}, "note": "No accounts or Kindfluence unavailable"}
    try:
        # Compute readiness across all accounts and average
        scores = []
        for acct_id in registry.accounts:
            ri = CommunityReadinessIndex(acct_id)
            r = ri.compute_readiness()
            scores.append(getattr(r, "overall_score", 0))
        overall = sum(scores) / len(scores) if scores else 0
        # Return detailed result from first account for level/recommendation labels
        ri0 = CommunityReadinessIndex(next(iter(registry.accounts)))
        r0 = ri0.compute_readiness()
        result = {
            "overall_score": round(overall, 3),
            "level": getattr(r0.level, "value", str(getattr(r0, "level", "NASCENT"))),
            "component_scores": {},
            "next_level": str(getattr(r0, "next_level", "")),
            "recommendation": str(getattr(r0, "recommendation", "")),
            "accounts_assessed": len(scores),
        }
        try:
            result["component_scores"] = {
                "self_organization": r0.self_organization_score,
                "value_content": r0.value_content_score,
                "intergenerational": r0.intergenerational_score,
                "collaborative": r0.collaborative_score,
            }
        except AttributeError:
            pass
        return result
    except Exception as exc:
        return {"overall_score": 0, "level": "NASCENT", "component_scores": {}, "error": str(exc)}


# ── dismantling ───────────────────────────────────────────────────────────────
@app.get("/api/dismantling")
async def get_dismantling():
    if not _kindfluence_available or not registry.accounts:
        return {"status": "no_accounts", "message": "No accounts registered yet", "progress": 0}
    phase_dist: Dict[str, int] = {}
    total_weight = 0.0
    for a in registry.accounts.values():
        phase_dist[a.current_phase] = phase_dist.get(a.current_phase, 0) + 1
        total_weight += PHASE_WEIGHTS.get(a.current_phase, 0)
    n = len(registry.accounts)
    progress = total_weight / n if n else 0
    at_transfer = sum(1 for a in registry.accounts.values() if PHASE_WEIGHTS.get(a.current_phase, 0) >= PHASE_WEIGHTS["TRANSFER"])
    return {
        "progress": round(progress, 3),
        "status": "liberating" if progress >= 0.9 else ("advancing" if progress >= 0.4 else "seeding"),
        "phase_distribution": phase_dist,
        "total_accounts": n,
        "accounts_at_transfer_or_beyond": at_transfer,
    }


# ── channels ──────────────────────────────────────────────────────────────────
@app.get("/api/channels")
async def list_channels():
    channels = list(_ks.get("channels", {}).values())
    return {"channels": channels, "total": len(channels)}


@app.post("/api/channels")
async def add_channel(req: ChannelRequest):
    cid = f"ch_{uuid.uuid4().hex[:8]}"
    channel = {
        "id": cid, "name": req.name, "platform": req.platform,
        "handle": req.handle, "follower_count": req.follower_count,
        "icon": PLATFORM_ICONS.get(req.platform, "📡"),
        "connected_at": datetime.utcnow().isoformat(),
        "status": "connected",
        "notes": req.notes,
        # never store raw access tokens — just flag if one was provided
        "has_token": bool(req.access_token),
    }
    _ks.setdefault("channels", {})[cid] = channel
    _save_ks_state(_ks)
    return channel


@app.delete("/api/channels/{channel_id}")
async def remove_channel(channel_id: str):
    channels = _ks.get("channels", {})
    if channel_id not in channels:
        raise HTTPException(404, f"Channel {channel_id!r} not found")
    del channels[channel_id]
    _save_ks_state(_ks)
    return {"deleted": channel_id}


# ── posts ─────────────────────────────────────────────────────────────────────
@app.get("/api/posts")
async def list_posts(channel_id: Optional[str] = None, status: Optional[str] = None):
    posts = _ks.get("posts", [])
    if channel_id:
        posts = [p for p in posts if p.get("channel_id") == channel_id]
    if status:
        posts = [p for p in posts if p.get("status") == status]
    return {"posts": posts, "total": len(posts)}


@app.post("/api/posts")
async def create_post(req: PostRequest):
    post = {
        "id": f"post_{uuid.uuid4().hex[:8]}",
        "channel_id": req.channel_id,
        "account_id": req.account_id,
        "content": req.content,
        "media_paths": req.media_paths,
        "tags": req.tags,
        "scheduled_for": req.scheduled_for,
        "status": "draft",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    _ks.setdefault("posts", []).append(post)
    _save_ks_state(_ks)
    return post


@app.put("/api/posts/{post_id}")
async def update_post(post_id: str, body: dict):
    posts = _ks.get("posts", [])
    post = next((p for p in posts if p["id"] == post_id), None)
    if not post:
        raise HTTPException(404, f"Post {post_id!r} not found")
    allowed = {"content", "tags", "media_paths", "scheduled_for"}
    for k in allowed:
        if k in body:
            post[k] = body[k]
    post["updated_at"] = datetime.utcnow().isoformat()
    _save_ks_state(_ks)
    return post


@app.post("/api/posts/{post_id}/publish")
async def publish_post(post_id: str):
    posts = _ks.get("posts", [])
    post = next((p for p in posts if p["id"] == post_id), None)
    if not post:
        raise HTTPException(404, f"Post {post_id!r} not found")
    post["status"] = "published"
    post["published_at"] = datetime.utcnow().isoformat()
    post["updated_at"] = datetime.utcnow().isoformat()
    _save_ks_state(_ks)
    return post


@app.delete("/api/posts/{post_id}")
async def delete_post(post_id: str):
    posts = _ks.get("posts", [])
    _ks["posts"] = [p for p in posts if p["id"] != post_id]
    _save_ks_state(_ks)
    return {"deleted": post_id}


# ── field studio ──────────────────────────────────────────────────────────────
@app.get("/api/studio/recordings")
async def list_recordings():
    recordings = _ks.get("recordings", [])
    return {"recordings": recordings, "total": len(recordings)}


@app.post("/api/studio/recordings")
async def add_recording(req: RecordingRequest):
    rec = {
        "id": f"rec_{uuid.uuid4().hex[:8]}",
        "title": req.title,
        "description": req.description,
        "filepath": req.filepath or "",
        "account_id": req.account_id,
        "tags": req.tags,
        "duration_sec": None,
        "analysis": None,
        "analysed_at": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    _ks.setdefault("recordings", []).append(rec)
    _save_ks_state(_ks)
    return rec


@app.post("/api/studio/recordings/{recording_id}/analyze")
async def analyze_recording(recording_id: str):
    recordings = _ks.get("recordings", [])
    rec = next((r for r in recordings if r["id"] == recording_id), None)
    if not rec:
        raise HTTPException(404, f"Recording {recording_id!r} not found")
    if not rec.get("filepath") or not Path(rec["filepath"]).exists():
        raise HTTPException(400, "No file path set or file not found for this recording")
    if not _analyser_available:
        return {"status": "analyser_unavailable", "note": "kindpath-analyser not installed"}
    try:
        audio = analyser_load(rec["filepath"])
        segs  = segment(audio)
        feats = [extract(s) for s in segs.segments]
        traj  = compute_trajectory(feats)
        fps   = analyse_fingerprints(feats[0] if feats else None)
        summary = {
            "lsii": round(traj.lsii_result.lsii_score, 3),
            "lsii_flag": traj.lsii_result.flag_level,
            "duration_sec": audio.duration,
            "tempo_bpm": round(feats[0].temporal.tempo_bpm, 1) if feats else None,
            "key": fps.key_estimate if fps else None,
            "era": fps.era_matches[0].name if fps and fps.era_matches else None,
            "manufacturing_markers": fps.manufacturing_markers if fps else [],
            "authenticity_markers": fps.authenticity_markers if fps else [],
        }
        rec["analysis"] = summary
        rec["analysed_at"] = datetime.utcnow().isoformat()
        rec["duration_sec"] = audio.duration
        _save_ks_state(_ks)
        return {"status": "complete", "recording_id": recording_id, "analysis": summary}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


@app.get("/api/studio/recordings/{recording_id}")
async def get_recording(recording_id: str):
    rec = next((r for r in _ks.get("recordings", []) if r["id"] == recording_id), None)
    if not rec:
        raise HTTPException(404, f"Recording {recording_id!r} not found")
    return rec


# ── dashboard ─────────────────────────────────────────────────────────────────
@app.get("/")
async def dashboard():
    html_path = ROOT / "static" / "index.html"
    if not html_path.exists():
        return HTMLResponse("<h1>KindSocials</h1><p>Dashboard not found. Run run.sh.</p>")
    return HTMLResponse(html_path.read_text())


if __name__ == "__main__":
    import sys as _sys
    port = int(_sys.argv[1]) if len(_sys.argv) > 1 else 7862
    print(f"\n  KindSocials → http://localhost:{port}\n  Kindfluence: {'\u2713' if _kindfluence_available else '\u2717 not found'}")
    print(f"  Analyser:    {'\u2713' if _analyser_available else '\u2717 not found (basic mode)'}\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
