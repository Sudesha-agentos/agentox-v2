#!/bin/bash
# The product page at agentox.io, deployed to Vercel through its REST API.
#
#   infra/deploy-site.sh deploy           build and deploy to the agentox-site project (production)
#   infra/deploy-site.sh domains          show which project currently serves agentox.io
#   infra/deploy-site.sh move-domains     attach agentox.io (and www -> agentox.io) to agentox-site
#
# The token is read from ~/.config/agentox/vercel-token (never printed). Set VERCEL_TEAM_ID when
# the domain lives in a team rather than a personal account.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${PROJECT:-agentox-site}"
DOMAIN="${DOMAIN:-agentox.io}"
TOKEN_FILE="$HOME/.config/agentox/vercel-token"
[ -s "$TOKEN_FILE" ] || { echo "Missing $TOKEN_FILE"; exit 1; }
AUTH="Authorization: Bearer $(tr -d '[:space:]' < "$TOKEN_FILE")"
TEAM_QS="${VERCEL_TEAM_ID:+teamId=$VERCEL_TEAM_ID}"

api() { # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}" sep="?" out code
  [[ "$path" == *\?* ]] && sep="&"
  local url="https://api.vercel.com$path${TEAM_QS:+$sep$TEAM_QS}"
  out=$(mktemp)
  if [ -n "$body" ]; then
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "$AUTH" -H 'Content-Type: application/json' --data "$body")
  else
    code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "$AUTH")
  fi
  if [ "${code:0:1}" != "2" ]; then echo "Vercel API $method $path returned $code: $(head -c 400 "$out")" >&2; rm -f "$out"; return 1; fi
  cat "$out"; rm -f "$out"
}

find_domain_project() {
  # Prints "<projectId> <projectName>" for the project that has $DOMAIN attached, if any.
  local next="" page
  while :; do
    page=$(api GET "/v9/projects?limit=100${next:+&until=$next}")
    for id in $(echo "$page" | jq -r '.projects[].id'); do
      if api GET "/v9/projects/$id/domains" 2>/dev/null | jq -e --arg d "$DOMAIN" '.domains[] | select(.name == $d)' >/dev/null; then
        echo "$id $(echo "$page" | jq -r --arg id "$id" '.projects[] | select(.id == $id) | .name')"; return 0
      fi
    done
    next=$(echo "$page" | jq -r '.pagination.next // empty'); [ -n "$next" ] || return 0
  done
}

case "${1:-}" in
  deploy)
    echo "Building..."
    npm run build >/dev/null
    stage=$(mktemp -d); cp -R dist/. "$stage/"
    # SPA fallback: Vercel serves real files first, then routes every other path to index.html.
    echo '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}],"headers":[{"source":"/assets/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]}]}' > "$stage/vercel.json"
    api GET "/v9/projects/$PROJECT" >/dev/null 2>&1 || api POST "/v11/projects" "$(jq -nc --arg n "$PROJECT" '{name: $n, framework: null}')" >/dev/null
    files="[]"
    while IFS= read -r -d '' f; do
      rel="${f#$stage/}"; sha=$(shasum -a 1 "$f" | cut -d' ' -f1); size=$(wc -c < "$f" | tr -d ' ')
      curl -sS -o /dev/null -w '' -X POST "https://api.vercel.com/v2/files${TEAM_QS:+?$TEAM_QS}" -H "$AUTH" \
        -H "x-vercel-digest: $sha" -H "Content-Type: application/octet-stream" --data-binary "@$f"
      files=$(echo "$files" | jq -c --arg file "$rel" --arg sha "$sha" --argjson size "$size" '. + [{file: $file, sha: $sha, size: $size}]')
    done < <(find "$stage" -type f -print0)
    body=$(jq -nc --arg n "$PROJECT" --argjson files "$files" \
      '{name: $n, project: $n, target: "production", files: $files, projectSettings: {framework: null, buildCommand: null, installCommand: null, outputDirectory: null}}')
    dep=$(api POST "/v13/deployments?skipAutoDetectionConfirmation=1" "$body")
    id=$(echo "$dep" | jq -r .id); url=$(echo "$dep" | jq -r .url)
    echo "Deployment $id created: https://$url"
    for _ in $(seq 1 60); do
      state=$(api GET "/v13/deployments/$id" | jq -r '.readyState // .status')
      case "$state" in READY) echo "Ready: https://$url"; break ;; ERROR|CANCELED) echo "Deployment $state"; exit 1 ;; esac
      sleep 3
    done
    rm -rf "$stage"
    ;;
  domains)
    found=$(find_domain_project || true)
    if [ -n "$found" ]; then echo "$DOMAIN is attached to project: ${found#* } (${found%% *})"; else echo "$DOMAIN is not attached to any project visible to this token"; fi
    ;;
  move-domains)
    found=$(find_domain_project || true)
    if [ -n "$found" ] && [ "${found#* }" != "$PROJECT" ]; then
      old_id="${found%% *}"
      echo "Detaching $DOMAIN and www.$DOMAIN from ${found#* }"
      api DELETE "/v9/projects/$old_id/domains/www.$DOMAIN" >/dev/null 2>&1 || true
      api DELETE "/v9/projects/$old_id/domains/$DOMAIN" >/dev/null
    fi
    api POST "/v10/projects/$PROJECT/domains" "$(jq -nc --arg d "$DOMAIN" '{name: $d}')" >/dev/null 2>&1 || echo "$DOMAIN already on $PROJECT"
    api POST "/v10/projects/$PROJECT/domains" "$(jq -nc --arg d "$DOMAIN" '{name: ("www." + $d), redirect: $d, redirectStatusCode: 308}')" >/dev/null 2>&1 || echo "www.$DOMAIN already on $PROJECT"
    api GET "/v9/projects/$PROJECT/domains" | jq -r '.domains[] | "\(.name)  verified=\(.verified)  redirect=\(.redirect // "-")"'
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
