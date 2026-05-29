# AI Agent Rules for KindBiz

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindBiz — business management module for the KindPath ecosystem.
Manages contacts/CRM, invoices (auto-numbered INV-XXXX), transactions,
and business pipeline. Paying an invoice auto-creates an income transaction.
KMP 1.0 compliant.

## Port

`7868`

## Structure

```
KindBiz/
├── server.py           — FastAPI app (KMP 1.0, invoice engine)
├── run.sh
├── requirements.txt
├── static/
│   └── index.html      — Business management dashboard
└── kindbiz.db          — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7868`
- **Health check**: `curl http://localhost:7868/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET/POST /api/contacts` — CRM contacts
- `PUT /api/contacts/{id}`
- `GET/POST /api/invoices`
- `POST /api/invoices/{id}/pay` — marks paid + creates income transaction
- `GET /api/invoices/unpaid` — overdue/outstanding invoices
- `GET/POST /api/transactions` — income and expense ledger
- `GET /api/transactions/summary` — net income this month/year
- `GET/POST /api/pipeline` — business pipeline (leads/opportunities)
- `PUT /api/pipeline/{id}` — update stage

## Invoice Numbering

`_next_invoice_number()` queries `MAX(invoice_number)` from invoices table
and returns the next sequential `INV-XXXX`. Never reuse numbers.

## KCE Events Emitted

- `kindbiz.invoice.created`
- `kindbiz.invoice.paid` — includes amount
- `kindbiz.contact.added`
- `kindbiz.pipeline.stage_changed`

## Rules

- Invoice numbers are sequential and must never be reused or manually set
- Paying an invoice always creates a corresponding income transaction atomically
- `kindbiz.db` must never be committed
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- No financial data in source control
- No client PII in source control
- `kindbiz.db` must never be committed

