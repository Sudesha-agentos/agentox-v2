/**
 * agentox gateway: the self-serve layer in front of the engine.
 *
 *   email verification     a 6-digit code proves the address before it can own or join a workspace
 *   domain workspaces      the first verified person from a company domain gets that workspace;
 *                          personal addresses (gmail, outlook, ...) get a workspace of their own
 *   access requests        later people from the domain ask to join; owners and admins admit them
 *   terminal sign-in       a one-time code that the `agentox` CLI exchanges for a board key
 *
 * The engine only lets an instance admin create workspaces, so the gateway acts through a service
 * user (GATEWAY_SERVICE_KEY). Membership is always granted through the engine's own invite flow,
 * accepted with the person's session, so roles and permission grants come out exactly as the
 * engine would make them.
 *
 * Routes live under /api/agentox/*, plus GET /cli (the terminal installer).
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const env = process.env;
const cfg = {
  port: Number(env.GATEWAY_PORT || 3200),
  host: env.GATEWAY_HOST || "127.0.0.1",
  engine: new URL(env.ENGINE_URL || "http://127.0.0.1:3100"),
  databaseUrl: env.DATABASE_URL,
  serviceKey: env.GATEWAY_SERVICE_KEY,
  codeSecret: env.GATEWAY_CODE_SECRET,
  mailMode: env.MAIL_MODE || "ses", // "ses" in production, "log" prints mail to stdout (development)
  mailFrom: env.MAIL_FROM || "agentox <no-reply@agentox.io>",
  region: env.AWS_REGION,
  cliVersion: env.ENGINE_CLI_VERSION || "2026.1106.0",
};
for (const k of ["databaseUrl", "serviceKey", "codeSecret"]) {
  if (!cfg[k]) throw new Error(`gateway: missing ${k}`);
}

const log = (msg, extra = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

/* ---------------------------------------------------------------- database */

const db = new pg.Pool({ connectionString: cfg.databaseUrl, max: Number(env.GATEWAY_DB_POOL || 5) });
const q = async (text, params) => (await db.query(text, params)).rows;

async function migrate() {
  await db.query(`
    create schema if not exists agentox_gw;
    create table if not exists agentox_gw.email_codes (
      user_id text primary key,
      email text not null,
      code_hash text not null,
      expires_at timestamptz not null,
      attempts int not null default 0,
      sent_at timestamptz not null default now(),
      window_start timestamptz not null default now(),
      window_count int not null default 1
    );
    create table if not exists agentox_gw.verified_emails (
      user_id text primary key,
      email text not null,
      verified_at timestamptz not null default now()
    );
    create table if not exists agentox_gw.workspaces (
      key text primary key,
      domain text,
      company_id uuid,
      created_by text not null,
      status text not null default 'creating',
      created_at timestamptz not null default now()
    );
    create table if not exists agentox_gw.access_requests (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null,
      user_id text not null,
      email text not null,
      name text,
      role text,
      status text not null default 'pending',
      decided_by text,
      decided_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now()
    );
    create unique index if not exists access_requests_open
      on agentox_gw.access_requests (company_id, user_id) where status in ('pending', 'approved');
  `);
}

/* ------------------------------------------------------------------ engine */

