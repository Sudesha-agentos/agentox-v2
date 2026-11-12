#!/bin/bash
# Installs one agentox release on the server and (re)starts it. Runs as root via SSM Run Command.
#   install-release.sh <release-id> <public-host> <backup-bucket> <region> [mail-domain]
set -euo pipefail
RELEASE_ID="$1"
HOST="$2"
BUCKET="$3"
REGION="$4"
MAIL_DOMAIN="${5:-agentox.io}"
REL="/opt/agentox/releases/$RELEASE_ID"
[ -d "$REL/dist" ] || { echo "release $RELEASE_ID is missing dist/"; exit 1; }
[ -f /var/lib/agentox/bootstrap.done ] || { echo "base bootstrap has not finished yet"; exit 1; }

install -d -m 755 /opt/agentox/bin /etc/caddy
install -d -m 750 -o root -g agentox /etc/agentox
echo "$REGION" > /etc/agentox/region
echo "$HOST" > /etc/agentox/host

# ---------------------------------------------------------- secrets helper
# Generated once on this server and stored as SecureString in Parameter Store. They never
# leave AWS and are never written to backups.
cat > /opt/agentox/bin/agentox-param <<'PARAM'
#!/bin/bash
# agentox-param <name> <command that generates a value>   prints the stored (or new) value
set -euo pipefail
REGION=$(cat /etc/agentox/region)
name="/agentox/$1"
if ! aws ssm get-parameter --region "$REGION" --name "$name" --with-decryption --query Parameter.Value --output text 2>/dev/null; then
  aws ssm put-parameter --region "$REGION" --name "$name" --type SecureString --value "$(eval "$2")" --no-overwrite >/dev/null || true
  aws ssm get-parameter --region "$REGION" --name "$name" --with-decryption --query Parameter.Value --output text
fi
PARAM
chmod 750 /opt/agentox/bin/agentox-param

# ----------------------------------------------------------------- database
# Public deployments must use a real Postgres, not the engine's embedded one. A local
# PostgreSQL 17 listens on localhost only, so it costs nothing extra.
rpm -q postgresql17-contrib >/dev/null 2>&1 || dnf -y install postgresql17-server postgresql17 postgresql17-contrib
PGDATA=/var/lib/pgsql/data
[ -s "$PGDATA/PG_VERSION" ] || postgresql-setup --initdb
cat > "$PGDATA/agentox.conf" <<'PGCONF'
listen_addresses = 'localhost'
max_connections = 60
shared_buffers = 128MB
effective_cache_size = 384MB
work_mem = 4MB
maintenance_work_mem = 64MB
password_encryption = scram-sha-256
PGCONF
grep -q "include = 'agentox.conf'" "$PGDATA/postgresql.conf" || echo "include = 'agentox.conf'" >> "$PGDATA/postgresql.conf"
cat > "$PGDATA/pg_hba.conf" <<'HBA'
# local administration as the postgres OS user; the engine connects over localhost with a password
local   all   postgres                 peer
local   all   all                      scram-sha-256
host    all   all   127.0.0.1/32       scram-sha-256
host    all   all   ::1/128            scram-sha-256
HBA
chown postgres:postgres "$PGDATA/agentox.conf" "$PGDATA/pg_hba.conf"
systemctl enable postgresql
systemctl restart postgresql
DB_PASSWORD=$(/opt/agentox/bin/agentox-param db-password "openssl rand -hex 24")
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -v pw="$DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE agentox LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agentox') \gexec
ALTER ROLE agentox WITH LOGIN PASSWORD :'pw';
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='agentox'" | grep -q 1 || sudo -u postgres createdb -O agentox agentox
# Extensions the engine's migrations need, created up front by the superuser.
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d agentox -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' -c 'CREATE EXTENSION IF NOT EXISTS fuzzystrmatch'
unset DB_PASSWORD
# The embedded database from the first attempt was never used; reclaim its space.
rm -rf /var/lib/agentox/home/instances/default/db

