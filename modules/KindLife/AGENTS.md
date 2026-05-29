# AI Agent Rules for KindLife

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindLife — the master life overview and bundle orchestration module for the KindPath ecosystem.
Aggregates health, wellbeing, work, home, study, care, and research signals from all active
modules into a unified life dashboard. No local database — pure aggregator. KMP 1.0 compliant.

## Port

`7873`

## Structure

```
KindLife/
├── server.py           — FastAPI app (KMP 1.0, no DB, aggregator)
├── run.sh
├── requirements.txt
└── static/
    └── index.html      — Life overview dashboard (all modules + bundles)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7873`
- **Health check**: `curl http://localhost:7873/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET /api/overview` — aggregated summary from all active modules, attention list
- `GET /api/modules/status` — online/offline status of all 10 KMP modules
- `GET /api/bundles/active` — proxies to KCE /bundles/active

## Module Endpoints Aggregated

```python
MODULE_ENDPOINTS = {
    "kindhome":    "http://localhost:7866",
    "kindwork":    "http://localhost:7867",
    "kindbiz":     "http://localhost:7868",
    "kindhealth":  "http://localhost:7869",
    "kindcare":    "http://localhost:7865",
    "kindis":      "http://localhost:7864",
    "kindstudy":   "http://localhost:7871",
    "kindpathresearch": "http://localhost:7872",
    "kindfluence": "http://localhost:7861",
    "kindsocials": "http://localhost:7862",
}
```

## KCE Events Emitted

- `kindlife.overview.generated` — periodic aggregation complete

## Attention List Logic

`/api/overview` polls 6 primary modules and builds an attention list with urgency levels:
- `high`: safety flags from KindCare, overdue tasks from KindHome
- `medium`: due flashcards from KindStudy, unpaid bills
- `low`: general nudges (no activity in 24h, etc)

## Rules

- KindLife has NO local database — all data comes from other modules via HTTP
- `_fetch()` timeout is 3 seconds — never block overview for a slow module
- If a module is offline, log it and continue — never raise from overview
- KindLife is the user-facing entry point — keep the overview endpoint fast (<2s total)
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- No data stored locally
- No PII aggregated — only counts and status flags travel through overview
- `_fetch()` must never follow redirects to external hosts

