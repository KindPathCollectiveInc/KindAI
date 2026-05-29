# CLAUDE.md — KindCare

## Session Init
```bash
cat ~/.kindpath/HANDOVER.md
```

## What This Is
Care-relationship layer for support workers — shift notes, goal tracking, carer wellbeing — ai-workbench product overlay (FastAPI + server.py), port **7865**.
Runs offline-first. Data stays local.

## Operational Commands
- **Install**: `pip install -r requirements.txt`
- **Run**: `bash run.sh` (starts on port 7865)
- **Test**: `pytest` (if tests exist)

## Rules\n- Treat all care relationship data as sensitive\n- Never surface worker-to-client notes outside the local session

## Local Security Capsule
- Bind to `127.0.0.1` only
- No user data in logs
- Preflight: `python3 /Users/sam/dev/KindPath-Collective/ai-workbench/scripts/preflight_port_check.py --root .`