# ----------------------------------------------------------- engine settings
# agentox names only; the launcher maps AGENTOX_ENGINE_* onto the engine's own variables.
cat > /etc/agentox/engine.env <<EOF
NODE_ENV=production
HOME=/home/agentox
PATH=/opt/agentox/npm/bin:/usr/local/bin:/usr/bin:/bin
AGENTOX_PORT=3100
AGENTOX_DATA_DIR=/var/lib/agentox/home
AGENTOX_ENGINE_DEPLOYMENT_MODE=authenticated
AGENTOX_ENGINE_DEPLOYMENT_EXPOSURE=public
AGENTOX_ENGINE_BIND=loopback
AGENTOX_ENGINE_PUBLIC_URL=https://$HOST
AGENTOX_ENGINE_AUTH_PUBLIC_BASE_URL=https://$HOST
AGENTOX_ENGINE_AUTH_BASE_URL_MODE=explicit
AGENTOX_ENGINE_ALLOWED_HOSTNAMES=$HOST
AGENTOX_ENGINE_API_URL=http://127.0.0.1:3100
AGENTOX_ENGINE_TELEMETRY_DISABLED=1
DO_NOT_TRACK=1
EOF
# Self-serve: anyone can create an account. The gateway decides which workspace they reach
# (a verified email, then their team's workspace by domain, or their own).
echo "AGENTOX_ENGINE_AUTH_DISABLE_SIGN_UP=false" > /etc/agentox/signup.env
chgrp agentox /etc/agentox/engine.env /etc/agentox/signup.env
chmod 640 /etc/agentox/engine.env /etc/agentox/signup.env

# The engine's own CLI (used for recovery, e.g. auth bootstrap-ceo) reads the mode from its config
# file rather than the environment, so keep that file in line with how the engine actually runs.
CONF=/var/lib/agentox/home/instances/default/config.json
if [ -f "$CONF" ]; then
  jq --arg url "https://$HOST" '.server.deploymentMode="authenticated" | .server.exposure="public"
     | .auth.baseUrlMode="explicit" | .auth.publicBaseUrl=$url | .auth.disableSignUp=false' "$CONF" > "$CONF.new"
  chown agentox:agentox "$CONF.new"; chmod --reference="$CONF" "$CONF.new"; mv "$CONF.new" "$CONF"
fi

# ----------------------------------------------------------- gateway settings
ENGINE_VERSION=$(grep -oE 'paperclipai@[0-9][0-9.]*' "$REL/scripts/server.mjs" | head -1 | cut -d@ -f2)
cat > /etc/agentox/gateway.env <<EOF
NODE_ENV=production
HOME=/home/agentox
GATEWAY_PORT=3200
ENGINE_URL=http://127.0.0.1:3100
MAIL_MODE=ses
MAIL_FROM="agentox <no-reply@$MAIL_DOMAIN>"
AWS_REGION=$REGION
ENGINE_CLI_VERSION=$ENGINE_VERSION
EOF
chgrp agentox /etc/agentox/gateway.env
chmod 640 /etc/agentox/gateway.env

# ------------------------------------------------------------------ secrets
# Loaded into a root-owned runtime file at every start; the engine reads it into memory.
cat > /opt/agentox/bin/agentox-secrets <<'SECRETS'
#!/bin/bash
set -euo pipefail
p=/opt/agentox/bin/agentox-param
install -d -m 750 -o root -g agentox /run/agentox
umask 027
{
  echo "AGENTOX_ENGINE_SECRETS_MASTER_KEY=$($p secrets-master-key "openssl rand -base64 32")"
  echo "BETTER_AUTH_SECRET=$($p auth-secret "openssl rand -hex 32")"
  echo "AGENTOX_ENGINE_AGENT_JWT_SECRET=$($p agent-jwt-secret "openssl rand -hex 32")"
  echo "AGENTOX_ENGINE_TOOL_ACTION_SIGNING_SECRET=$($p tool-action-signing-secret "openssl rand -hex 32")"
  echo "AGENTOX_DATABASE_URL=postgres://agentox:$($p db-password "openssl rand -hex 24")@127.0.0.1:5432/agentox"
} > /run/agentox/secrets.env.tmp
chgrp agentox /run/agentox/secrets.env.tmp
mv /run/agentox/secrets.env.tmp /run/agentox/secrets.env

# The engine also keeps a signing key on disk. Mirror it into Parameter Store so it survives a
# restore without ever being written to a backup.
REGION=$(cat /etc/agentox/region)
key=/var/lib/agentox/home/instances/default/secrets/decision-signing.key
param=/agentox/decision-signing-key
if [ -s "$key" ]; then
  aws ssm get-parameter --region "$REGION" --name "$param" >/dev/null 2>&1 \
    || aws ssm put-parameter --region "$REGION" --name "$param" --type SecureString --value "$(cat "$key")" >/dev/null
elif stored=$(aws ssm get-parameter --region "$REGION" --name "$param" --with-decryption --query Parameter.Value --output text 2>/dev/null); then
  install -d -m 700 -o agentox -g agentox "$(dirname "$key")"
  printf '%s' "$stored" > "$key"
  chown agentox:agentox "$key"; chmod 600 "$key"
