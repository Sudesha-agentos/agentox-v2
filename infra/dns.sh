#!/bin/bash
# Hostinger DNS for agentox.io, through Hostinger's API.
#
#   infra/dns.sh show                 list current records
#   infra/dns.sh point-app <ipv4>     app A record -> <ipv4>, and remove app AAAA
#   infra/dns.sh ses-dkim             add the SES Easy DKIM CNAMEs from the stack's DkimRecords output
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
    # An ALIAS or CNAME on app (Hostinger adds one when app.agentox.io is set up as a website or
    # behind its CDN in hPanel) can't coexist with an A record, so it goes first.
    for t in ALIAS CNAME; do
      if call GET | jq -e --arg t "$t" '.[] | select(.name == "app" and .type == $t)' >/dev/null; then
        call DELETE "$(jq -nc --arg t "$t" '{filters: [{name: "app", type: $t}]}')" >/dev/null && echo "Removed:   app $t"
      fi
    done
    body=$(jq -nc --arg ip "$ip" '{overwrite: true, zone: [{name: "app", type: "A", ttl: 300, records: [{content: $ip}]}]}')
    URL="$API/validate" call POST "$body" >/dev/null && echo "Validated: app A -> $ip"
    call PUT "$body" >/dev/null && echo "Applied:   app A -> $ip"
    if call GET | jq -e '.[] | select(.name == "app" and .type == "AAAA")' >/dev/null; then
      call DELETE '{"filters":[{"name":"app","type":"AAAA"}]}' >/dev/null && echo "Removed:   app AAAA"
    fi
    call GET | jq -r '.[] | select(.name == "app") | "Now:       \(.type) app -> \([.records[].content] | join(", "))"'
    ;;
  ses-dkim)
    recs=$(aws cloudformation describe-stacks --stack-name "${STACK:-agentox}" \
      --query "Stacks[0].Outputs[?OutputKey=='DkimRecords'].OutputValue" --output text)
    [ -n "$recs" ] && [ "$recs" != "None" ] || { echo "No DkimRecords output; run infra/deploy.sh apply first."; exit 1; }
    zone="[]"
    for pair in $recs; do
      name="${pair%%=*}"; value="${pair#*=}"
      name="${name%.}"; name="${name%.$DOMAIN}"   # relative to the zone
      zone=$(echo "$zone" | jq -c --arg n "$name" --arg v "$value" '. + [{name: $n, type: "CNAME", ttl: 3600, records: [{content: $v}]}]')
    done
    backup
    body=$(jq -nc --argjson z "$zone" '{overwrite: true, zone: $z}')
    URL="$API/validate" call POST "$body" >/dev/null && echo "Validated: $(echo "$zone" | jq length) DKIM records"
    call PUT "$body" >/dev/null && echo "Applied:   $(echo "$zone" | jq -r '[.[].name] | join(", ")')"
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
