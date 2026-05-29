# CLAUDE.md — KindWork

## Session Init
```bash
cat ~/.kindpath/HANDOVER.md
```

## What This Is
AI Workbench overlay for employment support — job search, workplace rights, resume help — ai-workbench product overlay (FastAPI + server.py), port **7867**.
Runs offline-first. Data stays local.

## Operational Commands
- **Install**: `pip install -r requirements.txt`
- **Run**: `bash run.sh` (starts on port 7867)
- **Test**: `pytest` (if tests exist)



## Local Security Capsule
- Bind to `127.0.0.1` only
- No user data in logs
- Preflight: `python3 /Users/sam/dev/KindPath-Collective/ai-workbench/scripts/preflight_port_check.py --root .`
