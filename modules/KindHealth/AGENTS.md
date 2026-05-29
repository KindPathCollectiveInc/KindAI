# AI Agent Rules for KindHealth

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindHealth — personal health and wellbeing journal module for the KindPath ecosystem.
Tracks daily health entries (sleep, mood, energy, symptoms, movement, water, food notes,
stress, check-ins), medications, and GP prep notes. KMP 1.0 compliant.

## Port

`7869`

## Structure

```
KindHealth/
├── server.py           — FastAPI app (KMP 1.0)
├── run.sh              — Start script (creates venv, installs deps, launches uvicorn)
├── requirements.txt    — Python deps
├── static/
│   └── index.html      — Health journal dashboard
└── kindhealth.db       — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7869`
- **Health check**: `curl http://localhost:7869/api/health`
- **Identity**: `curl http://localhost:7869/api/module/identity`

## KMP Endpoints

- `GET /api/module/identity` — module ID, name, version, port, capabilities
- `GET /api/health` — status, entry_count, last_entry_at
- `POST /api/health/entries` — log a new health entry
- `GET /api/health/entries` — list entries (optional: `?type=sleep&limit=20`)
- `GET /api/health/metrics/today` — today's summary across all entry types
- `GET /api/health/medications` — list active medications
- `POST /api/health/medications` — add a medication
- `DELETE /api/health/medications/{id}` — remove a medication
- `POST /api/health/gp-prep` — create GP prep note
- `GET /api/health/gp-prep` — list GP prep notes
- `GET /api/health/gp-prep/{id}/export` — plain-text export for printing

## KCE Events Emitted

- `kindhealth.entry.created` — on every new health entry
- `kindhealth.checkin.completed` — when entry type is `check_in`
- `kindhealth.safety.flagged` — if symptom entry indicates concern (agent decision)

## Rules

- No external API calls — health data stays local
- Never log personally identifying health data in application logs
- `kindhealth.db` must never be committed to source control
- GP prep export is plain text only — no structured data leaving the system
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- All health data encrypted at rest (future: use SQLCipher)
- No PII in source control
- No API keys needed — local-only module

