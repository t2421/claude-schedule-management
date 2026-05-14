#!/bin/bash
# Check that everything needed to run claude-schedule-management is in place.
# Exits with non-zero if any required dependency is missing.

set -u

red()   { printf '\033[0;31m%s\033[0m' "$1"; }
green() { printf '\033[0;32m%s\033[0m' "$1"; }
yellow(){ printf '\033[0;33m%s\033[0m' "$1"; }

ok=0
warn=0
fail=0

check_required() {
  local name="$1"
  local desc="$2"
  local install_hint="$3"
  shift 3
  local found=""
  for candidate in "$@"; do
    if [ -x "$candidate" ] || command -v "$candidate" >/dev/null 2>&1; then
      found="$candidate"
      break
    fi
  done
  if [ -n "$found" ]; then
    printf "  %s  %-10s %s\n" "$(green '✓')" "$name" "$(command -v "$found" 2>/dev/null || echo "$found")"
    ok=$((ok+1))
  else
    printf "  %s  %-10s missing — %s\n" "$(red '✗')" "$name" "$install_hint"
    fail=$((fail+1))
  fi
}

check_version() {
  local name="$1"
  local needed_major="$2"
  local actual="$3"
  local major
  major="$(echo "$actual" | sed -E 's/^v?([0-9]+)\..*$/\1/')"
  if [ -z "$major" ] || ! [ "$major" -ge "$needed_major" ] 2>/dev/null; then
    printf "  %s  %-10s %s found, %s+ recommended\n" "$(yellow '!')" "$name" "$actual" "$needed_major"
    warn=$((warn+1))
  fi
}

echo
echo "claude-schedule-management — environment check"
echo

# macOS check
if [ "$(uname -s)" = "Darwin" ]; then
  printf "  %s  %-10s %s\n" "$(green '✓')" "macOS" "$(sw_vers -productVersion 2>/dev/null || echo '?')"
  ok=$((ok+1))
else
  printf "  %s  %-10s required (launchd is macOS-only)\n" "$(red '✗')" "macOS"
  fail=$((fail+1))
fi

# Required tools
check_required "node"       "Node.js"     "install Node 20+ from https://nodejs.org" \
  "node"
check_required "claude"     "Claude CLI"  "see https://docs.anthropic.com/claude/docs/claude-code" \
  "claude" "$HOME/.local/bin/claude" "/opt/homebrew/bin/claude" "/usr/local/bin/claude"
check_required "yq"         "yq"          "brew install yq" \
  "yq" "/opt/homebrew/bin/yq" "/usr/local/bin/yq"
check_required "launchctl"  "launchctl"   "built into macOS — something is very wrong" \
  "launchctl"

# Version warnings
if command -v node >/dev/null; then
  check_version "node" 20 "$(node -v)"
fi

echo
if [ "$fail" -gt 0 ]; then
  printf "  %s required dependencies missing — install above then re-run.\n" "$(red "$fail")"
  exit 1
elif [ "$warn" -gt 0 ]; then
  printf "  %s warning(s) — should work but consider upgrading.\n" "$(yellow "$warn")"
  exit 0
else
  printf "  %s all good.\n" "$(green '✓')"
  exit 0
fi
