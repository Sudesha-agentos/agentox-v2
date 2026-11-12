# agentox on AWS

A single free-tier-friendly EC2 instance runs everything:

- **Caddy** terminates HTTPS (automatic certificates), serves the built interface, and proxies
  `/api`, `/mcp` and WebSockets to the engine on `127.0.0.1:3100`, keeping the browser's Host.
- **The engine** (via `scripts/server.mjs`) runs in authenticated, public mode under systemd as the
  unprivileged `agentox` user.
- **The gateway** (`gateway/server.mjs`, port 3200) runs the self-serve layer: email verification
  codes, one workspace per company email domain (personal addresses get their own), requests to
  join that owners and admins approve, and one-time codes for terminal sign-in (`/cli`). It acts
  through a service account that is an instance admin, and grants membership through the engine's
  own invites. Mail goes out through Amazon SES from `no-reply@agentox.io`.
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

## Email (one time)

`infra/deploy.sh apply` creates the SES identity for `agentox.io`. Then:

```bash
infra/dns.sh ses-dkim        # add the three DKIM CNAMEs to Hostinger DNS
aws sesv2 get-email-identity --email-identity agentox.io --query DkimAttributes.Status   # SUCCESS once DNS has propagated
```

New SES accounts are in the sandbox: they can only send to verified addresses. Request production
access once (AWS reviews it within about a day):

```bash
aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL \
  --website-url https://agentox.io --contact-language EN \
  --use-case-description "Sign-up verification codes and workspace access notifications for agentox users."
```

## Recovering admin access

Sign-up is self-serve, so day to day nobody needs this. To mint an instance-admin invite by hand:

```bash
# on the server, through Session Manager (each release keeps config.json in line with the real
# mode, which bootstrap-ceo reads instead of the environment)
sudo -u agentox bash -c 'set -a; . /etc/agentox/engine.env; . /run/agentox/secrets.env; set +a; \
  export DATABASE_URL="$AGENTOX_DATABASE_URL"; \
  for v in $(compgen -e | grep ^AGENTOX_ENGINE_); do export "PAPERCLIP_${v#AGENTOX_ENGINE_}=${!v}"; done; \
  cd /opt/agentox/current && npx --yes paperclipai@2026.1106.0 auth bootstrap-ceo --data-dir /var/lib/agentox/home'
```

Open the printed `/invite/...` link while signed in and accept it.

## Product page (agentox.io)

The same build serves the product page from Vercel; it switches to marketing mode by hostname
(see `.env.production`). The token lives in `~/.config/agentox/vercel-token`.

```bash
infra/deploy-site.sh deploy         # build and ship to the agentox-site project
infra/deploy-site.sh move-domains   # one time: attach agentox.io, www -> agentox.io (308)
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
