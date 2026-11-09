#!/usr/bin/env bash
# Doorman installer: give your AI access without giving it the keys.
#
#   curl -fsSL https://raw.githubusercontent.com/Billylions/doorman/main/install.sh | bash
#
# What it does, and nothing else:
#   1. Downloads Doorman.app from the latest GitHub release and puts it in /Applications
#      (or ~/Applications if /Applications isn't writable).
#   2. Adds the `doorman` command to ~/.local/bin.
#   3. Connects Doorman to Claude Code, if Claude Code is installed.
#   4. Opens Doorman.
# It never reads, moves or uploads your keys. Your existing keys and settings are kept.
set -euo pipefail

REPO="Billylions/doorman"
ZIP_URL="${DOORMAN_ZIP:-https://github.com/$REPO/releases/latest/download/Doorman-mac-arm64.zip}"
APP_DIR="${DOORMAN_APP_DIR:-/Applications}"
BIN_DIR="${DOORMAN_BIN_DIR:-$HOME/.local/bin}"

say() { printf '\033[1;31m🛎  %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mDoorman: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Doorman is a Mac app (macOS only for now)."
[ "$(uname -m)" = "arm64" ] || fail "this build is for Apple Silicon Macs (M1 and later). Intel Macs: build it from source, see the README."

if [ -z "${DOORMAN_APP_DIR:-}" ] && [ ! -w "$APP_DIR" ]; then
  APP_DIR="$HOME/Applications"
fi
mkdir -p "$APP_DIR" "$BIN_DIR"
APP="$APP_DIR/Doorman.app"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Downloading Doorman…"
case "$ZIP_URL" in
  http*) curl -fL --progress-bar "$ZIP_URL" -o "$TMP/Doorman.zip" ;;
  *) cp "$ZIP_URL" "$TMP/Doorman.zip" ;;
esac
ditto -x -k "$TMP/Doorman.zip" "$TMP/unzipped"
[ -d "$TMP/unzipped/Doorman.app" ] || fail "the download didn't contain Doorman.app."

# Replace an older copy. Quit it first so it isn't running from the old files.
if [ -d "$APP" ]; then
  if [ -z "${DOORMAN_APP_DIR:-}" ]; then
    osascript -e 'quit app "Doorman"' >/dev/null 2>&1 || true
    sleep 1
  fi
  rm -rf "$APP"
fi
ditto "$TMP/unzipped/Doorman.app" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
say "Installed $APP"

BIN="$APP/Contents/MacOS/Doorman"
CLI="$APP/Contents/Resources/app/src/cli.js"

# The `doorman` command uses the app itself as its runtime, so Node isn't needed.
printf '#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "%s" "%s" "$@"\n' "$BIN" "$CLI" > "$BIN_DIR/doorman"
chmod 755 "$BIN_DIR/doorman"
say "Added the doorman command to $BIN_DIR"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "   To use it in a terminal, add this to your ~/.zshrc:  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac

# Connect Claude Code, if it's installed.
if [ -z "${DOORMAN_SKIP_CLAUDE:-}" ] && command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user doorman >/dev/null 2>&1 || true
  if claude mcp add --scope user doorman -e ELECTRON_RUN_AS_NODE=1 -- "$BIN" "$CLI" mcp >/dev/null 2>&1; then
    say "Connected to Claude Code. Start a new chat to use it."
  else
    echo "   Couldn't connect Claude Code automatically. In Doorman, use the menu bar hat → Copy Claude Code setup command."
  fi
else
  echo "   Using Cursor or Claude Desktop? Open Doorman → Connect your AI for the setup."
fi

if [ -z "${DOORMAN_NO_OPEN:-}" ]; then
  open "$APP"
fi
say "Done. Check in your keys at the front desk, then just ask your AI to do the job."
