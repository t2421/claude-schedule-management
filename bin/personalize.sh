#!/bin/bash
# Personalize this repository for your own GitHub account / fork.
#
# Replaces placeholder strings in:
#   - package.json   (repository / homepage / bugs / author)
#   - LICENSE        (copyright holder)
#   - README.md, README.ja.md (clone URL)
#
# Usage:
#
#   bin/personalize.sh                                          # interactive
#
#   GITHUB_USER=alice \
#   REPO_NAME=my-fork \
#   AUTHOR_NAME="Alice Doe" \
#   AUTHOR_EMAIL=alice@example.com \
#   CONFIRM_YES=1 \
#     bin/personalize.sh                                        # non-interactive
#
# Idempotent: re-running with different values will overwrite. Once placeholders
# are gone, additional runs become no-ops for that field.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

red()   { printf '\033[0;31m%s\033[0m' "$1"; }
green() { printf '\033[0;32m%s\033[0m' "$1"; }
dim()   { printf '\033[0;90m%s\033[0m' "$1"; }

# Read a value from env (if set) or prompt the user.
ask() {
  local var="$1" prompt="$2" default="${3:-}"
  local current="${!var:-}"
  if [ -n "$current" ]; then
    printf '%s' "$current"
    return
  fi
  local input
  if [ ! -t 0 ] && [ ! -e /dev/tty ]; then
    printf '%s' "$default"
    return
  fi
  if [ -n "$default" ]; then
    read -rp "  $prompt [$default]: " input </dev/tty
    printf '%s' "${input:-$default}"
  else
    read -rp "  $prompt: " input </dev/tty
    printf '%s' "$input"
  fi
}

# Escape a string for safe use on the right side of `sed s|...|REPL|`.
sed_esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }

# In-place edit that works on both BSD and GNU sed.
replace_in_file() {
  local file="$1" pattern="$2" replacement="$3"
  [ -f "$file" ] || return 0
  sed -i.bak -e "s|$pattern|$replacement|g" "$file"
  rm -f "$file.bak"
}

echo
echo "$(green '╭─ Personalize claude-schedule-management ─╮')"
echo

GITHUB_USER="$(ask GITHUB_USER "GitHub user or org")"
if [ -z "$GITHUB_USER" ]; then
  echo "$(red 'error:') GitHub user is required" >&2
  exit 1
fi

REPO_NAME="$(ask REPO_NAME "Repository name" "claude-schedule-management")"
AUTHOR_NAME="$(ask AUTHOR_NAME "Your name (LICENSE / package.json)")"
if [ -z "$AUTHOR_NAME" ]; then
  echo "$(red 'error:') Author name is required" >&2
  exit 1
fi
AUTHOR_EMAIL="$(ask AUTHOR_EMAIL "Your email (optional)" "")"

AUTHOR_STR="$AUTHOR_NAME"
[ -n "$AUTHOR_EMAIL" ] && AUTHOR_STR="$AUTHOR_NAME <$AUTHOR_EMAIL>"

echo
echo "Will apply:"
echo "  $(dim 'github ') https://github.com/$GITHUB_USER/$REPO_NAME"
echo "  $(dim 'author ') $AUTHOR_STR"
echo

if [ "${CONFIRM_YES:-}" != "1" ] && [ -t 0 -o -e /dev/tty ]; then
  read -rp "Proceed? [y/N] " yn </dev/tty
  case "$yn" in
    [Yy]*) ;;
    *) echo "aborted"; exit 1 ;;
  esac
fi

GH_PATH_ESC=$(sed_esc "$GITHUB_USER/$REPO_NAME")
AUTHOR_ESC=$(sed_esc "$AUTHOR_STR")

# Replace github user/repo path
for f in package.json README.md README.ja.md; do
  replace_in_file "$f" "REPLACE_ME/claude-schedule-management" "$GH_PATH_ESC"
done

# Replace author placeholder
for f in package.json LICENSE; do
  replace_in_file "$f" "REPLACE_ME_AUTHOR" "$AUTHOR_ESC"
done

# Final check: any placeholders left? (Skip this script itself — it contains
# REPLACE_ME inside the usage examples.)
REMAINING=$(grep -rln \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git \
  --exclude-dir=plists \
  --exclude-dir=logs \
  --exclude="package-lock.json" \
  --exclude="personalize.sh" \
  -e 'REPLACE_ME' . 2>/dev/null || true)

echo
if [ -n "$REMAINING" ]; then
  echo "$(red '⚠')  Some placeholders remain — edit manually:"
  echo "$REMAINING" | sed 's/^/    /'
  exit 1
fi
echo "$(green '✓')  Personalization complete."
