#!/bin/bash
# Install the claude-schedule-management web service as a per-user launchd agent.
# Usage: bin/install-service.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$ROOT/local.claude-schedule.service.plist.template"
TARGET="$HOME/Library/LaunchAgents/local.claude-schedule.service.plist"
NODE_BIN="${NODE:-$(command -v node)}"

if [ -z "$NODE_BIN" ]; then
  echo "node not found on PATH. Set NODE=/path/to/node and retry." >&2
  exit 1
fi
if [ ! -f "$ROOT/server/dist/index.js" ]; then
  echo "server/dist/index.js missing. Run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

sed -e "s|__ROOT__|$ROOT|g" -e "s|__NODE__|$NODE_BIN|g" -e "s|__HOME__|$HOME|g" "$TEMPLATE" > "$TARGET"
echo "wrote $TARGET"

UID_NUM=$(id -u)
launchctl bootout "gui/$UID_NUM" "$TARGET" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$TARGET"
echo "service loaded. open http://127.0.0.1:7878"
