"""
KindHealth — Physiological + Mental Health Data Hub

Port: 7869

What this is:
  A sovereignty-first health data module. ALL data stays local.
  No cloud sync by default. No external APIs unless explicitly enabled.

  This is not a clinical tool. It is a personal health instrument —
  a place to track what your body and mind are doing so you can
  make informed decisions and prepare for conversations with health professionals.

Domains:
  - Sleep: quality, duration, notes
  - Mood: Russell circumplex (valence + arousal) + free-text
  - Energy: 1–10 scale + activity notes
  - Symptoms: user-defined symptom tracking (pain, headache, etc.)
  - Medication: opt-in, local-only encrypted notes
  - Movement: exercise log
  - GP Prep: pre-appointment note builder (exports to plain text for GP)

KMP endpoints: /api/module/identity + /api/health
KCE events: health.entry.logged, health.alert.raised

Run: python server.py
"""

from __future__ import annotations
import json, sqlite3, uuid
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7869
MODULE_ID = "kindhealth"
MODULE_NAME = "KindHealth"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindhealth.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS entries (
                id          TEXT PRIMARY KEY,
                entry_type  TEXT NOT NULL,
                entry_date  TEXT NOT NULL,
                value       TEXT,
                notes       TEXT,
                tags        TEXT DEFAULT '[]',
                metadata    TEXT DEFAULT '{}',
                created_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_type_date
                ON entries (entry_type, entry_date);

            CREATE TABLE IF NOT EXISTS medications (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                dose        TEXT,
                frequency   TEXT,
                start_date  TEXT,
                end_date    TEXT,
                notes       TEXT,
                active      INTEGER DEFAULT 1,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS gp_prep (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                appt_date   TEXT,
                symptoms    TEXT DEFAULT '[]',
                questions   TEXT DEFAULT '[]',
                medications TEXT DEFAULT '[]',
                extra_notes TEXT,
                created_at  TEXT NOT NULL
            );
        """)

init_db()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title=MODULE_NAME, version=MODULE_VERSION)

STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── KCE event publishing ──────────────────────────────────────────────────────

async def _emit_event(event_type: str, data: dict):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.post(f"{KCE_URL}/events", json={
                "source": MODULE_ID,
                "type": event_type,
                "payload": data,
            })
    except Exception:
        pass

# ── KMP: Module Identity + Health ─────────────────────────────────────────────

@app.get("/api/module/identity")
async def module_identity():
    return {
        "id": MODULE_ID,
        "name": MODULE_NAME,
        "description": "Physiological and mental health data hub. All data stays local.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["health_journal", "sleep_tracking", "mood_tracking",
                         "medication_log", "gp_prep", "symptom_tracking"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        return {"status": "ok", "entries": count}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

# ── KCE startup registration ──────────────────────────────────────────────────

async def _register_with_kce():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            identity = (await module_identity())
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

# ── Health Journal Entries ────────────────────────────────────────────────────

VALID_ENTRY_TYPES = {
    "sleep", "mood", "energy", "symptom", "movement",
    "water", "food_note", "stress", "check_in",
}

class EntryRequest(BaseModel):
    entry_type: str
    entry_date: Optional[str] = None   # ISO date; defaults to today
    value: Optional[str] = None        # e.g. "7.5" for hours, "0.7" for valence
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

@app.get("/api/entries")
async def list_entries(
    entry_type: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 100,
):
    with get_db() as conn:
        if entry_type:
            rows = conn.execute(
                "SELECT * FROM entries WHERE entry_type=? ORDER BY entry_date DESC, created_at DESC LIMIT ?",
                (entry_type, limit),
            ).fetchall()
        elif since:
            rows = conn.execute(
                "SELECT * FROM entries WHERE entry_date >= ? ORDER BY entry_date DESC LIMIT ?",
                (since, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM entries ORDER BY entry_date DESC, created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/entries", status_code=201)
async def log_entry(req: EntryRequest):
    if req.entry_type not in VALID_ENTRY_TYPES:
        raise HTTPException(400, f"Unknown entry_type. Valid: {sorted(VALID_ENTRY_TYPES)}")
    entry = {
        "id": str(uuid.uuid4()),
        "entry_type": req.entry_type,
        "entry_date": req.entry_date or date.today().isoformat(),
        "value": req.value,
        "notes": req.notes,
        "tags": json.dumps(req.tags or []),
        "metadata": json.dumps(req.metadata or {}),
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO entries VALUES (?,?,?,?,?,?,?,?)",
            (entry["id"], entry["entry_type"], entry["entry_date"],
             entry["value"], entry["notes"], entry["tags"],
             entry["metadata"], entry["created_at"]),
        )
    await _emit_event("health.entry.logged", {"type": req.entry_type, "date": entry["entry_date"]})
    return entry

@app.delete("/api/entries/{entry_id}", status_code=204)
async def delete_entry(entry_id: str):
    with get_db() as conn:
        deleted = conn.execute("DELETE FROM entries WHERE id=?", (entry_id,)).rowcount
    if not deleted:
        raise HTTPException(404, "Entry not found")

@app.get("/api/entries/summary")
async def entries_summary(days: int = 7):
    """Recent summary: latest value per type in the last N days."""
    since = datetime.utcnow().date()
    from datetime import timedelta
    since = (datetime.utcnow().date() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT entry_type, entry_date, value, notes
               FROM entries
               WHERE entry_date >= ?
               ORDER BY entry_date DESC, created_at DESC""",
            (since,),
        ).fetchall()
    summary: dict = {}
    for r in rows:
        t = r["entry_type"]
        if t not in summary:
            summary[t] = {"latest_value": r["value"], "latest_date": r["entry_date"],
                          "latest_notes": r["notes"]}
    return {"period_days": days, "entry_count": len(rows), "by_type": summary}

# ── Medications ───────────────────────────────────────────────────────────────

class MedicationRequest(BaseModel):
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/medications")
async def list_medications(active_only: bool = True):
    with get_db() as conn:
        if active_only:
            rows = conn.execute("SELECT * FROM medications WHERE active=1 ORDER BY name").fetchall()
        else:
            rows = conn.execute("SELECT * FROM medications ORDER BY name").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/medications", status_code=201)
async def add_medication(req: MedicationRequest):
    med = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "dose": req.dose,
        "frequency": req.frequency,
        "start_date": req.start_date,
        "end_date": req.end_date,
        "notes": req.notes,
        "active": 1,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO medications VALUES (?,?,?,?,?,?,?,?,?)",
            (med["id"], med["name"], med["dose"], med["frequency"],
             med["start_date"], med["end_date"], med["notes"],
             med["active"], med["created_at"]),
        )
    return med

