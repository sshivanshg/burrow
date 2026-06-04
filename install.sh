#!/usr/bin/env bash
# burrowed — one-shot installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/sshivanshg/burrowed/main/install.sh | bash
#
# Picks the right binary for your CPU, downloads it from the latest
# GitHub release, verifies the SHA256 against the release's SHA256SUMS,
# drops it in ~/.local/bin/ (or $BURROWED_INSTALL_DIR), and tells you how
# to put that on $PATH if it isn't already.
#
# No telemetry. Reads nothing else on your machine. Safe to re-run.
set -euo pipefail

REPO="sshivanshg/burrowed"
DEST="${BURROWED_INSTALL_DIR:-${BURROW_INSTALL_DIR:-$HOME/.local/bin}}"

# ── colors (skip when not a tty) ────────────────────────────────────────────
if [ -t 1 ]; then
  C_DIM=$'\e[2m'; C_OK=$'\e[32m'; C_BAD=$'\e[31m'; C_BRAND=$'\e[33m'; C_END=$'\e[0m'
else
  C_DIM=""; C_OK=""; C_BAD=""; C_BRAND=""; C_END=""
fi

err()  { printf "%s✗ %s%s\n" "$C_BAD" "$*" "$C_END" >&2; }
info() { printf "%s%s%s\n" "$C_DIM" "$*" "$C_END"; }
good() { printf "%s✓ %s%s\n" "$C_OK" "$*" "$C_END"; }

printf "%s🐹 burrowed installer%s\n\n" "$C_BRAND" "$C_END"

# ── platform check ──────────────────────────────────────────────────────────
if [ "$(uname -s)" != "Darwin" ]; then
  err "burrowed is macOS only. Detected: $(uname -s)"
  exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
  arm64) BIN_NAME="burrowed-darwin-arm64" ;;
  x86_64) BIN_NAME="burrowed-darwin-x64" ;;
  *) err "Unsupported architecture: $ARCH"; exit 1 ;;
esac
info "Platform: macOS / $ARCH"
info "Binary:   $BIN_NAME"

# ── download URLs ───────────────────────────────────────────────────────────
BASE="https://github.com/$REPO/releases/latest/download"
BIN_URL="$BASE/$BIN_NAME"
SHA_URL="$BASE/SHA256SUMS"

mkdir -p "$DEST"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

info "Downloading binary..."
curl -fsSL --progress-bar "$BIN_URL" -o "$TMP/burrowed"

info "Downloading checksums..."
curl -fsSL "$SHA_URL" -o "$TMP/SHA256SUMS"

# ── verify ──────────────────────────────────────────────────────────────────
info "Verifying SHA256..."
EXPECTED=$(awk -v b="$BIN_NAME" '$2 == b {print $1}' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ]; then
  err "Could not find $BIN_NAME in SHA256SUMS. Aborting."
  exit 1
fi
ACTUAL=$(shasum -a 256 "$TMP/burrowed" | awk '{print $1}')
if [ "$EXPECTED" != "$ACTUAL" ]; then
  err "SHA256 mismatch — refusing to install."
  err "  expected: $EXPECTED"
  err "  actual:   $ACTUAL"
  exit 1
fi
good "SHA256 verified"

# ── install ─────────────────────────────────────────────────────────────────
chmod +x "$TMP/burrowed"
mv "$TMP/burrowed" "$DEST/burrowed"
good "Installed to $DEST/burrowed"

# ── PATH check ──────────────────────────────────────────────────────────────
if ! command -v burrowed >/dev/null 2>&1; then
  printf "\n%s$DEST is not on your PATH yet.%s\n" "$C_BAD" "$C_END"
  printf "Add it with:\n\n"
  printf "  echo 'export PATH=\"%s:\$PATH\"' >> ~/.zshrc && exec zsh\n\n" "$DEST"
else
  printf "\n"
  good "burrowed is on your PATH"
fi

printf "\nTry:\n"
printf "  %sburrowed%s              %sinteractive dashboard%s\n" "$C_BRAND" "$C_END" "$C_DIM" "$C_END"
printf "  %sburrowed doctor%s       %ssanity-check available cleaners%s\n" "$C_BRAND" "$C_END" "$C_DIM" "$C_END"
printf "  %sburrowed score%s        %scomposite 0-100 health score%s\n" "$C_BRAND" "$C_END" "$C_DIM" "$C_END"
printf "  %sburrowed --help%s       %severything%s\n" "$C_BRAND" "$C_END" "$C_DIM" "$C_END"
printf "\n%sSafety: pass --quarantine on any clean to make it undoable.%s\n" "$C_DIM" "$C_END"
