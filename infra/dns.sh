#!/bin/bash
# Hostinger DNS for agentox.io, through Hostinger's API.
#
#   infra/dns.sh show                 list current records
#   infra/dns.sh point-app <ipv4>     app A record -> <ipv4>, and remove app AAAA
#
# The token is read from ~/.config/agentox/hostinger-token (never printed). Every change first
# saves the whole zone to ~/.config/agentox/dns-backups/, then validates, then applies.
# Hostinger also keeps zone snapshots that can be restored from hPanel.
set -euo pipefail
DOMAIN="${DOMAIN:-agentox.io}"
API="https://developers.hostinger.com/api/dns/v1/zones/$DOMAIN"
TOKEN_FILE="$HOME/.config/agentox/hostinger-token"
[ -s "$TOKEN_FILE" ] || { echo "Missing $TOKEN_FILE"; exit 1; }
AUTH="Authorization: Bearer $(tr -d '[:space:]' < "$TOKEN_FILE")"

call() { # call <method> [json-body]
  local method="$1" body="${2:-}" out code
  out=$(mktemp)
  if [ -n "$body" ]; then
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "${URL:-$API}" -H "$AUTH" -H 'Content-Type: application/json' -H 'Accept: application/json' --data "$body")
  else
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "${URL:-$API}" -H "$AUTH" -H 'Accept: application/json')
  fi
  if [ "${code:0:1}" != "2" ]; then echo "Hostinger API $method returned $code: $(head -c 400 "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}

backup() {
  local dir="$HOME/.config/agentox/dns-backups" f
  mkdir -p "$dir"; f="$dir/$DOMAIN-$(date -u +%Y%m%dT%H%M%SZ).json"
  call GET > "$f"; echo "Saved current zone to $f"
}

case "${1:-}" in
  show)
    call GET | jq -r '.[] | "\(.type)\t\(.name)\t\(.ttl)\t\([.records[].content] | join(", "))"' | sort | column -t -s $'\t'
    ;;
  point-app)
    ip="${2:?usage: infra/dns.sh point-app <ipv4>}"
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "Not an IPv4 address: $ip"; exit 1; }
    backup
    body=$(jq -nc --arg ip "$ip" '{overwrite: true, zone: [{name: "app", type: "A", ttl: 300, records: [{content: $ip}]}]}')
    URL="$API/validate" call POST "$body" >/dev/null && echo "Validated: app A -> $ip"
    call PUT "$body" >/dev/null && echo "Applied:   app A -> $ip"
    if call GET | jq -e '.[] | select(.name == "app" and .type == "AAAA")' >/dev/null; then
      call DELETE '{"filters":[{"name":"app","type":"AAAA"}]}' >/dev/null && echo "Removed:   app AAAA"
    fi
    call GET | jq -r '.[] | select(.name == "app") | "Now:       \(.type) app -> \([.records[].content] | join(", "))"'
    ;;
  *)
    sed -n '2,9p' "$0"; exit 1 ;;
esac