/** Calls the engine. `as` forwards a browser request's session and origin; otherwise the service key is used. */
function engine(method, pathname, { as, body } = {}) {
  const headers = { accept: "application/json" };
  if (as) {
    if (as.headers.cookie) headers.cookie = as.headers.cookie;
    headers.host = as.headers.host;
    headers["x-forwarded-host"] = as.headers["x-forwarded-host"] || as.headers.host;
    headers["x-forwarded-proto"] = as.headers["x-forwarded-proto"] || "http";
    headers.origin = originOf(as);
  } else {
    headers.authorization = `Bearer ${cfg.serviceKey}`;
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload) headers["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: cfg.engine.hostname, port: cfg.engine.port, path: pathname, method, headers, timeout: 15000 },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("engine timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function engineOk(method, pathname, opts) {
  const r = await engine(method, pathname, opts);
  if (r.status < 200 || r.status >= 300) {
    const msg = r.json?.error || r.json?.message || `engine ${method} ${pathname} returned ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status >= 500 ? 502 : r.status, engine: true });
  }
  return r.json;
}

let serviceUserId = null;

/** The signed-in person behind a browser request, with their engine memberships. */
async function sessionOf(req) {
  if (!req.headers.cookie) return null;
  const s = await engine("GET", "/api/auth/get-session", { as: req });
  if (s.status !== 200 || !s.json?.user?.id) return null;
  const me = await engine("GET", "/api/cli-auth/me", { as: req });
  const m = me.status === 200 && me.json ? me.json : {};
  const memberships = (m.memberships || []).filter((x) => x.status === "active" || x.status === undefined);
  return {
    user: { id: s.json.user.id, email: String(s.json.user.email || "").toLowerCase(), name: s.json.user.name || "" },
    isInstanceAdmin: !!m.isInstanceAdmin,
    memberships,
  };
}

/** Makes `req`'s user a member of `companyId` with `role`, through a single-use engine invite. */
async function grant(req, companyId, role) {
  const invite = await engineOk("POST", `/api/companies/${companyId}/invites`, { body: { allowedJoinTypes: "human", humanRole: role } });
  const r = await engine("POST", `/api/invites/${encodeURIComponent(invite.token)}/accept`, { as: req, body: { requestType: "human" } });
  if (r.status === 409) return; // already a member
  if (r.status < 200 || r.status >= 300) {
    throw Object.assign(new Error(r.json?.error || `Joining the workspace failed (${r.status})`), { status: 502 });
  }
}

async function companyName(companyId) {
  const r = await engine("GET", `/api/companies/${companyId}`);
  return r.status === 200 ? r.json?.name ?? null : null;
}

async function workspaceAdmins(companyId) {
  const r = await engine("GET", `/api/companies/${companyId}/members`);
  const list = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.members) ? r.json.members : [];
  return list
    .map((m) => ({
      userId: m.userId ?? m.user?.id ?? m.principalId ?? null,
      email: m.user?.email ?? m.email ?? null,
      name: m.user?.name ?? m.name ?? null,
      role: m.membershipRole ?? m.role ?? null,
    }))
    .filter((m) => m.email && m.userId !== serviceUserId && (m.role === "owner" || m.role === "admin"));
}

/* ----------------------------------------------------------------- domains */

const PERSONAL_DOMAINS = new Set(
  `gmail.com googlemail.com outlook.com hotmail.com hotmail.co.uk live.com msn.com yahoo.com yahoo.co.in yahoo.co.uk
   ymail.com icloud.com me.com mac.com aol.com proton.me protonmail.com pm.me zoho.com zohomail.com yandex.com
   yandex.ru gmx.com gmx.de gmx.net mail.com rediffmail.com fastmail.com hey.com tutanota.com tuta.io qq.com 163.com
   126.com naver.com web.de mail.ru inbox.com hushmail.com`.split(/\s+/),
);

export function domainOf(email) {
  return String(email).split("@")[1]?.trim().toLowerCase() || "";
}

export function isPersonal(domain) {
  return PERSONAL_DOMAINS.has(domain);
}

/** "acme.com" -> "acme", "eng.acme.co.uk" -> "acme". */
export function workspaceNameFor(domain) {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return domain || "workspace";
  const sld = parts[parts.length - 2];
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(sld)) {
    return parts[parts.length - 3];
  }
  return sld;
}

function personalName(user) {
  const first = (user.name || user.email.split("@")[0]).trim().split(/\s+/)[0];
  return `${first}'s workspace`;
}

const workspaceKey = (user, domain) => (isPersonal(domain) ? `user:${user.id}` : `domain:${domain}`);

/* -------------------------------------------------------------------- mail */

let ses = null;
async function sendMail(to, subject, text, html) {
  if (cfg.mailMode === "log") {
    log("mail", { to, subject, text });
    return;
  }
  if (!ses) {
    const { SESv2Client } = await import("@aws-sdk/client-sesv2");
    ses = new SESv2Client({ region: cfg.region });
  }
  const { SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: cfg.mailFrom,
      Destination: { ToAddresses: [to] },
      Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } } },
    }),
  );
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function mailHtml(lines, cta) {
  const body = lines.map((l) => `<p style="margin:0 0 14px">${l}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:4px;font-size:14px">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;padding:32px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e4e4e4;border-radius:6px;padding:28px">
<div style="font-size:13px;font-weight:600;letter-spacing:-0.01em;margin-bottom:22px">agentox</div>
<div style="font-size:14px;line-height:1.55">${body}${button}</div>
</div></body></html>`;
}

/* ------------------------------------------------------------------- codes */

const hmac = (v) => crypto.createHmac("sha256", cfg.codeSecret).update(v).digest("hex");

function sixDigits() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendVerification(user) {
  const [row] = await q(`select *, now() as now from agentox_gw.email_codes where user_id = $1`, [user.id]);
  if (row) {
    const age = (new Date(row.now) - new Date(row.sent_at)) / 1000;
    if (age < 30) throw Object.assign(new Error("Please wait a few seconds before asking for another code."), { status: 429 });
    const inWindow = new Date(row.now) - new Date(row.window_start) < 3600_000;
    if (inWindow && row.window_count >= 5) throw Object.assign(new Error("Too many codes requested. Try again in an hour."), { status: 429 });
  }
  const code = sixDigits();
  await q(
    `insert into agentox_gw.email_codes (user_id, email, code_hash, expires_at)
     values ($1, $2, $3, now() + interval '10 minutes')
     on conflict (user_id) do update set
       email = excluded.email, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = now(),
       window_count = case when now() - agentox_gw.email_codes.window_start < interval '1 hour' then agentox_gw.email_codes.window_count + 1 else 1 end,
       window_start = case when now() - agentox_gw.email_codes.window_start < interval '1 hour' then agentox_gw.email_codes.window_start else now() end`,
    [user.id, user.email, hmac(`${user.id}:${code}`)],
  );
  const sent = sendMail(
    user.email,
    `${code} is your agentox code`,
    `Your agentox verification code is ${code}. It expires in 10 minutes. If you didn't try to sign up, you can ignore this email.`,
    mailHtml([`Your verification code is`, `<span style="font-family:ui-monospace,Menlo,monospace;font-size:26px;letter-spacing:6px">${code}</span>`, `<span style="color:#666">It expires in 10 minutes. If you didn't try to sign up, you can ignore this email.</span>`]),
  );
  try {
    await sent;
  } catch (e) {
    // Don't hold a failed send against them: no cooldown, no count toward the hourly limit.
    await q(`update agentox_gw.email_codes set sent_at = now() - interval '1 minute', window_count = greatest(window_count - 1, 0) where user_id = $1`, [user.id]);
    log("mail.failed", { user: user.id, error: String(e?.message || e) });
    throw Object.assign(new Error("We couldn't send the email just now. Try again in a minute."), { status: 502, expose: true });
  }
}

async function checkVerification(user, code) {
  const [row] = await q(`select *, now() as now from agentox_gw.email_codes where user_id = $1`, [user.id]);
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!row || row.email !== user.email) throw bad("Request a new code.");
  if (new Date(row.expires_at) < new Date(row.now)) throw bad("That code has expired. Request a new one.");
  if (row.attempts >= 5) throw bad("Too many attempts. Request a new code.");
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hmac(`${user.id}:${String(code).replace(/\D/g, "")}`)));
  if (!ok) {
    await q(`update agentox_gw.email_codes set attempts = attempts + 1 where user_id = $1`, [user.id]);
    throw bad("That code isn't right. Check the email and try again.");
  }
  await q(`delete from agentox_gw.email_codes where user_id = $1`, [user.id]);
  await q(
    `insert into agentox_gw.verified_emails (user_id, email) values ($1, $2)
     on conflict (user_id) do update set email = excluded.email, verified_at = now()`,
    [user.id, user.email],
  );
}

