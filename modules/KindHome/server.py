"""
KindHome — Household Management Module

Port: 7866

What this is:
  Household management and life admin support. Tasks, bills, shopping lists,
  household roster, and daily routine tracking.

  Designed for people who need structure support with home life — whether that
  is managing bill stress, overwhelm around chores, or just needing a clear
  picture of what the household needs this week.

  Connects to KindHealth: sleep and stress inputs from KindHealth can surface
  here as "low energy mode" to simplify the task display.

Domains:
  - Tasks: household chores, errands, home maintenance
  - Bills: recurring payments, due dates, paid/unpaid status, budget
  - Shopping: lists by category, shared household shopping
  - Routine: daily and weekly routine templates
  - Household: roster of household members for task assignment

KMP endpoints: /api/module/identity + /api/health
KCE events: kindhome.task.completed, kindhome.bill.paid

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

PORT = 7866
MODULE_ID = "kindhome"
MODULE_NAME = "KindHome"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindhome.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                category    TEXT DEFAULT 'general',
                due_date    TEXT,
                assigned_to TEXT,
                priority    TEXT DEFAULT 'medium',
                status      TEXT DEFAULT 'pending',
                recurring   TEXT,
                notes       TEXT,
                created_at  TEXT NOT NULL,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS bills (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                amount      REAL,
                due_date    TEXT,
                due_day     INTEGER,
                frequency   TEXT DEFAULT 'monthly',
                category    TEXT DEFAULT 'utilities',
                status      TEXT DEFAULT 'unpaid',
                paid_at     TEXT,
                notes       TEXT,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shopping (
                id          TEXT PRIMARY KEY,
                item        TEXT NOT NULL,
                category    TEXT DEFAULT 'groceries',
                quantity    TEXT DEFAULT '1',
                list_name   TEXT DEFAULT 'main',
                added_by    TEXT,
                status      TEXT DEFAULT 'needed',
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS household (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                role        TEXT DEFAULT 'member',
                active      INTEGER DEFAULT 1,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS routine_items (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                frequency   TEXT DEFAULT 'daily',
                time_of_day TEXT DEFAULT 'morning',
                assigned_to TEXT,
                active      INTEGER DEFAULT 1,
                created_at  TEXT NOT NULL
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
        "description": "Household management. Tasks, bills, shopping, routine support, household roster.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["tasks", "bills", "shopping_lists", "routine", "household_roster"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            pending = conn.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'").fetchone()[0]
            overdue = conn.execute(
                "SELECT COUNT(*) FROM bills WHERE status='unpaid' AND due_date < ?",
                (date.today().isoformat(),),
            ).fetchone()[0]
        return {"status": "ok", "pending_tasks": pending, "overdue_bills": overdue}
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

# ── Tasks ─────────────────────────────────────────────────────────────────────

class TaskRequest(BaseModel):
    title: str
    category: str = "general"
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: str = "medium"
    recurring: Optional[str] = None
    notes: Optional[str] = None

@app.get("/api/tasks")
async def list_tasks(status: str = "pending", category: Optional[str] = None):
    with get_db() as conn:
        if category:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE status=? AND category=? ORDER BY due_date NULLS LAST, priority DESC",
                (status, category),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE status=? ORDER BY due_date NULLS LAST",
                (status,),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/tasks", status_code=201)
async def create_task(req: TaskRequest):
    task = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "category": req.category,
        "due_date": req.due_date,
        "assigned_to": req.assigned_to,
        "priority": req.priority,
        "status": "pending",
        "recurring": req.recurring,
        "notes": req.notes,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            tuple(task.values()),
        )
    return task

@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Task not found")
        conn.execute(
            "UPDATE tasks SET status='done', completed_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), task_id),
        )
        # If recurring, create next occurrence
        if row["recurring"]:
            next_due = None
            if row["recurring"] == "daily" and row["due_date"]:
                next_due = (date.fromisoformat(row["due_date"]) + timedelta(days=1)).isoformat()
            elif row["recurring"] == "weekly" and row["due_date"]:
                next_due = (date.fromisoformat(row["due_date"]) + timedelta(weeks=1)).isoformat()
            new_task = (
                str(uuid.uuid4()), row["title"], row["category"], next_due,
                row["assigned_to"], row["priority"], "pending",
                row["recurring"], row["notes"],
                datetime.utcnow().isoformat(), None,
            )
            conn.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)", new_task)
    await _emit_event("kindhome.task.completed", {"task_id": task_id})
    return {"task_id": task_id, "status": "done"}

# ── Bills ─────────────────────────────────────────────────────────────────────

class BillRequest(BaseModel):
    name: str
    amount: Optional[float] = None
    due_date: Optional[str] = None
    due_day: Optional[int] = None
    frequency: str = "monthly"
    category: str = "utilities"
    notes: Optional[str] = None

@app.get("/api/bills")
async def list_bills(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM bills WHERE status=? ORDER BY due_date NULLS LAST",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM bills ORDER BY due_date NULLS LAST").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/bills", status_code=201)
async def add_bill(req: BillRequest):
    bill = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "amount": req.amount,
        "due_date": req.due_date,
        "due_day": req.due_day,
        "frequency": req.frequency,
        "category": req.category,
        "status": "unpaid",
        "paid_at": None,
        "notes": req.notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO bills VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            tuple(bill.values()),
        )
    return bill

@app.post("/api/bills/{bill_id}/pay")
async def mark_bill_paid(bill_id: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE bills SET status='paid', paid_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), bill_id),
        )
    await _emit_event("kindhome.bill.paid", {"bill_id": bill_id})
    return {"bill_id": bill_id, "status": "paid"}

# ── Shopping ──────────────────────────────────────────────────────────────────

class ShoppingRequest(BaseModel):
    item: str
    category: str = "groceries"
    quantity: str = "1"
    list_name: str = "main"
    added_by: Optional[str] = None

@app.get("/api/shopping")
async def get_shopping(list_name: str = "main", status: str = "needed"):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM shopping WHERE list_name=? AND status=? ORDER BY category, item",
            (list_name, status),
        ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/shopping", status_code=201)
async def add_shopping_item(req: ShoppingRequest):
    item = {
        "id": str(uuid.uuid4()),
        "item": req.item,
        "category": req.category,
        "quantity": req.quantity,
        "list_name": req.list_name,
        "added_by": req.added_by,
        "status": "needed",
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO shopping VALUES (?,?,?,?,?,?,?,?)",
            tuple(item.values()),
        )
    return item

@app.post("/api/shopping/{item_id}/got")
async def mark_shopping_got(item_id: str):
    with get_db() as conn:
        conn.execute("UPDATE shopping SET status='got' WHERE id=?", (item_id,))
    return {"item_id": item_id, "status": "got"}

@app.delete("/api/shopping/clear-got")
async def clear_got_items(list_name: str = "main"):
    with get_db() as conn:
        conn.execute("DELETE FROM shopping WHERE list_name=? AND status='got'", (list_name,))
    return {"cleared": True}

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindHome</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
