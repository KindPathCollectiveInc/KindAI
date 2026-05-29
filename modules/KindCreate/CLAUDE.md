# CLAUDE.md — KindCreate

## Session Init
```bash
cat ~/.kindpath/HANDOVER.md
```

## What This Is
Creative support layer integrating `kindpath-analyser` (stem separation, fingerprinting) and KindSocials.
Supports First Nations cultural preservation and sovereignty-respecting creative workflows.
Port **7863**.

## Operational Commands
- **Install**: `pip install -r requirements.txt`
- **Run**: `bash run.sh`
- **Analyser**: depends on `kindpath-analyser` — ensure it's installed too

## Rules
- All creative IP belongs to the creator — KindCreate is a tool, not a rights holder
- Cultural material (First Nations content) must have explicit provenance and consent tracking
- No audio fingerprinting data leaves the local system

## Local Security Capsule
- Bind to `127.0.0.1` only
- Preflight: `python3 /Users/sam/dev/KindPath-Collective/ai-workbench/scripts/preflight_port_check.py --root .`
