"""
KiNDIS — NDIS Case Management Module

Port: 7864

What this is:
  NDIS compliance, case notes, participant management, and billing code tracking
  for KindPath practitioners. Extracted and extended from ai-workbench/ndis/.

  This is the practitioner-side tool. KindCare (7865) is the participant-facing view.
  Both share the same SQLite database (KiNDIS is the canonical source).

  Designed to assist practitioners in meeting NDIS Quality and Safeguards Standards.
  Every case note is time-stamped, participant-linked, and exportable for audits.

Domains:
  - Participants: intake, plan dates, funding categories, consent records
  - Case notes: NDIS-compliant progress notes with support item codes
  - Billing: support item tracking and billable hours per participant
  - Audits: daily compliance checks with red/amber/green status
  - References: price guide and support categories (loaded from JSON)

KMP endpoints: /api/module/identity + /api/health
KCE events: ndis.case_note.created, ndis.participant.registered, ndis.audit.completed

Run: python server.py
"""

from __future__ import annotations
import json, sqlite3, uuid
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7864
MODULE_ID = "kindis"
MODULE_NAME = "KiNDIS"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindis.db"

# Load NDIS price guide if available from ai-workbench source
PRICE_GUIDE_PATH = Path("/Users/sam/ai-workbench/ndis/price_guide.json")
PRICE_GUIDE = {}
if PRICE_GUIDE_PATH.exists():
    try:
        PRICE_GUIDE = json.loads(PRICE_GUIDE_PATH.read_text())
    except Exception:
        pass

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS participants (
                id              TEXT PRIMARY KEY,
                ndis_number     TEXT UNIQUE,
                first_name      TEXT NOT NULL,
                last_name       TEXT NOT NULL,
                dob             TEXT,
                plan_start      TEXT,
                plan_end        TEXT,
                primary_goal    TEXT,
                categories      TEXT DEFAULT '[]',
                consent_signed  INTEGER DEFAULT 0,
                consent_date    TEXT,
                status          TEXT DEFAULT 'active',
                notes           TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS case_notes (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT NOT NULL,
                practitioner    TEXT,
                session_date    TEXT NOT NULL,
                support_item    TEXT,
                support_code    TEXT,
                duration_min    INTEGER,
                content         TEXT NOT NULL,
                goals_addressed TEXT DEFAULT '[]',
                outcomes        TEXT,
                billable        INTEGER DEFAULT 1,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (participant_id) REFERENCES participants(id)
            );

            CREATE TABLE IF NOT EXISTS billing_items (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT NOT NULL,
                case_note_id    TEXT,
                support_code    TEXT NOT NULL,
                support_name    TEXT,
                units           REAL NOT NULL,
                unit_price      REAL,
                total           REAL,
                billing_date    TEXT NOT NULL,
                status          TEXT DEFAULT 'pending',
                created_at      TEXT NOT NULL,
                FOREIGN KEY (participant_id) REFERENCES participants(id)
            );

            CREATE TABLE IF NOT EXISTS audits (
                id              TEXT PRIMARY KEY,
                audit_date      TEXT NOT NULL,
                audit_type      TEXT DEFAULT 'daily',
                status          TEXT DEFAULT 'pending',
                findings        TEXT DEFAULT '[]',
                recommendations TEXT DEFAULT '[]',
                completed_by    TEXT,
                completed_at    TEXT,
                created_at      TEXT NOT NULL
            );
        """)

init_db()

app = FastAPI(title=MODULE_NAME, version=MODULE_VERSION)
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── KCE ──────────────────────────────────────────────────────────────────────

async def _emit_event(event_type: str, data: dict):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.post(f"{KCE_URL}/events", json={
                "source": MODULE_ID, "type": event_type, "payload": data,
            })
    except Exception:
        pass

@app.get("/api/module/identity")
async def module_identity():
    return {
        "id": MODULE_ID,
        "name": MODULE_NAME,
        "description": "NDIS case management for practitioners. Case notes, compliance, billing, participant management.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["ndis_case_notes", "participant_management",
                         "billing_codes", "compliance_audits", "price_guide"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            p = conn.execute("SELECT COUNT(*) FROM participants WHERE status='active'").fetchone()[0]
            n = conn.execute("SELECT COUNT(*) FROM case_notes WHERE session_date >= date('now', '-30 days')").fetchone()[0]
        return {"status": "ok", "active_participants": p, "notes_last_30d": n}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

async def _register_with_kce():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            identity = await module_identity()
            identity["baseUrl"] = f"http://localhost:{PORT}"
            await client.post(f"{KCE_URL}/modules", json=identity)
            print(f"[KMP] Registered with KCE @ {KCE_URL}")
    except Exception as e:
        print(f"[KMP] KCE not available ({e}) — running standalone")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    await _register_with_kce()
    yield

app.router.lifespan_context = lifespan

# ── Participants ──────────────────────────────────────────────────────────────

class ParticipantRequest(BaseModel):
    first_name: str
    last_name: str
    ndis_number: Optional[str] = None
    dob: Optional[str] = None
    plan_start: Optional[str] = None
    plan_end: Optional[str] = None
    primary_goal: Optional[str] = None
    categories: Optional[List[str]] = None

@app.get("/api/participants")
async def list_participants(status: str = "active"):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM participants WHERE status=? ORDER BY last_name, first_name",
            (status,),
        ).fetchall()
    return [dict(r) for r in rows]

@app.get("/api/participants/{participant_id}")
async def get_participant(participant_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM participants WHERE id=?", (participant_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Participant not found")
        notes_count = conn.execute(
            "SELECT COUNT(*) FROM case_notes WHERE participant_id=?", (participant_id,)
        ).fetchone()[0]
    result = dict(row)
    result["total_case_notes"] = notes_count
    return result

@app.post("/api/participants", status_code=201)
async def register_participant(req: ParticipantRequest):
    p = {
        "id": str(uuid.uuid4()),
        "ndis_number": req.ndis_number,
        "first_name": req.first_name,
        "last_name": req.last_name,
        "dob": req.dob,
        "plan_start": req.plan_start,
        "plan_end": req.plan_end,
        "primary_goal": req.primary_goal,
        "categories": json.dumps(req.categories or []),
        "consent_signed": 0,
        "consent_date": None,
        "status": "active",
        "notes": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(p.values()),
        )
    await _emit_event("ndis.participant.registered", {"id": p["id"], "name": f"{req.first_name} {req.last_name}"})
    return p

@app.post("/api/participants/{participant_id}/consent")
async def record_consent(participant_id: str, body: dict):
    signed = bool(body.get("signed", True))
    with get_db() as conn:
        conn.execute(
            "UPDATE participants SET consent_signed=?, consent_date=? WHERE id=?",
            (1 if signed else 0, date.today().isoformat(), participant_id),
        )
    return {"participant_id": participant_id, "consent_signed": signed, "consent_date": date.today().isoformat()}

# ── Case Notes ────────────────────────────────────────────────────────────────

class CaseNoteRequest(BaseModel):
    participant_id: str
    session_date: str
    content: str
    support_item: Optional[str] = None
    support_code: Optional[str] = None
    duration_min: Optional[int] = None
    practitioner: Optional[str] = None
    goals_addressed: Optional[List[str]] = None
    outcomes: Optional[str] = None
    billable: bool = True

@app.get("/api/case-notes")
async def list_case_notes(participant_id: Optional[str] = None, limit: int = 50):
    with get_db() as conn:
        if participant_id:
            rows = conn.execute(
                "SELECT cn.*, p.first_name, p.last_name FROM case_notes cn "
                "JOIN participants p ON cn.participant_id = p.id "
                "WHERE cn.participant_id=? ORDER BY cn.session_date DESC LIMIT ?",
                (participant_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT cn.*, p.first_name, p.last_name FROM case_notes cn "
                "JOIN participants p ON cn.participant_id = p.id "
                "ORDER BY cn.session_date DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/case-notes", status_code=201)
async def create_case_note(req: CaseNoteRequest):
    note_id = str(uuid.uuid4())
    note = {
        "id": note_id,
        "participant_id": req.participant_id,
        "practitioner": req.practitioner,
        "session_date": req.session_date,
        "support_item": req.support_item,
        "support_code": req.support_code,
        "duration_min": req.duration_min,
        "content": req.content,
        "goals_addressed": json.dumps(req.goals_addressed or []),
        "outcomes": req.outcomes,
        "billable": 1 if req.billable else 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO case_notes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(note.values()),
        )
    await _emit_event("ndis.case_note.created", {"note_id": note_id, "participant_id": req.participant_id})
    return note

@app.get("/api/case-notes/{note_id}/export", response_class=PlainTextResponse)
async def export_case_note(note_id: str):
    with get_db() as conn:
        note = conn.execute(
            "SELECT cn.*, p.first_name, p.last_name, p.ndis_number FROM case_notes cn "
            "JOIN participants p ON cn.participant_id = p.id WHERE cn.id=?",
            (note_id,),
        ).fetchone()
        if not note:
            raise HTTPException(404, "Note not found")
    n = dict(note)
    lines = [
        f"NDIS CASE NOTE — {n['session_date']}",
        f"Participant: {n['first_name']} {n['last_name']}",
        f"NDIS Number: {n.get('ndis_number', 'Not recorded')}",
        f"Practitioner: {n.get('practitioner', 'Not recorded')}",
        f"Support Item: {n.get('support_item', 'Not specified')}",
        f"Support Code: {n.get('support_code', 'Not specified')}",
        f"Duration: {n.get('duration_min', '—')} minutes",
        "",
        "PROGRESS NOTES:",
        n["content"],
        "",
        f"Outcomes: {n.get('outcomes', 'Not recorded')}",
        f"Billable: {'Yes' if n['billable'] else 'No'}",
        "",
        f"Created: {n['created_at']}",
        f"Note ID: {note_id}",
    ]
    return "\n".join(lines)

# ── Price Guide ───────────────────────────────────────────────────────────────

@app.get("/api/price-guide")
async def get_price_guide(category: Optional[str] = None):
    if not PRICE_GUIDE:
        return {"note": "Price guide not loaded — place price_guide.json in data/"}
    if category:
        return {k: v for k, v in PRICE_GUIDE.items() if category.lower() in k.lower()}
    return PRICE_GUIDE

# ── Audits ────────────────────────────────────────────────────────────────────

@app.get("/api/audits")
async def list_audits(limit: int = 20):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM audits ORDER BY audit_date DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/audits", status_code=201)
async def create_audit(body: dict):
    audit_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO audits VALUES (?,?,?,?,?,?,?,?,?)",
            (audit_id, date.today().isoformat(), body.get("audit_type", "daily"),
             "pending", "[]", "[]", body.get("completed_by"),
             None, datetime.utcnow().isoformat()),
        )
    return {"id": audit_id, "audit_date": date.today().isoformat()}

# ── Workers ──────────────────────────────────────────────────────────────────

@app.get("/api/workers")
async def list_workers():
    with get_db() as conn:
        # Workers table may not exist yet — create on demand
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workers (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT,
                email TEXT, phone TEXT, screening_clearance TEXT,
                assigned_participants TEXT DEFAULT '[]',
                status TEXT DEFAULT 'active', created_at TEXT NOT NULL
            )
        """)
        rows = conn.execute("SELECT * FROM workers ORDER BY name").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/workers", status_code=201)
