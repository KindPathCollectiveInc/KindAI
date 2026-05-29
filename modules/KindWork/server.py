"""
KindWork — Employment and Work Support Module

Port: 7867

What this is:
  Work and employment support — job applications, freelance project tracking,
  timesheets, income tracking, and career wellbeing. Extracted and extended
  from ai-workbench/missions/opportunity_scout.py.

  For people navigating the job market, freelancing, or managing work-life
  boundary stress. Not a corporate HR tool — a personal work companion that
  supports the human doing the work.

  Connects to KindHealth (work stress, burnout signals) and KindBiz
  (for freelancers who blur the personal/business boundary).

Domains:
  - Applications: job tracking with status pipeline
  - Projects: freelance/contract project management
  - Timesheets: hours worked per project/client
  - Income: expected and received income tracking
  - Opportunities: prospect tracking from community/sector research

KMP endpoints: /api/module/identity + /api/health
KCE events: kindwork.application.updated, kindwork.project.completed, kindwork.timesheet.logged

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

PORT = 7867
MODULE_ID = "kindwork"
MODULE_NAME = "KindWork"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindwork.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS applications (
                id              TEXT PRIMARY KEY,
                role_title      TEXT NOT NULL,
                employer        TEXT,
                location        TEXT,
                job_type        TEXT DEFAULT 'full_time',
                salary_range    TEXT,
                status          TEXT DEFAULT 'drafting',
                applied_date    TEXT,
                response_date   TEXT,
                interview_date  TEXT,
                notes           TEXT,
                job_url         TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                client          TEXT,
                project_type    TEXT DEFAULT 'freelance',
                rate_type       TEXT DEFAULT 'hourly',
                rate            REAL,
                budget          REAL,
                status          TEXT DEFAULT 'active',
                start_date      TEXT,
                end_date        TEXT,
                description     TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS timesheets (
                id              TEXT PRIMARY KEY,
                project_id      TEXT NOT NULL,
                work_date       TEXT NOT NULL,
                hours           REAL NOT NULL,
                description     TEXT,
                billable        INTEGER DEFAULT 1,
                invoiced        INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS income (
                id              TEXT PRIMARY KEY,
                project_id      TEXT,
                description     TEXT NOT NULL,
                amount          REAL NOT NULL,
                expected_date   TEXT,
                received_date   TEXT,
                status          TEXT DEFAULT 'expected',
                category        TEXT DEFAULT 'project_payment',
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS opportunities (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                organisation    TEXT,
                sector          TEXT,
                source          TEXT,
                url             TEXT,
                deadline        TEXT,
                relevance_score REAL DEFAULT 0.5,
                status          TEXT DEFAULT 'new',
                notes           TEXT,
                found_at        TEXT NOT NULL
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
        "description": "Work and employment support. Job applications, freelance projects, timesheets, income tracking.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["job_applications", "freelance_projects", "timesheets",
                         "income_tracking", "opportunity_scout"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            active_apps = conn.execute(
                "SELECT COUNT(*) FROM applications WHERE status NOT IN ('rejected', 'withdrawn', 'accepted')"
            ).fetchone()[0]
            active_projects = conn.execute(
                "SELECT COUNT(*) FROM projects WHERE status='active'"
            ).fetchone()[0]
        return {"status": "ok", "active_applications": active_apps, "active_projects": active_projects}
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

# ── Job Applications ──────────────────────────────────────────────────────────

APPLICATION_STATUSES = ["drafting", "applied", "screening", "interviewing", "offer", "accepted", "rejected", "withdrawn"]

class ApplicationRequest(BaseModel):
    role_title: str
    employer: Optional[str] = None
    location: Optional[str] = None
    job_type: str = "full_time"
    salary_range: Optional[str] = None
    applied_date: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/applications")
async def list_applications(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM applications WHERE status=? ORDER BY updated_at DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM applications ORDER BY updated_at DESC"
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/applications", status_code=201)
async def create_application(req: ApplicationRequest):
    now = datetime.utcnow().isoformat()
    app_obj = {
        "id": str(uuid.uuid4()),
        "role_title": req.role_title,
        "employer": req.employer,
        "location": req.location,
        "job_type": req.job_type,
        "salary_range": req.salary_range,
        "status": "drafting",
        "applied_date": req.applied_date,
        "response_date": None,
        "interview_date": None,
        "notes": req.notes,
        "job_url": req.job_url,
        "created_at": now,
        "updated_at": now,
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO applications VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(app_obj.values()),
        )
    return app_obj

@app.put("/api/applications/{app_id}/status")
async def update_application_status(app_id: str, body: dict):
    status = body.get("status")
    if status not in APPLICATION_STATUSES:
        raise HTTPException(400, f"Status must be one of: {', '.join(APPLICATION_STATUSES)}")
    with get_db() as conn:
        conn.execute(
            "UPDATE applications SET status=?, updated_at=? WHERE id=?",
            (status, datetime.utcnow().isoformat(), app_id),
        )
    await _emit_event("kindwork.application.updated", {"app_id": app_id, "status": status})
    return {"app_id": app_id, "status": status}

# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectRequest(BaseModel):
    name: str
    client: Optional[str] = None
    project_type: str = "freelance"
    rate_type: str = "hourly"
    rate: Optional[float] = None
    budget: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None

@app.get("/api/projects")
async def list_projects(status: str = "active"):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM projects WHERE status=? ORDER BY name", (status,)
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/projects", status_code=201)
async def create_project(req: ProjectRequest):
    project = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "client": req.client,
        "project_type": req.project_type,
        "rate_type": req.rate_type,
        "rate": req.rate,
        "budget": req.budget,
        "status": "active",
        "start_date": req.start_date or date.today().isoformat(),
        "end_date": req.end_date,
        "description": req.description,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(project.values()),
        )
    return project

# ── Timesheets ────────────────────────────────────────────────────────────────

class TimesheetRequest(BaseModel):
    project_id: str
    hours: float
    description: Optional[str] = None
    work_date: Optional[str] = None
    billable: bool = True

@app.get("/api/timesheets")
async def list_timesheets(project_id: Optional[str] = None, days: int = 30):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        if project_id:
            rows = conn.execute(
                "SELECT t.*, p.name as project_name FROM timesheets t "
                "JOIN projects p ON t.project_id = p.id "
                "WHERE t.project_id=? AND t.work_date >= ? ORDER BY t.work_date DESC",
                (project_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT t.*, p.name as project_name FROM timesheets t "
                "JOIN projects p ON t.project_id = p.id "
                "WHERE t.work_date >= ? ORDER BY t.work_date DESC",
                (since,),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/timesheets", status_code=201)
async def log_timesheet(req: TimesheetRequest):
    entry = {
        "id": str(uuid.uuid4()),
        "project_id": req.project_id,
        "work_date": req.work_date or date.today().isoformat(),
        "hours": req.hours,
        "description": req.description,
        "billable": 1 if req.billable else 0,
        "invoiced": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO timesheets VALUES (?,?,?,?,?,?,?,?)",
            tuple(entry.values()),
        )
    await _emit_event("kindwork.timesheet.logged", {
        "project_id": req.project_id, "hours": req.hours
    })
    return entry

@app.get("/api/timesheets/summary")
async def timesheet_summary(days: int = 30):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT t.project_id, p.name as project_name, p.rate, p.rate_type, "
            "SUM(t.hours) as total_hours "
            "FROM timesheets t JOIN projects p ON t.project_id = p.id "
            "WHERE t.work_date >= ? GROUP BY t.project_id",
            (since,),
        ).fetchall()
    by_project = []
    total_hours = 0.0
    total_value = 0.0
    for r in rows:
        d = dict(r)
        if d["rate"] and d["rate_type"] == "hourly":
            d["estimated_value"] = round(d["total_hours"] * d["rate"], 2)
            total_value += d["estimated_value"]
        total_hours += d.get("total_hours") or 0
        by_project.append(d)
    return {
        "period_days": days,
        "total_hours": round(total_hours, 2),
        "total_estimated_value": round(total_value, 2),
        "by_project": by_project,
    }

# ── Opportunities ─────────────────────────────────────────────────────────────

class OpportunityRequest(BaseModel):
    title: str
    organisation: Optional[str] = None
    sector: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None
    deadline: Optional[str] = None
    relevance_score: float = 0.5
    notes: Optional[str] = None

@app.get("/api/opportunities")
async def list_opportunities(status: str = "new"):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM opportunities WHERE status=? ORDER BY relevance_score DESC, found_at DESC",
            (status,),
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/opportunities", status_code=201)
async def add_opportunity(req: OpportunityRequest):
    opp = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "organisation": req.organisation,
        "sector": req.sector,
        "source": req.source,
        "url": req.url,
        "deadline": req.deadline,
        "relevance_score": req.relevance_score,
        "status": "new",
        "notes": req.notes,
        "found_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO opportunities VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            tuple(opp.values()),
        )
    return opp

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindWork</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