fi
SECRETS
chmod 750 /opt/agentox/bin/agentox-secrets

# The gateway's secrets: its code-signing secret, the database URL and the key of its service
# account (created by agentox-gateway-setup below).
cat > /opt/agentox/bin/agentox-gateway-secrets <<'SECRETS'
#!/bin/bash
set -euo pipefail
p=/opt/agentox/bin/agentox-param
REGION=$(cat /etc/agentox/region)
install -d -m 750 -o root -g agentox /run/agentox
umask 027
key=$(aws ssm get-parameter --region "$REGION" --name /agentox/gateway-service-key --with-decryption --query Parameter.Value --output text)
{
  echo "GATEWAY_CODE_SECRET=$($p gateway-code-secret "openssl rand -hex 32")"
  echo "GATEWAY_SERVICE_KEY=$key"
  echo "DATABASE_URL=postgres://agentox:$($p db-password "openssl rand -hex 24")@127.0.0.1:5432/agentox"
} > /run/agentox/gateway.env.tmp
chgrp agentox /run/agentox/gateway.env.tmp
mv /run/agentox/gateway.env.tmp /run/agentox/gateway.env
SECRETS
chmod 750 /opt/agentox/bin/agentox-gateway-secrets

cat > /opt/agentox/bin/agentox-gateway <<'EOF'
#!/bin/bash
set -euo pipefail
set -a
. /etc/agentox/gateway.env
. /run/agentox/gateway.env
set +a
cd /opt/agentox/current/gateway
exec /usr/local/bin/node dist/gateway.mjs
EOF
chmod 755 /opt/agentox/bin/agentox-gateway