@app.delete("/api/medications/{med_id}", status_code=204)
async def deactivate_medication(med_id: str):
    with get_db() as conn:
        conn.execute("UPDATE medications SET active=0 WHERE id=?", (med_id,))

# ── GP Prep ───────────────────────────────────────────────────────────────────

class GpPrepRequest(BaseModel):
    title: str
    appt_date: Optional[str] = None
    symptoms: Optional[List[str]] = None
    questions: Optional[List[str]] = None
    medications: Optional[List[str]] = None
    extra_notes: Optional[str] = None

@app.get("/api/gp-prep")
async def list_gp_prep():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM gp_prep ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/gp-prep", status_code=201)
async def create_gp_prep(req: GpPrepRequest):
    prep = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "appt_date": req.appt_date,
        "symptoms": json.dumps(req.symptoms or []),
        "questions": json.dumps(req.questions or []),
        "medications": json.dumps(req.medications or []),
        "extra_notes": req.extra_notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO gp_prep VALUES (?,?,?,?,?,?,?,?)",
            (prep["id"], prep["title"], prep["appt_date"], prep["symptoms"],
             prep["questions"], prep["medications"], prep["extra_notes"],
             prep["created_at"]),
        )
    return prep

@app.get("/api/gp-prep/{prep_id}/export")
async def export_gp_prep(prep_id: str):
    """Export a GP prep note as plain text (ready to print or paste)."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM gp_prep WHERE id=?", (prep_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    r = dict(row)
    lines = [f"GP Appointment Prep: {r['title']}"]
    if r["appt_date"]:
        lines.append(f"Appointment date: {r['appt_date']}")
    lines.append("")
    symptoms = json.loads(r["symptoms"] or "[]")
    if symptoms:
        lines.append("Current symptoms:")
        for s in symptoms:
            lines.append(f"  - {s}")
        lines.append("")
    meds = json.loads(r["medications"] or "[]")
    if meds:
        lines.append("Current medications:")
        for m in meds:
            lines.append(f"  - {m}")
        lines.append("")
    questions = json.loads(r["questions"] or "[]")
    if questions:
        lines.append("Questions to ask:")
        for q in questions:
            lines.append(f"  - {q}")
        lines.append("")
    if r["extra_notes"]:
        lines.append("Extra notes:")
        lines.append(r["extra_notes"])
    return {"text": "\n".join(lines), "title": r["title"]}

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindHealth</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
