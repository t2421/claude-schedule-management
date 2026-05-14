#!/bin/bash
# Uninstall the claude-schedule-management web service.
set -euo pipefail

TARGET="$HOME/Library/LaunchAgents/local.claude-schedule.service.plist"
UID_NUM=$(id -u)
launchctl bootout "gui/$UID_NUM" "$TARGET" 2>/dev/null || true
rm -f "$TARGET"
echo "service uninstalled"
