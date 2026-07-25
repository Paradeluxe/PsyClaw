#!/usr/bin/env bash
# PsyClaw monorepo one-shot: clone/update + webui venv + remember path.
# Skill install is CLI-specific (printed only; not forced).
# Usage: ./install-full.sh [MONOREPO_DIR]
#   default MONOREPO_DIR = $HOME/psyclaw
set -euo pipefail

echo "=== PsyClaw monorepo install ==="

MONOREPO_DIR="${1:-$HOME/psyclaw}"

if [ -d "$MONOREPO_DIR/.git" ]; then
  echo "Monorepo already exists at $MONOREPO_DIR — updating..."
  git -C "$MONOREPO_DIR" pull || echo "WARNING: git pull failed; continuing with existing tree."
else
  echo "Cloning Paradeluxe/psyclaw to $MONOREPO_DIR..."
  git clone https://github.com/Paradeluxe/psyclaw.git "$MONOREPO_DIR"
fi

if [ ! -f "$MONOREPO_DIR/webui/start.py" ]; then
  echo "ERROR: $MONOREPO_DIR does not look like Paradeluxe/psyclaw monorepo (missing webui/start.py)." >&2
  exit 1
fi

echo ""
echo "=== Skill install ==="
echo "Skill source: $MONOREPO_DIR/skills/psyclaw/"
echo ""
echo "Install command depends on your AI CLI:"
echo "  Hermes:      cd $MONOREPO_DIR && hermes install Paradeluxe/psyclaw/skills/psyclaw"
echo "  Claude Code: cp -r $MONOREPO_DIR/skills/psyclaw ~/.claude/skills/"
echo "  Codex:       cp -r $MONOREPO_DIR/skills/psyclaw <your-agent-skill-dir>/"
echo "  Generic:     Point your agent at $MONOREPO_DIR/skills/psyclaw/"
echo ""

echo "=== WebUI setup ==="
WEBUI_DIR="$MONOREPO_DIR/webui"
cd "$WEBUI_DIR"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

if [ ! -x ".venv/bin/python" ] && [ ! -x ".venv/Scripts/python.exe" ]; then
  echo "Creating Python venv..."
  "$PY" -m venv .venv
fi

if [ -x ".venv/bin/python" ]; then
  VENV_PY=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
  VENV_PY=".venv/Scripts/python.exe"
else
  echo "ERROR: venv python missing after create." >&2
  exit 1
fi

echo "Installing Flask dependencies..."
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r requirements.txt

echo "Remembering webui path..."
"$VENV_PY" scripts/user_config.py remember

echo ""
echo "=== Install complete ==="
echo "Monorepo:  $MONOREPO_DIR"
echo "WebUI:     $WEBUI_DIR"
echo "Start:     cd $WEBUI_DIR && python start.py"
echo "URL:       http://127.0.0.1:8876"
echo "Config:    ~/.psyclaw/config.json  (webui_root)"