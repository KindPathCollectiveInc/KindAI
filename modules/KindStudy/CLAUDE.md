# CLAUDE.md — KindStudy

## Session Init
```bash
cat ~/.kindpath/HANDOVER.md
```

## What This Is
AI Workbench overlay for education navigation — TAFE, uni pathways, scholarships, literacy support — ai-workbench product overlay (FastAPI + server.py), port **7871**.
Data lives in a local SQLite DB. Intentional outbound calls: a background
sync of the user's own CSU Interact2 calendar feed(s) (assessment due
dates), and Microsoft Graph mail access after the user completes their own
device-code Outlook login — see AGENTS.md's "CSU Feed Sync" and "Outlook
Integration" sections. No other external calls, no telemetry.

## Operational Commands
- **Install**: `pip install -r requirements.txt`
- **Run**: `bash run.sh` (Mac/Linux) or `.\run.ps1` (Windows PowerShell) — starts on port 7871
- **Test**: `pytest` (if tests exist)
- **CSU sync**: set `CSU_ICS_FEED_URLS` in `.env` (see `.env.example`)
- **Outlook**: set `MS_CLIENT_ID` in `.env`, then log in via the dashboard


## Local Security Capsule
- No user data in logs
- CSU feed URLs and MS_CLIENT_ID live only in `.env`, gitignored, never logged
- The Outlook token cache (`data/ms_token_cache.bin`) is gitignored; this
  app never handles the user's Microsoft password, only tokens obtained via
  their own device-code login
- Preflight: `python3 /Users/sam/dev/KindPath-Collective/ai-workbench/scripts/preflight_port_check.py --root .`
