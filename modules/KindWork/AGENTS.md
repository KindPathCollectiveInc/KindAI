# AI Agent Rules for KindWork

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindWork — employment and work management module for the KindPath ecosystem.
Tracks job applications (with pipeline stages), freelance projects, timesheets,
income, and opportunities. KMP 1.0 compliant.

## Port

`7867`

## Structure

```
KindWork/
├── server.py           — FastAPI app (KMP 1.0)
├── run.sh
├── requirements.txt
├── static/
│   └── index.html      — Work management dashboard
└── kindwork.db         — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7867`
- **Health check**: `curl http://localhost:7867/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET/POST /api/applications` — job applications
- `PUT /api/applications/{id}` — update status/notes
- `GET/POST /api/projects` — freelance/contract projects
- `PUT /api/projects/{id}` — update project status
- `POST /api/timesheets` — log a timesheet entry (project_id, hours, date, notes)
- `GET /api/timesheets` — timesheet history
- `GET /api/timesheets/summary` — hours per project this week/month
- `GET/POST /api/income` — income records
- `GET /api/income/summary` — total income this month/year
- `GET/POST /api/opportunities` — opportunities/leads

## Application Pipeline

Valid statuses (in order):
`drafting → applied → screening → interviewing → offer → accepted`
Terminal states: `rejected`, `withdrawn`

## KCE Events Emitted

- `kindwork.application.submitted` — when status moves to `applied`
- `kindwork.application.outcome` — when status reaches accepted/rejected/withdrawn
- `kindwork.project.completed`
- `kindwork.income.recorded`

## Rules

- Application status must follow the pipeline — validate transitions
- `kindwork.db` must never be committed
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- No PII or financial data in source control
- `kindwork.db` must never be committed