async function isVerified(user) {
  const [row] = await q(`select email from agentox_gw.verified_emails where user_id = $1`, [user.id]);
  return !!row && row.email === user.email;
}

/* ---------------------------------------------------------- onboarding */

const STALE_CREATE_MS = 2 * 60_000;

async function state(req, s) {
  const domain = domainOf(s.user.email);
  const personal = isPersonal(domain);
  const base = { user: s.user, domain, personal, isInstanceAdmin: s.isInstanceAdmin };
  if (s.memberships.length) return { ...base, step: "ready", emailVerified: await isVerified(s.user) };

  const verified = await isVerified(s.user);
  if (!verified) {
    const [code] = await q(`select sent_at from agentox_gw.email_codes where user_id = $1`, [s.user.id]);
    return { ...base, step: "verify", emailVerified: false, codeSentAt: code?.sent_at ?? null };
  }

  const [ws] = await q(`select * from agentox_gw.workspaces where key = $1`, [workspaceKey(s.user, domain)]);
  if (personal || !ws || ws.status !== "ready") {
    return { ...base, step: "create", emailVerified: true, workspaceName: personal ? personalName(s.user) : workspaceNameFor(domain) };
  }

  const workspace = { id: ws.company_id, name: (await companyName(ws.company_id)) ?? workspaceNameFor(domain) };
  const [request] = await q(
    `select * from agentox_gw.access_requests where company_id = $1 and user_id = $2 order by created_at desc limit 1`,
    [ws.company_id, s.user.id],
  );
  if (request?.status === "approved" && !request.completed_at) {
    await grant(req, ws.company_id, request.role || "operator");
    await q(`update agentox_gw.access_requests set completed_at = now() where id = $1`, [request.id]);
    return { ...base, step: "ready", emailVerified: true, workspace };
  }
  if (request?.status === "pending") return { ...base, step: "pending", emailVerified: true, workspace, request: publicRequest(request) };
  return { ...base, step: "request", emailVerified: true, workspace, lastDecision: request?.status === "rejected" ? "rejected" : null };
}

