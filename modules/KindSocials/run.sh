#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "── KindSocials bootstrapper ──────────────────────────────────────────"

# 1. Venv
if [ ! -d venv ]; then
  echo "  Creating venv…"
  python3 -m venv venv
fi
source venv/bin/activate

# 2. Core deps
echo "  Installing deps…"
pip install fastapi uvicorn python-multipart httpx --quiet

# 3. Kindfluence (sibling repo)
KINDFLUENCE="$SCRIPT_DIR/../Kindfluence"
if [ -d "$KINDFLUENCE" ]; then
  echo "  Installing Kindfluence from $KINDFLUENCE…"
  pip install -e "$KINDFLUENCE" --quiet
else
  echo "  [WARN] Kindfluence not found at $KINDFLUENCE — constellation features will be limited"
fi

# 4. kindpath-analyser (sibling repo, optional)
# Note: server.py injects the analyser venv's site-packages via sys.path at runtime.
# No install needed here — direct path injection avoids recompiling heavy binaries (llvmlite).
ANALYSER="$SCRIPT_DIR/../kindpath-analyser"
if [ ! -d "$ANALYSER" ]; then
  echo "  [INFO] kindpath-analyser not found — Field Studio analysis will show 'unavailable'"
fi

PORT="${1:-7862}"
echo ""
echo "  KindSocials  → http://localhost:$PORT"
echo "  Kindfluence  → $([ -d "$KINDFLUENCE" ] && echo '✓' || echo '✗ not found')"
echo "  Analyser     → $([ -d "$ANALYSER" ] && echo '✓' || echo '✗ not found (optional)')"
echo ""
exec python server.py "$PORT"
