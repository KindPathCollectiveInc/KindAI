# KindSocials

All-in-one social platform engine for the KindPath ecosystem.

**Port:** 7862 | **Sidecar to:** AI Workbench (7860) | **Built on:** Kindfluence (7861)

---

## What It Does

KindSocials bundles everything a KindPath creator needs in one server:

| Layer | What it provides |
|---|---|
| **Kindfluence** | Constellation (multi-account phase tracking), Attention Capital, Readiness Index, Dismantling progress |
| **Field Studio** | Audio recording registry + KindPath Analyser integration (LSII, era, valence, authenticity) |
| **Channels** | Social channel registry (Instagram, TikTok, YouTube, etc.) |
| **Posts** | Draft → Schedule → Publish queue |

The Field Studio is where KindPath Q and kindpath-analyser feed in — record something in the field, drop the path in, run analysis, then push to channels.

---

## Run

```bash
./run.sh
# or with a custom port:
./run.sh 7862
```

The script bootstraps the venv, installs Kindfluence and kindpath-analyser from sibling repos, and starts the server.

---

## Access

- **Standalone dashboard:** http://localhost:7862
- **AI Workbench panel:** Open the 📱 Socials panel in AI Workbench (http://localhost:7860)
- **API:** http://localhost:7862/api/status

---

## Module Toggle

KindSocials can be toggled on/off from within AI Workbench using the 📱 panel toggle button. When the server is not running, the AI Workbench panel shows an offline card with start instructions.

---

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Service health + component counts |
| GET/POST | `/api/constellation` | List / register accounts |
| GET | `/api/constellation/{id}` | Account detail |
| PUT | `/api/constellation/{id}/phase` | Advance phase |
| POST/GET | `/api/attention` | Log / list attention signals |
| GET | `/api/readiness` | Community readiness score |
| GET | `/api/dismantling` | Self-dismantling progress |
| GET/POST | `/api/channels` | List / connect channels |
| DELETE | `/api/channels/{id}` | Disconnect channel |
| GET/POST | `/api/posts` | List / create posts |
| PUT | `/api/posts/{id}` | Update post |
| POST | `/api/posts/{id}/publish` | Mark as published |
| DELETE | `/api/posts/{id}` | Delete post |
| GET/POST | `/api/studio/recordings` | List / add recordings |
| POST | `/api/studio/recordings/{id}/analyze` | Run KindPath Analyser |

---

## Integration

- **Kindfluence:** Imported as Python package from `../Kindfluence/src/`. Shares `..Kindfluence/.kindfluence_state.json`.
- **kindpath-analyser:** Optional. If unavailable, Field Studio still works but analysis returns `{"status": "analyser_unavailable"}`.
- **AI Workbench:** Calls all `/api/*` routes directly. CORS is open for local dev.

---

## Structure

```
server.py               FastAPI app
static/index.html       Standalone dashboard (5 tabs)
run.sh                  Self-bootstrapping launcher
recordings/             Audio metadata store (paths, not files)
.kindsocials_state.json Runtime state (gitignored)
AGENTS.md               AI agent rules
```