async function createWorkspace(req, s) {
  if (s.memberships.length) throw Object.assign(new Error("You already belong to a workspace."), { status: 409 });
  if (!(await isVerified(s.user))) throw Object.assign(new Error("Verify your email first."), { status: 403 });
  const domain = domainOf(s.user.email);
  const personal = isPersonal(domain);
  const key = workspaceKey(s.user, domain);

  // Claim the key first, so two people from a new domain can't both create a workspace.
  let [claim] = await q(
    `insert into agentox_gw.workspaces (key, domain, created_by) values ($1, $2, $3) on conflict (key) do nothing returning *`,
    [key, personal ? null : domain, s.user.id],
  );
  if (!claim) {
    const [existing] = await q(`select *, now() as now from agentox_gw.workspaces where key = $1`, [key]);
    if (existing.status === "ready") {
      if (personal) {
        // Their own workspace: they were removed from it at some point. Put them back as owner.
        await grant(req, existing.company_id, "owner");
        return { companyId: existing.company_id };
      }
      throw Object.assign(new Error("Your team already has a workspace. Request access instead."), { status: 409, step: "request" });
    }
    const stale = new Date(existing.now) - new Date(existing.created_at) > STALE_CREATE_MS;
    if (existing.created_by !== s.user.id && !stale) {
      throw Object.assign(new Error("Someone from your team is setting up the workspace right now. Try again in a moment."), { status: 409 });
    }
    [claim] = await q(`update agentox_gw.workspaces set created_by = $2, created_at = now() where key = $1 returning *`, [key, s.user.id]);
  }

  let companyId = claim.company_id;
  if (!companyId) {
    const company = await engineOk("POST", "/api/companies", { body: { name: personal ? personalName(s.user) : workspaceNameFor(domain) } });
    companyId = company.id;
    await q(`update agentox_gw.workspaces set company_id = $2 where key = $1`, [key, companyId]);
  }
  await grant(req, companyId, "owner");
  await q(`update agentox_gw.workspaces set status = 'ready' where key = $1`, [key]);
  log("workspace.created", { companyId, key: personal ? "personal" : key, by: s.user.id });
  return { companyId };
}

