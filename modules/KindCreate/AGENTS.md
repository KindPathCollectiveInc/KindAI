# AI Agent Rules for KindCreate

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindCreate — sovereignty-first creative workspace for the KindPath ecosystem.
A creativity tool with the option to share — not a social app with creation features.
Python/FastAPI, port 7863, KMP 1.0 compliant.

## Structure

```
server.py           — FastAPI server, all routes
static/index.html   — Single-file dashboard UI
core/               — Project + draft models (future)
data/               — Runtime state (.kindcreate_state.json — gitignored)
requirements.txt    — fastapi, uvicorn, httpx, pydantic
run.sh              — bootstrap venv + start server
```

## Operational Commands

- **Run**: `./run.sh` (creates venv on first run)
- **Dev**: `source venv/bin/activate && python server.py`
- **Port**: 7863

## API Summary

| Route | Purpose |
|---|---|
| `GET /api/module/identity` | KMP stable identity |
| `GET /api/health` | KMP liveness |
| `GET /api/status` | Dashboard stats |
| `GET/POST /api/projects` | List / create projects |
| `GET /api/projects/{id}` | Project detail |
| `DELETE /api/projects/{id}` | Archive project |
| `GET/POST /api/projects/{id}/drafts` | List / save drafts |
| `GET/POST /api/projects/{id}/tools` | Tool link registry |
| `POST /api/projects/{id}/analyse` | Audio analysis via kindpath-analyser |
| `POST /api/share` | Explicit push to KindSocials |

## Design Rules

- **Sovereignty first**: KindCreate never pushes to KindSocials automatically.
  `POST /api/share` is the only bridge — always initiated by the creator.
- **Port**: 7863 — never change without updating KCE module registry and MODULE_CONTRACT.md
- **KMP compliance**: `/api/module/identity` and `/api/health` are mandatory.
  Registers with KCE (`localhost:7870`) at startup — best-effort, never blocks start.
- **No social features**: KindCreate has no feed, no timeline, no metrics.
  Creative work lives here until the creator chooses to move it.
- **Audio analysis**: optional integration via kindpath-analyser.
  Server starts and runs fully without it — `analyser: unavailable` in health endpoint.
- **State**: `data/.kindcreate_state.json` — never commit this file.

## KindSocials Bridge

`POST /api/share` sends to `POST http://localhost:7862/api/posts`.
Payload includes project metadata, draft reference, caption, channel, platforms.
If KindSocials is offline the request returns a 503 — no retry logic, no queue.
The creator decides when to retry.

## Security Mandates

- No API keys or secrets in source control
- `data/` directory is gitignored
- No external network calls except localhost:7870 (KCE) and localhost:7862 (KindSocials)
