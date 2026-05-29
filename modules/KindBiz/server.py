"""
KindBiz — Business Operations Module

Port: 7868

What this is:
  Business management for independent operators, sole traders, and small
  organisations within the KindPath ecosystem. CRM, invoicing, financial
  tracking, and business insight.

  Extracted and extended from ai-workbench/crm/crm.py and ai-workbench/finance/bank_import.py.

  Not a corporate accounting system. A clear-eyed view of the business:
  who owes what, who you need to follow up, where the money is, what's working.

  Connects to KindWork (for freelancers), KindPath BMR (for benevolence scoring
  if configured), and AI Workbench (for business advice prompting).

Domains:
  - Contacts/CRM: clients, leads, partners with relationship history
  - Invoices: invoice generation, sent/paid/overdue tracking
  - Transactions: income and expense recording (bookkeeping lite)
  - Pipeline: sales/engagement pipeline with stages
  - Insights: revenue trend, overdue summary, follow-up reminders

KMP endpoints: /api/module/identity + /api/health
KCE events: kindbiz.invoice.sent, kindbiz.invoice.paid, kindbiz.contact.created

Run: python server.py
"""

from __future__ import annotations
import json, sqlite3, uuid
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7868
MODULE_ID = "kindbiz"
MODULE_NAME = "KindBiz"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "kindbiz.db"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS contacts (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                email           TEXT,
                phone           TEXT,
                organisation    TEXT,
                contact_type    TEXT DEFAULT 'client',
                status          TEXT DEFAULT 'active',
                tags            TEXT DEFAULT '[]',
                notes           TEXT,
                last_contact    TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id              TEXT PRIMARY KEY,
                invoice_number  TEXT UNIQUE,
                contact_id      TEXT,
                client_name     TEXT NOT NULL,
                issue_date      TEXT NOT NULL,
                due_date        TEXT,
                items           TEXT DEFAULT '[]',
                subtotal        REAL DEFAULT 0,
                tax_rate        REAL DEFAULT 0,
                total           REAL DEFAULT 0,
                status          TEXT DEFAULT 'draft',
                sent_at         TEXT,
                paid_at         TEXT,
                notes           TEXT,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (contact_id) REFERENCES contacts(id)
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id              TEXT PRIMARY KEY,
                transaction_date TEXT NOT NULL,
                description     TEXT NOT NULL,
                amount          REAL NOT NULL,
                direction       TEXT NOT NULL,
                category        TEXT DEFAULT 'general',
                contact_id      TEXT,
                invoice_id      TEXT,
                account         TEXT DEFAULT 'main',
                reconciled      INTEGER DEFAULT 0,
                notes           TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pipeline (
                id              TEXT PRIMARY KEY,
                contact_id      TEXT,
                title           TEXT NOT NULL,
                stage           TEXT DEFAULT 'prospect',
                value           REAL,
                probability     REAL DEFAULT 0.5,
                expected_close  TEXT,
                last_activity   TEXT,
                notes           TEXT,
                status          TEXT DEFAULT 'open',
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
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
        "description": "Business operations. CRM, invoicing, transactions, pipeline, financial insight.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["crm", "invoicing", "transactions",
                         "pipeline", "financial_insight"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    try:
        with get_db() as conn:
            overdue = conn.execute(
                "SELECT COUNT(*) FROM invoices WHERE status='sent' AND due_date < ?",
                (date.today().isoformat(),),
            ).fetchone()[0]
            open_pipeline = conn.execute(
                "SELECT SUM(value) FROM pipeline WHERE status='open'"
            ).fetchone()[0]
        return {"status": "ok", "overdue_invoices": overdue, "pipeline_value": open_pipeline or 0}
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

# ── Contacts (CRM) ────────────────────────────────────────────────────────────

class ContactRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    organisation: Optional[str] = None
    contact_type: str = "client"
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

@app.get("/api/contacts")
async def list_contacts(contact_type: Optional[str] = None, status: str = "active"):
    with get_db() as conn:
        if contact_type:
            rows = conn.execute(
                "SELECT * FROM contacts WHERE contact_type=? AND status=? ORDER BY name",
                (contact_type, status),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM contacts WHERE status=? ORDER BY name", (status,)
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/contacts", status_code=201)
async def create_contact(req: ContactRequest):
    contact = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "email": req.email,
        "phone": req.phone,
        "organisation": req.organisation,
        "contact_type": req.contact_type,
        "status": "active",
        "tags": json.dumps(req.tags or []),
        "notes": req.notes,
        "last_contact": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            tuple(contact.values()),
        )
    await _emit_event("kindbiz.contact.created", {"id": contact["id"], "name": req.name})
    return contact

@app.post("/api/contacts/{contact_id}/touch")
async def touch_contact(contact_id: str, body: dict = None):
    body = body or {}
    with get_db() as conn:
        conn.execute(
            "UPDATE contacts SET last_contact=?, notes=COALESCE(?, notes) WHERE id=?",
            (date.today().isoformat(), body.get("notes"), contact_id),
        )
    return {"contact_id": contact_id, "last_contact": date.today().isoformat()}

# ── Invoices ──────────────────────────────────────────────────────────────────

class InvoiceItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0

class InvoiceRequest(BaseModel):
    client_name: str
    contact_id: Optional[str] = None
    items: List[InvoiceItem] = []
    tax_rate: float = 0.0
    due_days: int = 14
    notes: Optional[str] = None

def _next_invoice_number(conn):
    result = conn.execute(
        "SELECT MAX(CAST(REPLACE(invoice_number, 'INV-', '') AS INTEGER)) FROM invoices "
        "WHERE invoice_number LIKE 'INV-%'"
    ).fetchone()[0]
    next_n = (result or 0) + 1
    return f"INV-{next_n:04d}"

@app.get("/api/invoices")
async def list_invoices(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM invoices WHERE status=? ORDER BY issue_date DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM invoices ORDER BY issue_date DESC").fetchall()
    return [dict(r) for r in rows]

@app.post("/api/invoices", status_code=201)
async def create_invoice(req: InvoiceRequest):
    items_data = [{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price,
                   "line_total": round(i.quantity * i.unit_price, 2)} for i in req.items]
    subtotal = sum(i["line_total"] for i in items_data)
    total = round(subtotal * (1 + req.tax_rate / 100), 2)
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        inv_num = _next_invoice_number(conn)
        invoice = {
            "id": str(uuid.uuid4()),
            "invoice_number": inv_num,
            "contact_id": req.contact_id,
            "client_name": req.client_name,
            "issue_date": date.today().isoformat(),
            "due_date": (date.today() + timedelta(days=req.due_days)).isoformat(),
            "items": json.dumps(items_data),
            "subtotal": subtotal,
            "tax_rate": req.tax_rate,
            "total": total,
            "status": "draft",
            "sent_at": None,
            "paid_at": None,
            "notes": req.notes,
            "created_at": now,
        }
        conn.execute(
            "INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(invoice.values()),
        )
    return invoice

@app.post("/api/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE invoices SET status='sent', sent_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), invoice_id),
        )
    await _emit_event("kindbiz.invoice.sent", {"invoice_id": invoice_id})
    return {"invoice_id": invoice_id, "status": "sent"}

@app.post("/api/invoices/{invoice_id}/paid")
async def mark_invoice_paid(invoice_id: str):
    with get_db() as conn:
        invoice = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
        if not invoice:
            raise HTTPException(404, "Invoice not found")
        conn.execute(
            "UPDATE invoices SET status='paid', paid_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), invoice_id),
        )
        # Record income transaction
        conn.execute(
            "INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), date.today().isoformat(),
             f"Invoice {invoice['invoice_number']} — {invoice['client_name']}",
             invoice["total"], "income", "invoice_payment",
             invoice["contact_id"], invoice_id, "main", 0, None,
             datetime.utcnow().isoformat()),
        )
    await _emit_event("kindbiz.invoice.paid", {"invoice_id": invoice_id, "total": invoice["total"]})
    return {"invoice_id": invoice_id, "status": "paid"}

# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionRequest(BaseModel):
    description: str
    amount: float
    direction: str   # income | expense
    category: str = "general"
    transaction_date: Optional[str] = None
    contact_id: Optional[str] = None
    account: str = "main"
    notes: Optional[str] = None

@app.get("/api/transactions")
async def list_transactions(direction: Optional[str] = None, days: int = 90):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        if direction:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE direction=? AND transaction_date >= ? ORDER BY transaction_date DESC",
                (direction, since),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE transaction_date >= ? ORDER BY transaction_date DESC",
                (since,),
            ).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/transactions", status_code=201)
async def record_transaction(req: TransactionRequest):
    if req.direction not in ("income", "expense"):
        raise HTTPException(400, "direction must be 'income' or 'expense'")
    txn = {
        "id": str(uuid.uuid4()),
        "transaction_date": req.transaction_date or date.today().isoformat(),
        "description": req.description,
        "amount": req.amount,
        "direction": req.direction,
        "category": req.category,
        "contact_id": req.contact_id,
        "invoice_id": None,
        "account": req.account,
        "reconciled": 0,
        "notes": req.notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    with get_db() as conn:
        conn.execute(
            "INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            tuple(txn.values()),
        )
    return txn

@app.get("/api/transactions/summary")
async def transactions_summary(days: int = 30):
    since = (date.today() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        income = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE direction='income' AND transaction_date >= ?",
            (since,),
        ).fetchone()[0]
        expenses = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE direction='expense' AND transaction_date >= ?",
            (since,),
        ).fetchone()[0]
    return {
        "period_days": days,
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "net": round(income - expenses, 2),
    }

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindBiz</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