function publicRequest(r) {
  return { id: r.id, companyId: r.company_id, userId: r.user_id, email: r.email, name: r.name, status: r.status, role: r.role, createdAt: r.created_at, decidedAt: r.decided_at };
}

async function requestAccess(req, s) {
  if (!(await isVerified(s.user))) throw Object.assign(new Error("Verify your email first."), { status: 403 });
  const domain = domainOf(s.user.email);
  if (isPersonal(domain)) throw Object.assign(new Error("Personal addresses get their own workspace."), { status: 400 });
  const [ws] = await q(`select * from agentox_gw.workspaces where key = $1 and status = 'ready'`, [workspaceKey(s.user, domain)]);
  if (!ws) throw Object.assign(new Error("There's no workspace for your team yet."), { status: 404 });
  if (s.memberships.some((m) => m.companyId === ws.company_id)) return { status: "member" };

  let [row] = await q(
    `insert into agentox_gw.access_requests (company_id, user_id, email, name) values ($1, $2, $3, $4)
     on conflict (company_id, user_id) where status in ('pending', 'approved') do nothing returning *`,
    [ws.company_id, s.user.id, s.user.email, s.user.name || null],
  );
  if (!row) {
    [row] = await q(`select * from agentox_gw.access_requests where company_id = $1 and user_id = $2 and status in ('pending','approved')`, [ws.company_id, s.user.id]);
    return publicRequest(row);
  }

  const origin = originOf(req);
  const name = (await companyName(ws.company_id)) ?? workspaceNameFor(domain);
  const who = s.user.name ? `${s.user.name} (${s.user.email})` : s.user.email;
  const admins = (await workspaceAdmins(ws.company_id)).slice(0, 10);
  const prefix = await companyPrefix(ws.company_id);
  const href = `${origin}/${prefix ?? ws.company_id}/members`;
  await Promise.allSettled(
    admins.map((a) =>
      sendMail(
        a.email,
        `${s.user.name || s.user.email} is asking to join ${name}`,
        `${who} is asking for access to ${name} on agentox. Review the request: ${href}`,
        mailHtml([`<b>${esc(who)}</b> is asking for access to <b>${esc(name)}</b> on agentox.`, `<span style="color:#666">You can admit them as an admin, operator or viewer, or decline.</span>`], { href, label: "Review request" }),
      ),
    ),
  );
  log("access.requested", { companyId: ws.company_id, user: s.user.id, notified: admins.length });
  return publicRequest(row);
}

async function companyPrefix(companyId) {
  const r = await engine("GET", `/api/companies/${companyId}`);
  return r.status === 200 ? r.json?.issuePrefix ?? null : null;
}

/** Owners and admins of the workspace decide on its access requests. */
function canAdmin(s, companyId) {
  return s.memberships.some((m) => m.companyId === companyId && (m.membershipRole === "owner" || m.membershipRole === "admin"));
}

