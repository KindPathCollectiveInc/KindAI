# KindCreate

Sovereignty-first creative workspace for the KindPath ecosystem.
Not a social app with creation features — a creativity tool with the option to share.

**Port:** 7863 | **Protocol:** KMP 1.0

## The Principle

Your creative work lives here, in your workspace, until you choose to share it.
`POST /api/share` is the only bridge to KindSocials and it is always initiated by you.
KindCreate never pushes anything automatically.

## Quick Start

```bash
./run.sh          # creates venv on first run, starts at http://localhost:7863
```

Or manually:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

## What It Does

**Projects** — workspaces for any creative endeavour: music, writing, visual, code, or other.
Each project has its own drafts, tool links, and analysis records.

**Drafts** — version-managed drafts with mood + energy metadata.
Each save creates a new version. Your process is preserved, not overwritten.

**Tool Links** — register deep-links to the tools used in a project.
Ableton, Logic, Figma, Notion, VS Code — provenance lives here.

**Audio Analysis** — if `kindpath-analyser` is installed in the adjacent directory,
`POST /api/projects/{id}/analyse` runs the full LSII + fingerprint analysis pipeline
and attaches the result to the project.

**Share** — `POST /api/share` sends a project to the KindSocials post queue.
Caption, channel, and platform targeting are all optional.
Returns 503 if KindSocials is offline — no silent queueing.

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/module/identity` | KMP stable identity |
| `GET` | `/api/health` | KMP liveness check |
| `GET` | `/api/status` | Dashboard stats |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/{id}` | Project detail + drafts + tools |
| `DELETE` | `/api/projects/{id}` | Delete project |
| `GET` | `/api/projects/{id}/drafts` | List drafts |
| `POST` | `/api/projects/{id}/drafts` | Save draft |
| `GET` | `/api/projects/{id}/tools` | List tool links |
| `POST` | `/api/projects/{id}/tools` | Add tool link |
| `POST` | `/api/projects/{id}/analyse` | Run audio analysis |
| `POST` | `/api/share` | Share to KindSocials |

## KindPath Module Protocol

KindCreate is KMP 1.0 compliant. It registers with KCE (`localhost:7870`) at startup
and emits events on: `create.project.created`, `create.draft.saved`,
`create.analysis.complete`, `create.shared.to.social`.

## Stack

- Python 3.10+, FastAPI, uvicorn, httpx, pydantic
- State: `data/.kindcreate_state.json` (gitignored)
- No database — pure JSON, portable, always readable
- Optional: kindpath-analyser (auto-detected at `../kindpath-analyser/`)
