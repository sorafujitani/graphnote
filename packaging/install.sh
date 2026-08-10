#!/bin/sh
# graphnote CLI installer — https://graphnote.app
#
#   curl -fsSL https://graphnote.app/install.sh | sh
#
# Environment:
#   GRAPHNOTE_URL   base URL to install from (default https://graphnote.app)
#   GQN_PREFIX      install prefix (default $HOME/.local)
#
# Installs the `gqn` bundle into $GQN_PREFIX/share/graphnote and a launcher
# into $GQN_PREFIX/bin. Agent skills come from `npx skills add`, not from here.

set -eu

BASE_URL="${GRAPHNOTE_URL:-https://graphnote.app}"
BASE_URL="${BASE_URL%/}"
PREFIX="${GQN_PREFIX:-$HOME/.local}"
LIB_DIR="$PREFIX/share/graphnote"
BIN_DIR="$PREFIX/bin"

die() {
  echo "install: $1" >&2
  exit 1
}

fetch() {
  # $1 = url, $2 = destination
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    die "need curl or wget"
  fi
}

command -v node >/dev/null 2>&1 || die "Node.js 20+ is required (https://nodejs.org)"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20+ is required, found $(node --version)"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading gqn from $BASE_URL"
fetch "$BASE_URL/install/gqn.mjs" "$TMP_DIR/gqn.mjs" ||
  die "cannot reach $BASE_URL/install/gqn.mjs"

# The site serves an SPA fallback page for unknown paths with status 200, so a
# missing asset arrives as HTML. Verify we actually got the JS bundle.
case "$(head -n 1 "$TMP_DIR/gqn.mjs")" in
"<"*) die "downloaded file is HTML, not the gqn bundle — the asset may be missing from this deploy" ;;
esac

node --check "$TMP_DIR/gqn.mjs" 2>/dev/null ||
  die "downloaded file failed a JavaScript syntax check; retry or report an issue"

mkdir -p "$LIB_DIR" "$BIN_DIR"
cp "$TMP_DIR/gqn.mjs" "$LIB_DIR/gqn.mjs"

# Launcher instead of a symlink: `node` stays the one on PATH at run time.
cat >"$BIN_DIR/gqn" <<EOF
#!/bin/sh
exec node "$LIB_DIR/gqn.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/gqn"

echo "Installed:"
echo "  $BIN_DIR/gqn"

case ":$PATH:" in
*":$BIN_DIR:"*) ;;
*)
  echo
  echo "Add the launcher to PATH:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
  ;;
esac

cat <<EOF

Next:
  1. $BASE_URL/integrations → create an access key
  2. gqn config set-token    # paste the key into the hidden prompt
  3. gqn graphs list

Agent skills (gqn · gqn-teach · gqn-node-refactor):
  npx skills add sorafujitani/graphnote

Remove with: rm -rf "$LIB_DIR" "$BIN_DIR/gqn"
EOF