async function decide(req, s, id, body) {
  const [row] = await q(`select * from agentox_gw.access_requests where id = $1`, [id]);
  if (!row || !canAdmin(s, row.company_id)) throw Object.assign(new Error("Request not found."), { status: 404 });
  if (row.status !== "pending") throw Object.assign(new Error("This request was already handled."), { status: 409 });
  const approve = body?.decision === "approve";
  if (!approve && body?.decision !== "reject") throw Object.assign(new Error("decision must be approve or reject"), { status: 400 });
  const role = ["admin", "operator", "viewer"].includes(body?.role) ? body.role : "operator";
  const [updated] = await q(
    `update agentox_gw.access_requests set status = $2, role = $3, decided_by = $4, decided_at = now() where id = $1 and status = 'pending' returning *`,
    [id, approve ? "approved" : "rejected", approve ? role : null, s.user.id],
  );
  if (!updated) throw Object.assign(new Error("This request was already handled."), { status: 409 });
  if (approve) {
    const name = (await companyName(row.company_id)) ?? "your team's workspace";
    const origin = originOf(req);
    await sendMail(
      row.email,
      `You're in: ${name} on agentox`,
      `${s.user.name || s.user.email} admitted you to ${name}. Open agentox: ${origin}/`,
      mailHtml([`<b>${esc(s.user.name || s.user.email)}</b> admitted you to <b>${esc(name)}</b>.`], { href: `${origin}/`, label: "Open agentox" }),
    ).catch((e) => log("mail.failed", { error: String(e) }));
  }
  log("access.decided", { id, decision: updated.status, by: s.user.id });
  return publicRequest(updated);
}

/* ------------------------------------------------------------- terminal */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const cliCodes = new Map(); // hmac(code) -> { token, userId, apiBase, expires }

function newCliCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

async function createCliCode(req, s) {
  const expiresAt = new Date(Date.now() + 90 * 86400_000).toISOString();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const key = await engineOk("POST", "/api/board-api-keys", { as: req, body: { name: `Terminal · ${stamp} UTC`, expiresAt } });
  if (!key?.token) throw Object.assign(new Error("Could not create a terminal key."), { status: 502 });
  const code = newCliCode();
  const apiBase = originOf(req);
  cliCodes.set(hmac(code), { token: key.token, userId: s.user.id, apiBase, expires: Date.now() + 10 * 60_000 });
  return { code, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), command: `curl -fsSL ${apiBase}/cli | sh -s -- ${code}`, keyExpiresAt: expiresAt };
}

function exchangeCliCode(code) {
  const k = hmac(String(code || "").toUpperCase().trim());
  const hit = cliCodes.get(k);
  cliCodes.delete(k);
  if (!hit || hit.expires < Date.now()) throw Object.assign(new Error("That code is invalid or expired."), { status: 400 });
  return { apiBase: hit.apiBase, token: hit.token, userId: hit.userId };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cliCodes) if (v.expires < now) cliCodes.delete(k);
}, 60_000).unref();

const here = path.dirname(fileURLToPath(import.meta.url));
const installerTemplate = fs.readFileSync(fs.existsSync(path.join(here, "install.sh")) ? path.join(here, "install.sh") : path.join(here, "..", "install.sh"), "utf8");

/* ------------------------------------------------------------------ http */

