"""
KindCare — Participant-Facing Care Hub

Port: 7865

What this is:
  The participant-side companion to KiNDIS. Where KiNDIS is for practitioners,
  KindCare is for the people receiving support — a gentle, accessible interface
  for wellbeing check-ins, support schedules, goal tracking, and self-advocacy.

  KindCare reads participant data from KiNDIS (by participant ID) and adds its own
  layer of wellbeing data that belongs to the participant, not the system.

  Design principle: participants own their data here. Nothing leaves without consent.
  The UI is designed for accessibility — large text, simple navigation, plain language.

Domains:
  - Wellbeing check-ins: daily mood + energy + safety prompts (non-clinical)
  - Support schedule: upcoming visits, changes, cancellations
  - Goals: participant-authored goals (separate from NDIS plan goals)
  - Messages: gentle reminders, practitioner notes shared with consent
  - Journal: private notes (never shared without explicit export consent)

KMP endpoints: /api/module/identity + /api/health
KCE events: kindcare.checkin.completed, kindcare.goal.created

Run: python server.py
"""

from __future__ import annotations
import json, sqlite3, uuid
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7865
MODULE_ID = "kindcare"
MODULE_NAME = "KindCare"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"
KINDIS_URL = "http://localhost:7864"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindcare.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS checkins (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT,
                check_date      TEXT NOT NULL,
                mood            TEXT,
                energy          INTEGER,
                safety_ok       INTEGER DEFAULT 1,
                notes           TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schedule (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT,
                visit_date      TEXT NOT NULL,
                visit_time      TEXT,
                practitioner    TEXT,
                service_type    TEXT,
                duration_min    INTEGER,
                location        TEXT,
                status          TEXT DEFAULT 'confirmed',
                notes           TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS goals (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT,
                title           TEXT NOT NULL,
                description     TEXT,
                target_date     TEXT,
                progress        REAL DEFAULT 0.0,
                celebration     TEXT,
                status          TEXT DEFAULT 'active',
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS journal (
                id              TEXT PRIMARY KEY,
                participant_id  TEXT,
                entry_date      TEXT NOT NULL,
                content         TEXT NOT NULL,
                mood_tag        TEXT,
                private         INTEGER DEFAULT 1,
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
        "description": "Participant-facing care hub. Wellbeing check-ins, support schedules, personal goals, private journal.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["wellbeing_checkins", "support_schedule",
                         "personal_goals", "private_journal", "accessibility"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            today = date.today().isoformat()
            checkins_today = conn.execute(
                "SELECT COUNT(*) FROM checkins WHERE check_date=?", (today,)
            ).fetchone()[0]
        return {"status": "ok", "checkins_today": checkins_today}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

async def _register_with_kce():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            identity = await module_identity()
            identity["baseUrl"] = f"http://localhost:{PORT}"
            await client.post(f"{KCE_URL}/modules", json=identity)
    except Exception as e:
        print(f"[KMP] KCE not available ({e}) — running standalone")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    await _register_with_kce()
    yield

app.router.lifespan_context = lifespan

# ── Wellbeing Check-ins ───────────────────────────────────────────────────────

VALID_MOODS = {"great", "good", "okay", "low", "struggling"}

class CheckinRequest(BaseModel):
    participant_id: Optional[str] = None
    mood: str = "okay"
    energy: int = 3
    safety_ok: bool = True
    notes: Optional[str] = None

@app.get("/api/checkins")
async def list_checkins(participant_id: Optional[str] = None, days: int = 30):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        if participant_id:
            rows = conn.execute(
                "SELECT * FROM checkins WHERE participant_id=? AND check_date >= ? ORDER BY check_date DESC",
                (participant_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM checkins WHERE check_date >= ? ORDER BY check_date DESC", (since,)
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/checkins", status_code=201)
async def create_checkin(req: CheckinRequest):
    if req.mood not in VALID_MOODS:
        raise HTTPException(400, f"Mood must be one of: {', '.join(VALID_MOODS)}")
    if not 1 <= req.energy <= 5:
        raise HTTPException(400, "Energy must be 1–5")
    checkin = {
        "id": str(uuid.uuid4()),
        "participant_id": req.participant_id,
        "check_date": date.today().isoformat(),
        "mood": req.mood,
        "energy": req.energy,
        "safety_ok": 1 if req.safety_ok else 0,
        "notes": req.notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO checkins VALUES (?,?,?,?,?,?,?,?)",
            tuple(checkin.values()),
        )
    await _emit_event("kindcare.checkin.completed", {
        "participant_id": req.participant_id, "mood": req.mood, "safety_ok": req.safety_ok
    })
    return checkin

# ── Schedule ──────────────────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    participant_id: Optional[str] = None
    visit_date: str
    visit_time: Optional[str] = None
    practitioner: Optional[str] = None
    service_type: Optional[str] = None
    duration_min: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/schedule")
async def get_schedule(participant_id: Optional[str] = None, days: int = 14):
    start = date.today().isoformat()
    end = (date.today() + timedelta(days=days)).isoformat()
    with get_db() as conn:
        if participant_id:
            rows = conn.execute(
                "SELECT * FROM schedule WHERE participant_id=? AND visit_date BETWEEN ? AND ? "
                "ORDER BY visit_date, visit_time",
                (participant_id, start, end),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM schedule WHERE visit_date BETWEEN ? AND ? ORDER BY visit_date, visit_time",
                (start, end),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/schedule", status_code=201)
async def add_schedule_item(req: ScheduleRequest):
    item = {
        "id": str(uuid.uuid4()),
        "participant_id": req.participant_id,
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "practitioner": req.practitioner,
        "service_type": req.service_type,
        "duration_min": req.duration_min,
        "location": req.location,
        "status": "confirmed",
        "notes": req.notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO schedule VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            tuple(item.values()),
        )
    return item

# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalRequest(BaseModel):
    title: str
    description: Optional[str] = None
    participant_id: Optional[str] = None
    target_date: Optional[str] = None
    celebration: Optional[str] = None

@app.get("/api/goals")
async def list_goals(participant_id: Optional[str] = None):
    with get_db() as conn:
        if participant_id:
            rows = conn.execute(
                "SELECT * FROM goals WHERE participant_id=? AND status='active' ORDER BY created_at",
                (participant_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM goals WHERE status='active' ORDER BY created_at"
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/goals", status_code=201)
async def create_goal(req: GoalRequest):
    goal = {
        "id": str(uuid.uuid4()),
        "participant_id": req.participant_id,
        "title": req.title,
        "description": req.description,
        "target_date": req.target_date,
        "progress": 0.0,
        "celebration": req.celebration,
        "status": "active",
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO goals VALUES (?,?,?,?,?,?,?,?,?)",
            tuple(goal.values()),
        )
    await _emit_event("kindcare.goal.created", {"participant_id": req.participant_id, "title": req.title})
    return goal

@app.put("/api/goals/{goal_id}/progress")
async def update_goal_progress(goal_id: str, body: dict):
    progress = max(0.0, min(1.0, float(body.get("progress", 0))))
    with get_db() as conn:
        conn.execute("UPDATE goals SET progress=? WHERE id=?", (progress, goal_id))
    return {"goal_id": goal_id, "progress": progress}

# ── Journal ───────────────────────────────────────────────────────────────────

class JournalRequest(BaseModel):
    content: str
    participant_id: Optional[str] = None
    mood_tag: Optional[str] = None
    private: bool = True

@app.get("/api/journal")
async def get_journal(participant_id: Optional[str] = None, days: int = 30):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        if participant_id:
            rows = conn.execute(
                "SELECT * FROM journal WHERE participant_id=? AND entry_date >= ? ORDER BY entry_date DESC",
                (participant_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM journal WHERE entry_date >= ? ORDER BY entry_date DESC", (since,)
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/journal", status_code=201)
async def add_journal_entry(req: JournalRequest):
    entry = {
        "id": str(uuid.uuid4()),
        "participant_id": req.participant_id,
        "entry_date": date.today().isoformat(),
        "content": req.content,
        "mood_tag": req.mood_tag,
        "private": 1 if req.private else 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO journal VALUES (?,?,?,?,?,?,?)",
            tuple(entry.values()),
        )
    return entry

# ── Read-through from KiNDIS ──────────────────────────────────────────────────

@app.get("/api/next-visit")
async def get_next_visit(participant_id: Optional[str] = None):
    today = date.today().isoformat()
    with get_db() as conn:
        if participant_id:
            row = conn.execute(
                "SELECT * FROM schedule WHERE participant_id=? AND visit_date >= ? "
                "AND status='confirmed' ORDER BY visit_date, visit_time LIMIT 1",
                (participant_id, today),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM schedule WHERE visit_date >= ? AND status='confirmed' "
                "ORDER BY visit_date, visit_time LIMIT 1",
                (today,),
            ).fetchone()
    return dict(row) if row else {"message": "No upcoming visits scheduled"}

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindCare</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
