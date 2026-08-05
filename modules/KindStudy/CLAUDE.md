# CLAUDE.md — KindStudy

## Session Init
```bash
cat ~/.kindpath/HANDOVER.md
```

## What This Is
AI Workbench overlay for education navigation — TAFE, uni pathways, scholarships, literacy support — ai-workbench product overlay (FastAPI + server.py), port **7871**.
Data lives in a local SQLite DB. The one intentional outbound call is a
background sync of the user's own CSU Interact2 calendar feed (assessment
due dates) — see AGENTS.md's "CSU Feed Sync" section. No other external
calls, no telemetry.

## Operational Commands
- **Install**: `pip install -r requirements.txt`
- **Run**: `bash run.sh` (starts on port 7871)
- **Test**: `pytest` (if tests exist)
- **CSU sync**: set `CSU_ICS_FEED_URL` in `.env` (see `.env.example`)


## Local Security Capsule
- No user data in logs
- The CSU feed URL (contains an auth token) lives only in `.env`, gitignored, never logged
- Preflight: `python3 /Users/sam/dev/KindPath-Collective/ai-workbench/scripts/preflight_port_check.py --root .`
