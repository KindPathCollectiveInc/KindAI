# AI Agent Rules for KindHome

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindHome — household management module for the KindPath ecosystem.
Tracks tasks (with recurring support), bills, shopping lists, household members,
and routines. Designed to reduce domestic cognitive load. KMP 1.0 compliant.

## Port

`7866`

## Structure

```
KindHome/
├── server.py           — FastAPI app (KMP 1.0, recurring task engine)
├── run.sh
├── requirements.txt
├── static/
│   └── index.html      — Household management dashboard
└── kindhome.db         — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7866`
- **Health check**: `curl http://localhost:7866/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET/POST /api/tasks` — household tasks; POST supports `recurrence` (daily/weekly/none)
- `POST /api/tasks/{id}/complete` — marks done; auto-creates next occurrence if recurring
- `GET/POST /api/bills`
- `POST /api/bills/{id}/pay` — marks paid + records payment date
- `GET/POST /api/shopping`
- `POST /api/shopping/{id}/got` — marks item as obtained
- `POST /api/shopping/clear-got` — removes all obtained items
- `GET/POST /api/household` — household member registry
- `GET/POST /api/routines` — routine templates

## KCE Events Emitted

- `kindhome.task.completed`
- `kindhome.bill.paid`
- `kindhome.shopping.cleared`

## Rules

- Recurring task logic: on completing a recurring task, create the next occurrence
  before returning the response — never leave a recurring task without a successor
- `kindhome.db` must never be committed
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- No PII in source control
- `kindhome.db` must never be committed

