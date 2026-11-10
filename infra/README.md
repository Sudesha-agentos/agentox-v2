# agentox on AWS

A single free-tier-friendly EC2 instance runs everything:

- **Caddy** terminates HTTPS (automatic certificates), serves the built interface, and proxies
  `/api`, `/mcp` and WebSockets to the engine on `127.0.0.1:3100`, keeping the browser's Host.
- **The engine** (via `scripts/server.mjs`) runs in authenticated, public mode under systemd as the
  unprivileged `agentox` user.
- **PostgreSQL 17** runs locally, listening on localhost only. Public deployments must use a real
  Postgres; the engine refuses its embedded database in this mode.
- **Secrets** (master key, auth secret, agent token secret, signing keys, database password) are
  generated on the server and stored only in SSM Parameter Store as SecureStrings under `/agentox/`.
- **Backups**: a nightly `pg_dump` plus engine files go to a private, encrypted S3 bucket
  (30-day retention). Secrets are never included.
- **Operations**: auto-recover on AWS hardware faults, auto-reboot if the instance hangs,
  email alerts, and access through Session Manager only (no SSH, ports 80/443 open).

## Commands

```bash
export AWS_PROFILE=agentox-admin AWS_REGION=ap-south-1

ALERT_EMAIL=you@example.com APP_DOMAIN=app.agentox.io infra/deploy.sh plan   # preview changes
infra/deploy.sh apply      # create or update the infrastructure
infra/deploy.sh release    # build the interface, ship it, restart the server
infra/deploy.sh status     # outputs, DNS check and health
```

After the first `apply`, point an **A record** for `APP_DOMAIN` at the `PublicIp` output and remove
any AAAA record for that name. Caddy obtains the certificate as soon as DNS resolves.

## First admin

Public deployments are claimed with a one-time invite created on the server:

```bash
# on the server, through Session Manager
sudo -u agentox bash -lc 'set -a; . /etc/agentox/engine.env; . /run/agentox/secrets.env; set +a; \
  npx --yes paperclipai@2026.1106.0 auth bootstrap-ceo --data-dir /var/lib/agentox/home'
```

Open the printed `/invite/...` link, create your account and accept. Then switch sign-up off:

```bash
echo "AGENTOX_ENGINE_AUTH_DISABLE_SIGN_UP=true" | sudo tee /etc/agentox/signup.env && sudo systemctl restart agentox-engine
```

## Cost

About 16 to 19 USD a month in `ap-south-1` with `t4g.small`: the instance, a 30 GB gp3 disk and a
public IPv4 address. Everything else stays inside always-free allowances.

## Teardown

```bash
aws cloudformation delete-stack --stack-name agentox
```

This removes everything except the backup bucket, which is retained on purpose. Delete it and the
`/agentox/*` parameters by hand once you no longer need the data.