# One-time: a service account the gateway acts as. It must be an instance admin, because only
# instance admins can create workspaces. Its key lives only in Parameter Store.
cat > /opt/agentox/bin/agentox-gateway-setup <<'SETUP'
#!/bin/bash
set -euo pipefail
REGION=$(cat /etc/agentox/region)
HOST=$(cat /etc/agentox/host)
E=http://127.0.0.1:3100
key=$(aws ssm get-parameter --region "$REGION" --name /agentox/gateway-service-key --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
if [ -n "$key" ] && curl -sf -H "Authorization: Bearer $key" "$E/api/cli-auth/me" | jq -e '.isInstanceAdmin == true' >/dev/null; then
  echo "gateway service account: ok"; exit 0
fi
email="system@$HOST"
pass=$(/opt/agentox/bin/agentox-param gateway-service-password "openssl rand -hex 24")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
auth() { # auth <sign-up|sign-in> <json>
  curl -sS -D "$tmp/h" -o "$tmp/b" -w '%{http_code}' -X POST "$E/api/auth/$1/email" \
    -H "Content-Type: application/json" -H "Origin: https://$HOST" -H "Host: $HOST" -H "X-Forwarded-Proto: https" --data "$2"
}
code=$(auth sign-up "$(jq -nc --arg e "$email" --arg p "$pass" '{email: $e, password: $p, name: "agentox"}')")
[ "${code:0:1}" = 2 ] || code=$(auth sign-in "$(jq -nc --arg e "$email" --arg p "$pass" '{email: $e, password: $p}')")
[ "${code:0:1}" = 2 ] || { echo "service account sign-in failed ($code)"; exit 1; }
uid=$(jq -r '.user.id' "$tmp/b")
# The engine marks its session cookies Secure; send them explicitly over loopback.
cookie=$(grep -i '^set-cookie:' "$tmp/h" | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+).*/\1/' | paste -sd ';' -)
sudo -u postgres psql -d agentox -v ON_ERROR_STOP=1 -q -v uid="$uid" <<'SQL'
INSERT INTO instance_user_roles (user_id, role) VALUES (:'uid', 'instance_admin') ON CONFLICT DO NOTHING;
SQL
token=$(curl -sS -X POST "$E/api/board-api-keys" -H "Content-Type: application/json" -H "Origin: https://$HOST" -H "Host: $HOST" \
  -H "X-Forwarded-Proto: https" -H "Cookie: $cookie" --data '{"name": "agentox gateway", "expiresAt": null}' | jq -r '.token // empty')
[ -n "$token" ] || { echo "could not create the gateway key"; exit 1; }
aws ssm put-parameter --region "$REGION" --name /agentox/gateway-service-key --type SecureString --value "$token" --overwrite >/dev/null
echo "gateway service account: created"
SETUP
chmod 750 /opt/agentox/bin/agentox-gateway-setup

cat > /opt/agentox/bin/agentox-engine <<'EOF'
#!/bin/bash
set -euo pipefail
set -a
. /etc/agentox/engine.env
. /etc/agentox/signup.env
. /run/agentox/secrets.env
set +a
cd /opt/agentox/current
exec /usr/local/bin/node scripts/server.mjs
EOF
chmod 755 /opt/agentox/bin/agentox-engine

# ------------------------------------------------------------------- backups
cat > /opt/agentox/bin/agentox-backup <<BACKUP
#!/bin/bash
# Nightly: a consistent database dump plus engine files (attachments, logs). Secrets stay in SSM.
set -euo pipefail
day=\$(date -u +%F)
sudo -u postgres pg_dump -Fc agentox > /var/tmp/agentox-db.dump
aws s3 cp /var/tmp/agentox-db.dump "s3://$BUCKET/backups/\$day/agentox-db.dump" --region "$REGION" --only-show-errors
rm -f /var/tmp/agentox-db.dump
aws s3 sync /var/lib/agentox/home "s3://$BUCKET/backups/\$day/home/" \\
  --region "$REGION" --only-show-errors \\
  --exclude "*/db/*" --exclude "*/secrets/*" --exclude "*/node_modules/*" --exclude "*/.npm/*"
BACKUP
chmod 750 /opt/agentox/bin/agentox-backup

# -------------------------------------------------------------------- caddy
cat > /etc/caddy/Caddyfile <<EOF
{
	admin off
}

$HOST {
	encode zstd gzip

	# Self-serve sign-up, access requests and terminal sign-in. Named matchers keep their order,
	# so this is tried before the engine's broader /api/*.
	@gateway path /api/agentox/* /cli
	handle @gateway {
		reverse_proxy 127.0.0.1:3200
	}

	@engine path /api/* /mcp/* /.well-known/oauth-protected-resource* /.well-known/oauth-authorization-server*
	handle @engine {
		# Caddy keeps the browser's Host header, which the engine's origin check requires.
		reverse_proxy 127.0.0.1:3100
	}

	handle {
		root * /opt/agentox/current/dist
		try_files {path} /index.html
		file_server
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
EOF

# ------------------------------------------------------------------ services
cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy web server for agentox
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Group=caddy
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/agentox-engine.service <<'EOF'
[Unit]
Description=agentox engine
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
User=agentox
Group=agentox
ExecStartPre=+/opt/agentox/bin/agentox-secrets
ExecStart=/opt/agentox/bin/agentox-engine
Restart=always
RestartSec=5
TimeoutStopSec=60
PrivateTmp=true
ProtectSystem=full
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/agentox-gateway.service <<'EOF'
[Unit]
Description=agentox gateway (sign-up, workspaces, access requests)
After=network-online.target postgresql.service agentox-engine.service
Wants=network-online.target agentox-engine.service
Requires=postgresql.service

[Service]
User=agentox
Group=agentox
ExecStartPre=+/opt/agentox/bin/agentox-gateway-secrets
ExecStart=/opt/agentox/bin/agentox-gateway
Restart=always
RestartSec=5
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/agentox-backup.service <<'EOF'
[Unit]
Description=agentox nightly backup to S3

[Service]
Type=oneshot
ExecStart=/opt/agentox/bin/agentox-backup
EOF

cat > /etc/systemd/system/agentox-backup.timer <<'EOF'
[Unit]
Description=Run the agentox backup every night

[Timer]
OnCalendar=*-*-* 21:30:00 UTC
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ------------------------------------------------------------------ activate
chmod -R a+rX "$REL"
ln -sfn "$REL" /opt/agentox/current
systemctl daemon-reload
systemctl enable --now agentox-backup.timer
systemctl enable caddy agentox-engine agentox-gateway
systemctl restart agentox-engine
for _ in $(seq 1 60); do curl -sf http://127.0.0.1:3100/api/health | jq -e '.status == "ok"' >/dev/null && break; sleep 3; done
/opt/agentox/bin/agentox-gateway-setup || echo "WARNING: gateway setup failed; rerun /opt/agentox/bin/agentox-gateway-setup, then restart agentox-gateway"
systemctl restart agentox-gateway
systemctl restart caddy

# Keep the five most recent releases.
ls -1dt /opt/agentox/releases/* | tail -n +6 | xargs -r rm -rf

echo "installed release $RELEASE_ID for https://$HOST"
