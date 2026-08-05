"""
KindStudy — Learning and Education Support Module

Port: 7871

What this is:
  A personal study companion. Active sessions with AI Workbench as tutor,
  spaced repetition flashcards, course tracking, reading list management,
  and focus mode (pomodoro) integration.

  The KindPath framework itself is available as a built-in learning module —
  students can learn the doctrine through structured prompts.

Domains:
  - Courses: subjects and course tracking with progress
  - Sessions: timed study sessions with notes + focus mode
  - Flashcards: note → card pipeline with spaced repetition queue
  - Reading list: books, papers, articles with status tracking
  - Assignments: essay/assignment drafting with AI Workbench support
  - CSU sync: pulls assessment due dates from the student's own Interact2
    (D2L Brightspace) calendar feed — the only outbound call this module
    makes, and only to a URL the user supplies themselves via env var.

KMP endpoints: /api/module/identity + /api/health
KCE events: kindstudy.session.started, kindstudy.session.completed,
            kindstudy.flashcard.reviewed, kindstudy.assignment.completed,
            kindstudy.csu.synced

Run: python server.py
"""

from __future__ import annotations
import asyncio, json, os, re, sqlite3, uuid
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from icalendar import Calendar
from pydantic import BaseModel
import uvicorn

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7871
MODULE_ID = "kindstudy"
MODULE_NAME = "KindStudy"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