async def create_worker(body: dict):
    wid = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workers (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT,
                email TEXT, phone TEXT, screening_clearance TEXT,
                assigned_participants TEXT DEFAULT '[]',
                status TEXT DEFAULT 'active', created_at TEXT NOT NULL
            )
        """)
        conn.execute(
            "INSERT INTO workers VALUES (?,?,?,?,?,?,?,?,?)",
            (wid, body.get("name",""), body.get("role",""),
             body.get("email"), body.get("phone"),
             body.get("screening_clearance"), "[]", "active",
             datetime.utcnow().isoformat()),
        )
    return {"id": wid}

# ── Billing extras ────────────────────────────────────────────────────────────

@app.get("/api/billing")
async def list_billing():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT b.*, p.first_name || ' ' || p.last_name AS participant_name "
            "FROM billing_items b LEFT JOIN participants p ON b.participant_id = p.id "
            "ORDER BY b.billing_date DESC LIMIT 100"
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/billing/claims", status_code=200)
async def submit_claims(body: dict):
    item_ids = body.get("item_ids", [])
    if not item_ids:
        return {"submitted": 0}
    with get_db() as conn:
        conn.execute(
            f"UPDATE billing_items SET status='claimed' WHERE id IN ({','.join('?' for _ in item_ids)})",
            item_ids,
        )
    return {"submitted": len(item_ids)}

# ── Dashboard / App ──────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KiNDIS</h1>"
    return HTMLResponse(html)

from fastapi.responses import FileResponse

@app.get("/app/{path:path}", response_class=HTMLResponse)
@app.get("/app", response_class=HTMLResponse)
async def serve_app(path: str = ""):
    app_dir = STATIC_DIR / "app"
    if path and (app_dir / path).exists():
        return FileResponse(str(app_dir / path))
    index = app_dir / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text())
    return HTMLResponse("<h1>KiNDIS app not built yet. Run: cd app && npm install && npm run build</h1>")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
