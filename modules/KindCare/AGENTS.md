# AI Agent Rules for KindCare

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindCare — compassionate care coordination module for the KindPath ecosystem.
Supports daily wellbeing check-ins (with safety flags), care schedules, goal
tracking, and reflective journaling. Designed for use with support workers,
carers, and participants in a trauma-informed framework. KMP 1.0 compliant.

## Port

`7865`

## Structure

```
KindCare/
├── server.py           — FastAPI app (KMP 1.0)
├── run.sh
├── requirements.txt
├── static/
│   └── index.html      — Care coordination dashboard
└── kindcare.db         — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7865`
- **Health check**: `curl http://localhost:7865/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `POST /api/checkins` — daily check-in (mood, safety_ok boolean, notes)
- `GET /api/checkins` — check-in history
- `GET /api/next-visit` — next confirmed upcoming visit from schedule
- `GET/POST /api/schedule`
- `PUT /api/schedule/{id}` — update visit status (confirmed/completed/missed)
- `GET/POST /api/goals`
- `PUT /api/goals/{id}` — update goal progress/status
- `GET/POST /api/journal`

## KCE Events Emitted

- `kindcare.checkin.completed`
- `kindcare.safety.flagged` — emitted when `safety_ok` is false in a check-in
- `kindcare.goal.achieved` — when goal status set to completed
- `kindcare.visit.missed` — when visit marked missed

## Rules

- Language in UI and API responses must be gentle, non-judgmental, and accessible
- `safety_ok = false` in a check-in MUST emit the `kindcare.safety.flagged` event immediately
- Safety flag events must never be silently dropped — verify KCE /events responds 2xx
- Journal entries are private — no auto-export; export only on explicit user action
- Follow KindPath compass methodology: refer to `/Users/sam/dev/KindPath-Collective/kindpath-compass/`
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- All care data encrypted at rest (future: SQLCipher)
- No participant data in source control
- `kindcare.db` must never be committed

