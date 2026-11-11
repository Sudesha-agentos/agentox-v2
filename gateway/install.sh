#!/bin/sh
# agentox terminal setup. Installs the `agentox` command and, given a code from the app
# (Run in terminal), signs it in as you.
#
#   curl -fsSL __API_BASE__/cli | sh -s -- XXXX-XXXX
set -eu

API="__API_BASE__"
VERSION="__CLI_VERSION__"
CODE="${1:-}"
DIR="${AGENTOX_HOME:-$HOME/.agentox}"

say() { printf '%s\n' "$*"; }
fail() { printf 'agentox: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required. Install it from https://nodejs.org and run this again."
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 20 ] || fail "Node.js 20 or newer is required (found $(node -v))."
command -v curl >/dev/null 2>&1 || fail "curl is required."

mkdir -p "$DIR/bin"
chmod 700 "$DIR"
cat > "$DIR/bin/agentox" <<EOF
#!/bin/sh
export PAPERCLIP_API_URL="\${AGENTOX_API_URL:-$API}"
export PAPERCLIP_AUTH_STORE="\${AGENTOX_AUTH_STORE:-$DIR/auth.json}"
exec npx --yes paperclipai@$VERSION "\$@"
EOF
chmod 755 "$DIR/bin/agentox"
say "Installed agentox to $DIR/bin/agentox"

if [ -n "$CODE" ]; then
  printf '%s' "$CODE" | grep -Eq '^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$' || fail "That doesn't look like an agentox code."
  resp=$(curl -fsS -X POST "$API/api/agentox/cli/exchange" -H 'Content-Type: application/json' --data "{\"code\":\"$CODE\"}") \
    || fail "That code is invalid or expired. Get a new one in agentox under Run in terminal."
  node -e '
    const fs = require("fs");
    const [raw, file, api] = process.argv.slice(1);
    const x = JSON.parse(raw);
    let store = { version: 1, credentials: {} };
    try { store = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    store.credentials = store.credentials || {};
    const now = new Date().toISOString();
    store.credentials[api] = { apiBase: api, token: x.token, createdAt: now, updatedAt: now, userId: x.userId };
    fs.writeFileSync(file, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  ' "$resp" "$DIR/auth.json" "$API"
  say "Signed in to $API"
fi

case ":$PATH:" in
  *":$DIR/bin:"*) ;;
  *)
    line="export PATH=\"$DIR/bin:\$PATH\""
    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
      if [ -f "$rc" ] && ! grep -Fq "$DIR/bin" "$rc"; then
        printf '\n# agentox\n%s\n' "$line" >> "$rc"
        say "Added agentox to your PATH in $rc"
      fi
    done
    say "Open a new terminal, or run: $line"
    ;;
esac

say ""
say "Try:  agentox auth whoami"