/** The browser-facing origin of a request, as Caddy (or the dev proxy) forwarded it. */
function originOf(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

/** Per-IP fixed-window limiter for unauthenticated routes. */
const buckets = new Map();
function limited(req, name, max, windowMs) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const key = `${name}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, n: 1 });
    return false;
  }
  b.n++;
  return b.n > max;
}
setInterval(() => buckets.clear(), 10 * 60_000).unref();

function send(res, status, body, type = "application/json") {
  const data = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(data);
}

async function readJson(req) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 16_384) throw Object.assign(new Error("Body too large"), { status: 413 });
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function sameOrigin(req) {
  return req.headers.origin === originOf(req);
}

async function route(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const m = req.method;

  if (m === "GET" && p === "/cli") {
    const script = installerTemplate.replaceAll("__API_BASE__", originOf(req)).replaceAll("__CLI_VERSION__", cfg.cliVersion);
    return send(res, 200, script, "text/x-shellscript; charset=utf-8");
  }
  if (!p.startsWith("/api/agentox/")) return send(res, 404, { error: "Not found" });
  const r = p.slice("/api/agentox".length);

  if (m === "GET" && r === "/health") return send(res, 200, { ok: true });

  if (m === "POST" && r === "/cli/exchange") {
    if (limited(req, "exchange", 10, 60_000)) return send(res, 429, { error: "Too many attempts. Wait a minute." });
    const body = await readJson(req);
    return send(res, 200, exchangeCliCode(body.code));
  }

  // Everything below acts for a signed-in person. Mutations must come from the app's own origin.
  if (m !== "GET" && !sameOrigin(req)) return send(res, 403, { error: "Request must come from the agentox app." });
  const s = await sessionOf(req);
  if (!s) return send(res, 401, { error: "Sign in first." });

  if (m === "GET" && r === "/config") return send(res, 200, { serviceUserId });
  if (m === "GET" && r === "/state") return send(res, 200, await state(req, s));
  if (m === "POST" && r === "/email/send") {
    if (await isVerified(s.user)) return send(res, 200, { verified: true });
    await sendVerification(s.user);
    return send(res, 200, { sent: true });
  }
  if (m === "POST" && r === "/email/verify") {
    const body = await readJson(req);
    await checkVerification(s.user, body.code);
    return send(res, 200, { verified: true });
  }
  if (m === "POST" && r === "/workspace") return send(res, 201, await createWorkspace(req, s));
  if (m === "POST" && r === "/access-requests") return send(res, 201, await requestAccess(req, s));
  if (m === "DELETE" && r === "/access-requests/mine") {
    await q(`update agentox_gw.access_requests set status = 'cancelled', decided_at = now() where user_id = $1 and status = 'pending'`, [s.user.id]);
    return send(res, 200, { cancelled: true });
  }
  let match = r.match(/^\/companies\/([0-9a-f-]{36})\/access-requests$/);
  if (m === "GET" && match) {
    if (!canAdmin(s, match[1])) return send(res, 200, []);
    const rows = await q(`select * from agentox_gw.access_requests where company_id = $1 and status = 'pending' order by created_at`, [match[1]]);
    return send(res, 200, rows.map(publicRequest));
  }
  match = r.match(/^\/access-requests\/([0-9a-f-]{36})\/decide$/);
  if (m === "POST" && match) return send(res, 200, await decide(req, s, match[1], await readJson(req)));
  if (m === "POST" && r === "/cli/codes") return send(res, 201, await createCliCode(req, s));

  return send(res, 404, { error: "Not found" });
}

/* ------------------------------------------------------------------ start */

async function resolveServiceUser() {
  const r = await engine("GET", "/api/cli-auth/me");
  if (r.status !== 200) throw new Error(`service key rejected by engine (${r.status})`);
  if (!r.json?.isInstanceAdmin) throw new Error("service user is not an instance admin");
  return r.json.userId ?? r.json.user?.id ?? null;
}

async function start() {
  await migrate();
  for (let i = 0; ; i++) {
    try {
      serviceUserId = await resolveServiceUser();
      break;
    } catch (e) {
      if (i >= 30) throw e;
      log("waiting for engine", { error: String(e.message || e) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  http
    .createServer((req, res) => {
      route(req, res).catch((e) => {
        const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
        if (status >= 500) log("error", { path: req.url, error: String(e.stack || e) });
        send(res, status, { error: status >= 500 && !e.engine && !e.expose ? "Something went wrong. Try again." : e.message, ...(e.step ? { step: e.step } : {}) });
      });
    })
    .listen(cfg.port, cfg.host, () => log("gateway listening", { port: cfg.port, serviceUserId }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  start().catch((e) => {
    log("fatal", { error: String(e.stack || e) });
    process.exit(1);
  });
}