# Personal Interact2 calendar feed URL (Calendar → Subscribe in Interact2).
# Contains an auth token — keep it in .env, never commit it or log it.
CSU_ICS_FEED_URL = os.environ.get("CSU_ICS_FEED_URL")
CSU_SYNC_INTERVAL_HOURS = 6
CSU_TZ = ZoneInfo("Australia/Sydney")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindstudy.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS courses (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                subject     TEXT,
                description TEXT,
                status      TEXT DEFAULT 'active',
                progress    REAL DEFAULT 0.0,
                target_date TEXT,
                tags        TEXT DEFAULT '[]',
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                course_id   TEXT,
                title       TEXT,
                started_at  TEXT NOT NULL,
                ended_at    TEXT,
                duration_min INTEGER,
                notes       TEXT,
                session_type TEXT DEFAULT 'study',
                created_at  TEXT NOT NULL,
                FOREIGN KEY (course_id) REFERENCES courses(id)
            );

            CREATE TABLE IF NOT EXISTS flashcards (
                id              TEXT PRIMARY KEY,
                course_id       TEXT,
                front           TEXT NOT NULL,
                back            TEXT NOT NULL,
                source_note     TEXT,
                ease_factor     REAL DEFAULT 2.5,
                interval_days   INTEGER DEFAULT 1,
                next_review     TEXT,
                review_count    INTEGER DEFAULT 0,
                last_reviewed   TEXT,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (course_id) REFERENCES courses(id)
            );

            CREATE TABLE IF NOT EXISTS reading_list (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                author      TEXT,
                url         TEXT,
                source_type TEXT DEFAULT 'book',
                status      TEXT DEFAULT 'unread',
                course_id   TEXT,
                notes       TEXT,
                added_at    TEXT NOT NULL,
                FOREIGN KEY (course_id) REFERENCES courses(id)
            );

            CREATE TABLE IF NOT EXISTS assignments (
                id            TEXT PRIMARY KEY,
                course_id     TEXT,
                title         TEXT NOT NULL,
                due_date      TEXT,
                content       TEXT,
                status        TEXT DEFAULT 'draft',
                grade         TEXT,
                word_count    INTEGER DEFAULT 0,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL,
                source        TEXT DEFAULT 'manual',
                external_uid  TEXT,
                FOREIGN KEY (course_id) REFERENCES courses(id)
            );
        """)
        for column, coltype in (("grade", "TEXT"), ("source", "TEXT DEFAULT 'manual'"), ("external_uid", "TEXT")):
            try:
                conn.execute(f"ALTER TABLE assignments ADD COLUMN {column} {coltype}")
            except sqlite3.OperationalError:
                pass
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_external_uid "
            "ON assignments(external_uid) WHERE external_uid IS NOT NULL"
        )

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
        "description": "Learning and education support. Study sessions, flashcards, course tracking, AI Workbench tutor.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["study_sessions", "flashcards", "course_tracking",
                         "reading_list", "assignments", "pomodoro", "csu_sync"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            courses = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
            sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        return {"status": "ok", "courses": courses, "sessions": sessions}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}

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
    csu_task = asyncio.create_task(_csu_sync_loop()) if CSU_ICS_FEED_URL else None
    yield
    if csu_task:
        csu_task.cancel()

app.router.lifespan_context = lifespan

# ── Courses ───────────────────────────────────────────────────────────────────

class CourseRequest(BaseModel):
    name: str
    subject: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[str] = None
    tags: Optional[List[str]] = None

@app.get("/api/courses")
async def list_courses(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM courses WHERE status=? ORDER BY name", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM courses ORDER BY name").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/courses", status_code=201)
async def create_course(req: CourseRequest):
    course = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "subject": req.subject,
        "description": req.description,
        "status": "active",
        "progress": 0.0,
        "target_date": req.target_date,
        "tags": json.dumps(req.tags or []),
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO courses VALUES (?,?,?,?,?,?,?,?,?)",
            (course["id"], course["name"], course["subject"], course["description"],
             course["status"], course["progress"], course["target_date"],
             course["tags"], course["created_at"]),
        )
    return course

@app.put("/api/courses/{course_id}/progress")
async def update_progress(course_id: str, body: dict):
    progress = max(0.0, min(1.0, float(body.get("progress", 0))))
    with get_db() as conn:
        conn.execute("UPDATE courses SET progress=? WHERE id=?", (progress, course_id))
    return {"course_id": course_id, "progress": progress}

# ── Study Sessions ────────────────────────────────────────────────────────────

class SessionRequest(BaseModel):
    course_id: Optional[str] = None
    title: Optional[str] = None
    session_type: str = "study"   # study | pomodoro | review
    notes: Optional[str] = None

@app.get("/api/sessions")
async def list_sessions(course_id: Optional[str] = None, limit: int = 50):
    with get_db() as conn:
        if course_id:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE course_id=? ORDER BY started_at DESC LIMIT ?",
                (course_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,)
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/sessions/start", status_code=201)
async def start_session(req: SessionRequest):
    session = {
        "id": str(uuid.uuid4()),
        "course_id": req.course_id,
        "title": req.title,
        "started_at": datetime.utcnow().isoformat(),
        "ended_at": None,
        "duration_min": None,
        "notes": req.notes,
        "session_type": req.session_type,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)",
            (session["id"], session["course_id"], session["title"],
             session["started_at"], session["ended_at"], session["duration_min"],
             session["notes"], session["session_type"], session["created_at"]),
        )
    await _emit_event("kindstudy.session.started", {"id": session["id"], "type": req.session_type})
    return session

@app.post("/api/sessions/{session_id}/end")
async def end_session(session_id: str, body: dict = None):
    body = body or {}
    ended_at = datetime.utcnow().isoformat()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")
        started = datetime.fromisoformat(row["started_at"])
        duration_min = int((datetime.utcnow() - started).total_seconds() / 60)
        conn.execute(
            "UPDATE sessions SET ended_at=?, duration_min=?, notes=COALESCE(?, notes) WHERE id=?",
            (ended_at, duration_min, body.get("notes"), session_id),
        )
    await _emit_event("kindstudy.session.completed", {"id": session_id, "duration_min": duration_min})
    return {"session_id": session_id, "ended_at": ended_at, "duration_min": duration_min}

# ── Flashcards ────────────────────────────────────────────────────────────────

class FlashcardRequest(BaseModel):
    front: str
    back: str
    course_id: Optional[str] = None
    source_note: Optional[str] = None

@app.get("/api/flashcards")
async def list_flashcards(course_id: Optional[str] = None):
    with get_db() as conn:
        if course_id:
            rows = conn.execute("SELECT * FROM flashcards WHERE course_id=?", (course_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM flashcards").fetchall()
    return [dict(r) for r in rows]

@app.get("/api/flashcards/due")
async def get_due_cards(limit: int = 20):
    """Return cards due for review today (spaced repetition queue)."""
    today = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM flashcards WHERE next_review IS NULL OR next_review <= ? ORDER BY RANDOM() LIMIT ?",
            (today, limit),
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/flashcards", status_code=201)
async def create_flashcard(req: FlashcardRequest):
    card = {
        "id": str(uuid.uuid4()),
        "course_id": req.course_id,
        "front": req.front,
        "back": req.back,
        "source_note": req.source_note,
        "ease_factor": 2.5,
        "interval_days": 1,
        "next_review": date.today().isoformat(),
        "review_count": 0,
        "last_reviewed": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO flashcards VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (card["id"], card["course_id"], card["front"], card["back"],
             card["source_note"], card["ease_factor"], card["interval_days"],
             card["next_review"], card["review_count"], card["last_reviewed"],
             card["created_at"]),
        )
    return card

@app.post("/api/flashcards/{card_id}/review")
async def review_card(card_id: str, body: dict):
    """
    Record a review. quality: 0 (forgot) – 5 (perfect).
    Uses SM-2 algorithm for interval scheduling.
    """
    quality = int(body.get("quality", 3))
    with get_db() as conn:
        row = conn.execute("SELECT * FROM flashcards WHERE id=?", (card_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Card not found")
        ef = float(row["ease_factor"])
        interval = int(row["interval_days"])
        count = int(row["review_count"])

        # SM-2 algorithm
        ef = max(1.3, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        if quality < 3:
            interval = 1
        elif count == 0:
            interval = 1
        elif count == 1:
            interval = 6
        else:
            interval = round(interval * ef)

        next_review = (date.today() + timedelta(days=interval)).isoformat()
        conn.execute(
            "UPDATE flashcards SET ease_factor=?, interval_days=?, next_review=?, review_count=review_count+1, last_reviewed=? WHERE id=?",
            (ef, interval, next_review, date.today().isoformat(), card_id),
        )
    await _emit_event("kindstudy.flashcard.reviewed", {"id": card_id, "quality": quality, "next_review": next_review})
    return {"card_id": card_id, "next_review": next_review, "interval_days": interval}

# ── Reading List ──────────────────────────────────────────────────────────────

class ReadingRequest(BaseModel):
    title: str
    author: Optional[str] = None
    url: Optional[str] = None
    source_type: str = "book"
    course_id: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/reading")
async def list_reading(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM reading_list WHERE status=? ORDER BY added_at DESC", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM reading_list ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/reading", status_code=201)
async def add_reading(req: ReadingRequest):
    item = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "author": req.author,
        "url": req.url,
        "source_type": req.source_type,
        "status": "unread",
        "course_id": req.course_id,
        "notes": req.notes,
        "added_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO reading_list VALUES (?,?,?,?,?,?,?,?,?)",
            (item["id"], item["title"], item["author"], item["url"],
             item["source_type"], item["status"], item["course_id"],
             item["notes"], item["added_at"]),
        )
    return item

@app.put("/api/reading/{item_id}/status")
async def update_reading_status(item_id: str, body: dict):
    status = body.get("status", "reading")
    with get_db() as conn:
        conn.execute("UPDATE reading_list SET status=? WHERE id=?", (status, item_id))
    return {"item_id": item_id, "status": status}

# ── Assignments ───────────────────────────────────────────────────────────────

class AssignmentRequest(BaseModel):
    title: str
    course_id: Optional[str] = None
    due_date: Optional[str] = None
    content: Optional[str] = None

@app.get("/api/assignments")
async def list_assignments(course_id: Optional[str] = None, status: Optional[str] = None):
    query = "SELECT * FROM assignments WHERE 1=1"
    params: List[Any] = []
    if course_id:
        query += " AND course_id=?"
        params.append(course_id)
    if status:
        query += " AND status=?"
        params.append(status)
    query += " ORDER BY (due_date IS NULL), due_date"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/assignments", status_code=201)
async def create_assignment(req: AssignmentRequest):
    now = datetime.utcnow().isoformat()
    assignment = {
        "id": str(uuid.uuid4()),
        "course_id": req.course_id,
        "title": req.title,
        "due_date": req.due_date,
        "content": req.content,
        "status": "draft",
        "grade": None,
        "word_count": len((req.content or "").split()) if req.content else 0,
        "created_at": now,
        "updated_at": now,
        "source": "manual",
        "external_uid": None,
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (assignment["id"], assignment["course_id"], assignment["title"],
             assignment["due_date"], assignment["content"], assignment["status"],
             assignment["grade"], assignment["word_count"], assignment["created_at"],
             assignment["updated_at"], assignment["source"], assignment["external_uid"]),
        )
    return assignment

@app.put("/api/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, body: dict):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM assignments WHERE id=?", (assignment_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Assignment not found")

        status = body.get("status", row["status"])
        content = body.get("content", row["content"])
        grade = body.get("grade", row["grade"])
        due_date = body.get("due_date", row["due_date"])
        word_count = len(content.split()) if content else 0

        conn.execute(
            "UPDATE assignments SET status=?, content=?, grade=?, due_date=?, word_count=?, updated_at=? WHERE id=?",
            (status, content, grade, due_date, word_count, datetime.utcnow().isoformat(), assignment_id),
        )
    if status in ("done", "completed", "submitted") and row["status"] not in ("done", "completed", "submitted"):
        await _emit_event("kindstudy.assignment.completed", {"id": assignment_id, "title": row["title"]})
    return {"assignment_id": assignment_id, "status": status, "grade": grade}

# ── CSU Feed Sync ─────────────────────────────────────────────────────────────
# Pulls assessment due dates from the student's own Interact2 (D2L Brightspace)
# calendar feed. Interact2 mixes timetable/event noise into the same feed, so
# we only import VEVENTs whose SUMMARY marks them as an actual due date —
# D2L appends "- Due" to those titles (e.g. "Assessment item 1 - Essay - Due").

_csu_sync_state: Dict[str, Any] = {
    "last_sync": None,
    "last_created": 0,
    "last_updated": 0,
    "last_skipped": 0,
    "last_error": None,
}

def _is_due_event(summary: str) -> bool:
    return bool(summary) and summary.strip().lower().endswith("due")

def _clean_title(summary: str) -> str:
    return re.sub(r"\s*[-–—]\s*due\s*$", "", summary.strip(), flags=re.IGNORECASE).strip()

def _due_date_from_ical(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(CSU_TZ).date().isoformat()
    return dt.isoformat()  # date-only (all-day) event

def _get_or_create_course(conn, name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    row = conn.execute("SELECT id FROM courses WHERE name=?", (name,)).fetchone()
    if row:
        return row["id"]
    course_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO courses VALUES (?,?,?,?,?,?,?,?,?)",
        (course_id, name, None, None, "active", 0.0, None, "[]", datetime.utcnow().isoformat()),
    )
    return course_id

async def sync_csu_feed() -> dict:
    if not CSU_ICS_FEED_URL:
        raise RuntimeError("CSU_ICS_FEED_URL is not configured")

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(CSU_ICS_FEED_URL)
        resp.raise_for_status()
    cal = Calendar.from_ical(resp.content)

    created = updated = skipped = 0
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        for component in cal.walk("VEVENT"):
            summary = str(component.get("SUMMARY", ""))
            if not _is_due_event(summary):
                skipped += 1
                continue
            uid = str(component.get("UID", "")) or None
            if not uid:
                skipped += 1
                continue

            dtstart = component.get("DTSTART")
            due_date = _due_date_from_ical(dtstart.dt if dtstart else None)
            title = _clean_title(summary)
            course_id = _get_or_create_course(conn, str(component.get("LOCATION", "")).strip() or None)
            description = str(component.get("DESCRIPTION", "")) or None

            existing = conn.execute(
                "SELECT id FROM assignments WHERE external_uid=?", (uid,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE assignments SET title=?, course_id=?, due_date=?, content=?, "
                    "word_count=?, updated_at=? WHERE id=?",
                    (title, course_id, due_date, description,
                     len((description or "").split()), now, existing["id"]),
                )
                updated += 1
            else:
                conn.execute(
                    "INSERT INTO assignments VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (str(uuid.uuid4()), course_id, title, due_date, description,
                     "draft", None, len((description or "").split()), now, now,
                     "csu", uid),
                )
                created += 1

    _csu_sync_state.update(last_sync=now, last_created=created, last_updated=updated,
                            last_skipped=skipped, last_error=None)
    return {"created": created, "updated": updated, "skipped": skipped}

@app.get("/api/csu/status")
async def csu_status():
    return {"configured": bool(CSU_ICS_FEED_URL), **_csu_sync_state}

@app.post("/api/csu/sync")
async def csu_sync():
    if not CSU_ICS_FEED_URL:
        raise HTTPException(400, "CSU_ICS_FEED_URL is not configured — set it in .env")
    try:
        result = await sync_csu_feed()
    except Exception as e:
        _csu_sync_state["last_error"] = str(e)
        raise HTTPException(502, f"CSU sync failed: {e}")
    await _emit_event("kindstudy.csu.synced", result)
    return result

async def _csu_sync_loop():
    while True:
        try:
            result = await sync_csu_feed()
            print(f"[KindStudy] CSU feed synced: {result}")
            await _emit_event("kindstudy.csu.synced", result)
        except Exception as e:
            _csu_sync_state["last_error"] = str(e)
            print(f"[KindStudy] CSU sync failed: {e}")
        await asyncio.sleep(CSU_SYNC_INTERVAL_HOURS * 3600)

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindStudy</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
