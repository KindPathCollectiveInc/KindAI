# AI Agent Rules for KindSocials

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindSocials — the all-in-one social platform layer for the KindPath ecosystem.
FastAPI web app at port 7862 that bundles Kindfluence (constellation + attention
capital + readiness) with Field Studio (audio analysis via kindpath-analyser),
social channel management, and a post queue/scheduler.

Sidecar to AI Workbench workspace (port 7860). AI Workbench shows a native 📱 Socials panel
that fetches all data from this server.

## Structure

```
server.py           — FastAPI entry point (port 7862)
static/index.html   — Standalone KindSocials dashboard
run.sh              — Bootstrapping launcher
recordings/         — Audio files register (metadata only — paths to actual files)
.kindsocials_state.json — Channels, posts, recordings, enabled flag
```

## Integration Points

- Kindfluence at `../Kindfluence/` — imported directly via sys.path
  - AccountRegistry, VoiceConfig, AttentionField, CommunityReadinessIndex
  - Shares state: `../Kindfluence/.kindfluence_state.json`
- kindpath-analyser at `../kindpath-analyser/` — optional, for Field Studio analysis
  - load, segment, extract, compute_trajectory, analyse_fingerprints
- AI Workbench workspace at port 7860 — calls /api/* endpoints directly (CORS enabled)

## Operational Commands

- **Start**: `./run.sh` (auto-bootstraps venv + installs Kindfluence)
- **API health**: `curl http://localhost:7862/api/status`
- **Dashboard**: http://localhost:7862

## Rules

- Port 7862 is canonical — never change without updating AI Workbench panel JS (KINDSOCIALS_URL)
- CORS is allow_origins=["*"] — acceptable for local dev
- State files are JSON — human-readable, never binary
- Field Studio analysis is optional — graceful degradation always
- Do not store actual audio files — store paths to files on disk

## Security Mandates

- No API keys or OAuth secrets in source — stubs only for now
- .kindsocials_state.json is gitignored (contains channel handles)
- Audio file paths stored in state — validate they exist before analysis
- No PII beyond what the user explicitly enters
