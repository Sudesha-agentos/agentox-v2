// In-browser stand-in for the agentox server, used by demo mode.
// Implements the same routes the interface calls so every screen works without a backend.
import type {
  ActivityEvent,
  Agent,
  Approval,
  Company,
  Goal,
  HeartbeatRun,
  HeartbeatRunEvent,
  Issue,
  IssueComment,
  LiveEvent,
  Project,
  AiConnection,
  BoardApiKey,
  CompanyInvite,
  JoinRequest,
  McpConnection,
  Secret,
  ToolConnection,
} from "./types";
import { ApiError } from "./errors";

interface CostEvent {
  agentId: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  createdAt: string;
}

interface DB {
  companies: Company[];
  agents: Agent[];
  issues: Issue[];
  comments: IssueComment[];
  runs: HeartbeatRun[];
  events: HeartbeatRunEvent[];
  approvals: Approval[];
  projects: (Project & { companyId: string })[];
  goals: (Goal & { companyId: string })[];
  activity: (ActivityEvent & { companyId: string })[];
  costs: (CostEvent & { companyId: string })[];
  issueCounter: Record<string, number>;
  users: Array<{ id: string; name: string; email: string; password: string; createdAt: string }>;
  sessionUserId: string | null;
  members: Array<{ id: string; companyId: string; userId: string; role: string; createdAt: string }>;
  invites: Array<CompanyInvite & { companyId: string; token: string }>;
  joinRequests: Array<JoinRequest & { companyId: string }>;
  aiConnections: Array<AiConnection & { companyId: string }>;
  toolConnections: Array<ToolConnection & { companyId: string }>;
  secrets: Array<Secret & { companyId: string }>;
  apiKeys: BoardApiKey[];
  mcpConnections: McpConnection[];
}

const STORE_KEY = "agentox.demo.db.v2";
const now = () => new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
const uid = () => crypto.randomUUID();

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- seed ----------

function seed(): DB {
  const cid = uid();
  const company: Company = {
    id: cid,
    name: "Northwind Labs",
    description: "Build the #1 AI note-taking app to $1M MRR.",
    status: "active",
    issuePrefix: "NWL",
    budgetMonthlyCents: 150_000,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    createdAt: ago(60 * 24 * 14),
    updatedAt: ago(30),
  };
  const mk = (p: Partial<Agent> & Pick<Agent, "name" | "role" | "title" | "adapterType">): Agent => ({
    id: uid(),
    companyId: cid,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    adapterConfig: {},
    budgetMonthlyCents: 30_000,
    spentMonthlyCents: 0,
    pauseReason: null,
    errorReason: null,
    lastHeartbeatAt: ago(Math.round(Math.random() * 300)),
    createdAt: ago(60 * 24 * 13),
    updatedAt: ago(60),
    ...p,
  });
  const ceo = mk({ name: "Ada", role: "ceo", title: "Chief Executive", adapterType: "claude_local", capabilities: "Strategy, hiring, prioritisation", budgetMonthlyCents: 40_000 });
  const cto = mk({ name: "Linus", role: "cto", title: "Chief Technology Officer", adapterType: "codex_local", reportsTo: ceo.id, capabilities: "Architecture, code review" });
  const eng1 = mk({ name: "Grace", role: "engineer", title: "Backend Engineer", adapterType: "claude_local", reportsTo: cto.id, capabilities: "APIs, databases, infra" });
  const eng2 = mk({ name: "Ken", role: "engineer", title: "Frontend Engineer", adapterType: "cursor", reportsTo: cto.id, capabilities: "React, design systems" });
  const cmo = mk({ name: "Mae", role: "cmo", title: "Head of Growth", adapterType: "gemini_local", reportsTo: ceo.id, capabilities: "Content, SEO, launches", status: "paused", pauseReason: "Paused by board" });
  const qa = mk({ name: "Rosalind", role: "qa", title: "QA Lead", adapterType: "opencode_local", reportsTo: cto.id, status: "error", errorReason: "Adapter exited with code 1: missing OPENROUTER_API_KEY" });
  const agents = [ceo, cto, eng1, eng2, cmo, qa];

  const p1: Project & { companyId: string } = { id: uid(), companyId: cid, name: "Web app v1", description: "Ship the first public version", status: "in_progress", color: "#6366f1" };
  const p2: Project & { companyId: string } = { id: uid(), companyId: cid, name: "Launch", description: "Go-to-market", status: "planned", color: "#f59e0b" };
  const g1: Goal & { companyId: string } = { id: uid(), companyId: cid, title: "Reach 1,000 weekly active users", description: null, level: "company", status: "active" };

  let n = 0;
  const issue = (title: string, status: Issue["status"], priority: Issue["priority"], assignee: Agent | null, project: typeof p1 | null, minsAgo: number, description: string | null = null): Issue => {
    n += 1;
    return {
      id: uid(),
      companyId: cid,
      identifier: `NWL-${n}`,
      projectId: project?.id ?? null,
      goalId: g1.id,
      parentId: null,
      title,
      description,
      status,
      priority,
      assigneeAgentId: assignee?.id ?? null,
      assigneeUserId: null,
      activeRun: null,
      createdAt: ago(minsAgo + 600),
      updatedAt: ago(minsAgo),
    };
  };
  const issues = [
    issue("Define v1 product scope and success metrics", "done", "high", ceo, p1, 60 * 24 * 6, "Write a one-page scope doc: core note-taking, AI summaries, sharing."),
    issue("Set up Postgres schema for notes and workspaces", "done", "high", eng1, p1, 60 * 24 * 3),
    issue("Implement notes CRUD API", "in_review", "high", eng1, p1, 90, "REST endpoints for create/read/update/delete notes with workspace scoping."),
    issue("Build editor with markdown shortcuts", "in_progress", "high", eng2, p1, 25, "Use a ProseMirror-based editor. Support /commands and markdown shortcuts."),
    issue("AI summary endpoint using streaming", "todo", "medium", eng1, p1, 300),
    issue("Write landing page copy", "todo", "medium", cmo, p2, 600),
    issue("E2E test suite for auth + notes", "blocked", "medium", qa, p1, 200, "Blocked: QA agent adapter misconfigured."),
    issue("Choose analytics provider", "backlog", "low", null, p2, 60 * 24),
    issue("Pricing page experiments", "backlog", "low", null, p2, 60 * 30),
    issue("Security review of auth flow", "todo", "critical", cto, p1, 45),
  ];

  const comments: IssueComment[] = [
    { id: uid(), issueId: issues[2]!.id, authorType: "agent", authorAgentId: eng1.id, authorUserId: null, body: "Endpoints implemented with tests. 14/14 passing. Ready for review.", createdAt: ago(95) },
    { id: uid(), issueId: issues[2]!.id, authorType: "agent", authorAgentId: cto.id, authorUserId: null, body: "Looks good overall. Please add pagination to `GET /notes` before we merge.", createdAt: ago(80) },
    { id: uid(), issueId: issues[3]!.id, authorType: "agent", authorAgentId: eng2.id, authorUserId: null, body: "Started on the editor. Going with Tiptap for the ProseMirror wrapper.", createdAt: ago(25) },
  ];

  const runs: HeartbeatRun[] = [];
  const events: HeartbeatRunEvent[] = [];
  const costs: (CostEvent & { companyId: string })[] = [];
  // ~2 weeks of run history
  for (let day = 13; day >= 0; day--) {
    const count = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const a = agents[Math.floor(Math.random() * 4)]!;
      const start = Date.now() - day * 86_400_000 - Math.random() * 80_000_000;
      const failed = Math.random() < 0.12;
      const runId = uid();
      runs.push({
        id: runId,
        companyId: cid,
        agentId: a.id,
        issueId: issues[Math.floor(Math.random() * issues.length)]!.id,
        invocationSource: Math.random() < 0.5 ? "timer" : "assignment",
        triggerDetail: "system",
        status: failed ? "failed" : "succeeded",
        startedAt: new Date(start).toISOString(),
        finishedAt: new Date(start + 40_000 + Math.random() * 400_000).toISOString(),
        error: failed ? "Process exited with code 1" : null,
        exitCode: failed ? 1 : 0,
        createdAt: new Date(start).toISOString(),
      });
      const cost = 20 + Math.round(Math.random() * 180);
      costs.push({ companyId: cid, agentId: a.id, costCents: cost, inputTokens: cost * 900, outputTokens: cost * 120, cachedInputTokens: cost * 400, createdAt: new Date(start).toISOString() });
    }
  }
  runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const approvals: Approval[] = [
    {
      id: uid(),
      companyId: cid,
      type: "hire_agent",
      requestedByAgentId: ceo.id,
      requestedByUserId: null,
      status: "pending",
      payload: { name: "Iris", role: "designer", title: "Product Designer", adapterType: "claude_local", reason: "We need dedicated design capacity for the editor and landing page." },
      decisionNote: null,
      decidedAt: null,
      createdAt: ago(40),
    },
    {
      id: uid(),
      companyId: cid,
      type: "approve_ceo_strategy",
      requestedByAgentId: ceo.id,
      requestedByUserId: null,
      status: "pending",
      payload: { summary: "Focus Q1 on a polished editor + AI summaries; delay mobile app to Q2. Spend 70% of budget on engineering." },
      decisionNote: null,
      decidedAt: null,
      createdAt: ago(180),
    },
    {
      id: uid(),
      companyId: cid,
      type: "budget_override_required",
      requestedByAgentId: eng1.id,
      requestedByUserId: null,
      status: "approved",
      payload: { amountCents: 10_000, reason: "Load testing run" },
      decisionNote: "Approved for this month only.",
      decidedAt: ago(60 * 24 * 2),
      createdAt: ago(60 * 24 * 2 + 30),
    },
  ];

  const act = (minsAgo: number, actor: Agent | null, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}): ActivityEvent & { companyId: string } => ({
    id: uid(),
    companyId: cid,
    actorType: actor ? "agent" : "user",
    actorId: actor?.id ?? "local-board",
    action,
    entityType,
    entityId,
    agentId: actor?.id ?? null,
    runId: null,
    details,
    createdAt: ago(minsAgo),
  });
  const activity = [
    act(25, eng2, "issue.comment_added", "issue", issues[3]!.id, { title: issues[3]!.title }),
    act(26, eng2, "issue.updated", "issue", issues[3]!.id, { title: issues[3]!.title, status: "in_progress" }),
    act(40, ceo, "approval.created", "approval", approvals[0]!.id, { type: "hire_agent" }),
    act(80, cto, "issue.comment_added", "issue", issues[2]!.id, { title: issues[2]!.title }),
    act(95, eng1, "issue.updated", "issue", issues[2]!.id, { title: issues[2]!.title, status: "in_review" }),
    act(200, qa, "agent.error", "agent", qa.id, {}),
  ];

  for (const a of agents) a.spentMonthlyCents = costs.filter((c) => c.agentId === a.id).reduce((s, c) => s + c.costCents, 0);
  company.spentMonthlyCents = costs.reduce((s, c) => s + c.costCents, 0);

  const owner = { id: uid(), name: "Demo Operator", email: "demo@agentox.dev", password: "agentox-demo", createdAt: ago(60 * 24 * 14) };
  const teammate = { id: uid(), name: "Priya Shah", email: "priya@northwind.dev", password: "x".repeat(12), createdAt: ago(60 * 24 * 9) };
  return {
    users: [owner, teammate],
    sessionUserId: null,
    members: [
      { id: uid(), companyId: cid, userId: owner.id, role: "owner", createdAt: ago(60 * 24 * 14) },
      { id: uid(), companyId: cid, userId: teammate.id, role: "operator", createdAt: ago(60 * 24 * 9) },
    ],
    invites: [
      { id: uid(), companyId: cid, token: "demo-invite-token", humanRole: "viewer", allowedJoinTypes: "human", createdAt: ago(60 * 5), expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), acceptedAt: null, revokedAt: null, invitePath: "/invite/demo-invite-token" },
    ],
    joinRequests: [
      { id: uid(), companyId: cid, status: "pending_approval", requestType: "human", requesterName: "Sam Lee", requesterEmail: "sam@contractor.io", createdAt: ago(35) },
    ],
    aiConnections: [
      { id: uid(), grantId: uid(), companyId: cid, provider: "anthropic", method: "api_key", name: "Anthropic production", accountLabel: "sk-ant-…4f2a", ownership: "shared", ownerName: "Demo Operator", isDefault: true, status: "connected" },
      { id: uid(), grantId: uid(), companyId: cid, provider: "openai", method: "subscription", name: "ChatGPT Pro (Linus)", accountLabel: "linus@northwind.dev", ownership: "personal", ownerName: "Demo Operator", isDefault: false, status: "connected" },
      { id: uid(), grantId: uid(), companyId: cid, provider: "openrouter", method: "api_key", name: "OpenRouter", accountLabel: "sk-or-…91c0", ownership: "shared", ownerName: "Priya Shah", isDefault: false, status: "needs_attention", unavailableReason: "Key rejected by provider (401)" },
    ],
    toolConnections: [
      { id: uid(), companyId: cid, name: "GitHub · northwind", applicationId: "github", connectionPurpose: "tool", authKind: "oauth", status: "active", healthStatus: "healthy" },
      { id: uid(), companyId: cid, name: "Slack · #agents", applicationId: "slack", connectionPurpose: "channel", authKind: "oauth", status: "active", healthStatus: "healthy" },
      { id: uid(), companyId: cid, name: "Linear", applicationId: "linear", connectionPurpose: "tool", authKind: "api_key", status: "active", healthStatus: "degraded", healthMessage: "Rate limited, retrying" },
    ],
    secrets: [
      { id: uid(), companyId: cid, key: "STRIPE_SECRET_KEY", name: "Stripe secret key", provider: "local_encrypted", status: "active", latestVersion: 2, description: "Billing agent", lastRotatedAt: ago(60 * 24 * 3), referenceCount: 2, createdAt: ago(60 * 24 * 12), updatedAt: ago(60 * 24 * 3) },
      { id: uid(), companyId: cid, key: "DATABASE_URL", name: "Production database", provider: "local_encrypted", status: "active", latestVersion: 1, description: null, lastRotatedAt: null, referenceCount: 3, createdAt: ago(60 * 24 * 12), updatedAt: ago(60 * 24 * 12) },
    ],
    apiKeys: [{ id: uid(), name: "agentox cli", createdAt: ago(60 * 24 * 6), lastUsedAt: ago(90), revokedAt: null, expiresAt: null }],
    mcpConnections: [{ id: uid(), clientName: "Claude Desktop", companyName: "Northwind Labs", scopes: ["issues:read", "issues:write"], createdAt: ago(60 * 24 * 2), revokedAt: null }],
    companies: [company],
    agents,
    issues,
    comments,
    runs,
    events,
    approvals,
    projects: [p1, p2],
    goals: [g1],
    activity,
    costs,
    issueCounter: { [cid]: n },
  };
}

// Created on first use (not at import) and persisted right away so IDs survive reloads.
let dbCache: DB | null = null;
const db = new Proxy({} as DB, {
  get: (_t, k) => {
    if (!dbCache) dbCache = load();
    return dbCache[k as keyof DB];
  },
  set: (_t, k, v) => {
    if (!dbCache) dbCache = load();
    (dbCache as unknown as Record<string, unknown>)[k as string] = v;
    return true;
  },
});

function load(): DB {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return reapOrphans(JSON.parse(raw) as DB);
  } catch {
    // fall through to a fresh seed
  }
  const fresh = seed();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
  } catch {
    // storage unavailable; demo data lives in memory only
  }
  return fresh;
}

/** Simulated runs live in timers, so a reload orphans them. The server marks those interrupted; so do we. */
function reapOrphans(d: DB): DB {
  for (const r of d.runs) {
    if (r.status !== "queued" && r.status !== "running") continue;
    r.status = "interrupted";
    r.finishedAt = new Date().toISOString();
    r.error = "Interrupted: the demo backend restarted (page reload) while this run was active";
    const a = d.agents.find((x) => x.id === r.agentId);
    if (a && a.status === "running") a.status = "idle";
    for (const i of d.issues) if (i.activeRun?.id === r.id) i.activeRun = null;
  }
  return d;
}

// Written synchronously: auth flows do full-page navigations right after a mutation.
function save() {
  try {
    if (dbCache) localStorage.setItem(STORE_KEY, JSON.stringify(dbCache));
  } catch {
    // quota or storage disabled; state stays in memory
  }
}

export function resetDemoData() {
  dbCache = seed();
  save();
}

// ---------- live events ----------

const liveListeners = new Set<(e: LiveEvent) => void>();
let liveId = 1;
export function subscribeMock(cb: (e: LiveEvent) => void) {
  liveListeners.add(cb);
  return () => liveListeners.delete(cb);
}
function emit(companyId: string, type: string, payload: Record<string, unknown>) {
  const e: LiveEvent = { id: liveId++, companyId, type, createdAt: now(), payload };
  liveListeners.forEach((l) => l(e));
}

function logActivity(companyId: string, actor: Agent | null, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  const ev = { id: uid(), companyId, actorType: actor ? "agent" : "user", actorId: actor?.id ?? "local-board", action, entityType, entityId, agentId: actor?.id ?? null, runId: null, details, createdAt: now() } as const;
  db.activity.unshift({ ...ev });
  emit(companyId, "activity.logged", { ...ev });
}

// ---------- simulated agent runs ----------

const scripts: Record<string, string[]> = {
  default: [
    "Waking up. Reading assignment and recent comments…",
    "Loaded 3 skills: repo-navigation, testing, agentox-api",
    "Checking out task and planning next steps",
    "$ git status --short",
    "Analysing the codebase for relevant files",
    "Drafting changes",
    "$ npm test -- --run",
    "✓ 18 passed (2.1s)",
    "Posting progress update to the task",
    "Done. Releasing checkout.",
  ],
};

function startRun(agent: Agent, source: string, reason?: string): HeartbeatRun {
  const run: HeartbeatRun = {
    id: uid(),
    companyId: agent.companyId,
    agentId: agent.id,
    issueId: null,
    invocationSource: source,
    triggerDetail: "manual",
    status: "queued",
    startedAt: null,
    finishedAt: null,
    error: null,
    exitCode: null,
    createdAt: now(),
  };
  const work = db.issues
    .filter((i) => i.assigneeAgentId === agent.id && ["todo", "in_progress"].includes(i.status))
    .sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.priority) - ["critical", "high", "medium", "low"].indexOf(b.priority))[0];
  if (work) run.issueId = work.id;
  db.runs.unshift(run);
  emit(agent.companyId, "heartbeat.run.queued", { runId: run.id, agentId: agent.id });

  const lines = [...scripts.default!];
  if (reason) lines.unshift(`Wake reason: ${reason}`);
  if (work) lines.splice(2, 0, `Working on ${work.identifier}: ${work.title}`);
  else lines.splice(2, 0, "No assigned tasks. Checking inbox for mentions.");

  let seq = 0;
  const pushEvent = (message: string, stream: HeartbeatRunEvent["stream"] = "stdout", level = "info") => {
    seq += 1;
    const ev: HeartbeatRunEvent = { id: `${run.id}-${seq}`, runId: run.id, seq, eventType: "log", stream, level, message, createdAt: now() };
    db.events.push(ev);
    emit(agent.companyId, "heartbeat.run.event", { runId: run.id, agentId: agent.id, seq });
  };

  setTimeout(() => {
    const live = db.runs.find((r) => r.id === run.id);
    if (!live || live.status !== "queued") return;
    live.status = "running";
    live.startedAt = now();
    const a = db.agents.find((x) => x.id === agent.id);
    if (a) {
      a.status = "running";
      a.lastHeartbeatAt = now();
    }
    if (work && work.status === "todo") {
      work.status = "in_progress";
      work.updatedAt = now();
      logActivity(agent.companyId, a ?? null, "issue.updated", "issue", work.id, { title: work.title, status: "in_progress" });
    }
    if (work) work.activeRun = { id: run.id, status: "running", agentId: agent.id, startedAt: live.startedAt, finishedAt: null };
    pushEvent(`Run started (${agent.adapterType})`, "system");
    emit(agent.companyId, "heartbeat.run.status", { runId: run.id, agentId: agent.id, status: "running" });
    emit(agent.companyId, "agent.status", { agentId: agent.id, status: "running" });
    save();

    let i = 0;
    const tick = () => {
      const r = db.runs.find((x) => x.id === run.id);
      if (!r || r.status !== "running") return;
      if (i < lines.length) {
        pushEvent(lines[i]!);
        i += 1;
        // Agents post a plan partway through, like real agents do.
        if (work && i === 4) {
          db.comments.push({ id: uid(), issueId: work.id, authorType: "agent", authorAgentId: agent.id, authorUserId: null, body: `Picked this up. Plan:\n1. Read the relevant code\n2. Implement the change\n3. Run the test suite and report back`, createdAt: now() });
          logActivity(agent.companyId, agent, "issue.comment_added", "issue", work.id, { title: work.title });
        }
        save();
        setTimeout(tick, 650 + Math.random() * 900);
        return;
      }
      r.status = "succeeded";
      r.finishedAt = now();
      r.exitCode = 0;
      pushEvent("Run finished successfully", "system");
      const cost = 30 + Math.round(Math.random() * 120);
      db.costs.push({ companyId: r.companyId, agentId: agent.id, costCents: cost, inputTokens: cost * 900, outputTokens: cost * 120, cachedInputTokens: cost * 400, createdAt: now() });
      const ag = db.agents.find((x) => x.id === agent.id);
      if (ag) {
        ag.status = "idle";
        ag.spentMonthlyCents += cost;
      }
      const co = db.companies.find((c) => c.id === r.companyId);
      if (co) co.spentMonthlyCents += cost;
      if (work) {
        work.activeRun = null;
        work.status = "in_review";
        work.updatedAt = now();
        db.comments.push({ id: uid(), issueId: work.id, authorType: "agent", authorAgentId: agent.id, authorUserId: null, body: "Implemented the changes and all tests pass. Moving to review. The summary of what changed is in the run log.", createdAt: now() });
        logActivity(r.companyId, ag ?? null, "issue.updated", "issue", work.id, { title: work.title, status: "in_review" });
      }
      emit(r.companyId, "heartbeat.run.status", { runId: r.id, agentId: agent.id, status: "succeeded" });
      emit(r.companyId, "agent.status", { agentId: agent.id, status: "idle" });
      save();
    };
    setTimeout(tick, 500);
  }, 900);

  return run;
}

// ---------- routing ----------

type Handler = (m: RegExpMatchArray, body: any, query: URLSearchParams) => unknown;
const routes: Array<[string, RegExp, Handler]> = [];
const on = (method: string, pattern: string, h: Handler) => {
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, "([^/]+)") + "$");
  routes.push([method, re, h]);
};

const find = <T extends { id: string }>(list: T[], id: string, what: string): T => {
  const x = list.find((i) => i.id === id);
  if (!x) throw new HttpError(404, `${what} not found`);
  return x;
};

on("GET", "/health", () => ({ status: "ok", version: "2026.1106.0", deploymentMode: "authenticated", deploymentExposure: "private", authReady: true, bootstrapStatus: "ready", bootstrapInviteActive: false }));

on("GET", "/companies", () => {
  const u = currentUser();
  return u ? db.companies.filter((c) => db.members.some((x) => x.userId === u.id && x.companyId === c.id)) : db.companies;
});
on("POST", "/companies", (_m, b) => {
  if (!b?.name?.trim()) throw new HttpError(400, "name: Required");
  const prefix = b.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "CO";
  const c: Company = { id: uid(), name: b.name.trim(), description: b.description ?? null, status: "active", issuePrefix: prefix, budgetMonthlyCents: b.budgetMonthlyCents ?? 0, spentMonthlyCents: 0, requireBoardApprovalForNewAgents: false, createdAt: now(), updatedAt: now() };
  db.companies.push(c);
  db.issueCounter[c.id] = 0;
  const u = currentUser();
  if (u) db.members = [...db.members, { id: uid(), companyId: c.id, userId: u.id, role: "owner", createdAt: now() }];
  return c;
});
on("GET", "/companies/:cid", (m) => find(db.companies, m[1]!, "Company"));
on("PATCH", "/companies/:cid", (m, b) => Object.assign(find(db.companies, m[1]!, "Company"), b, { updatedAt: now() }));

on("GET", "/companies/:cid/dashboard", (m) => {
  const cid = m[1]!;
  const co = find(db.companies, cid, "Company");
  const agents = db.agents.filter((a) => a.companyId === cid && a.status !== "terminated");
  const issues = db.issues.filter((i) => i.companyId === cid);
  const spend = db.costs.filter((c) => c.companyId === cid).reduce((s, c) => s + c.costCents, 0);
  const days: Record<string, { succeeded: number; failed: number }> = {};
  for (let d = 13; d >= 0; d--) days[new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)] = { succeeded: 0, failed: 0 };
  for (const r of db.runs.filter((r) => r.companyId === cid)) {
    const k = r.createdAt.slice(0, 10);
    if (!days[k]) continue;
    if (r.status === "succeeded") days[k].succeeded++;
    else if (r.status === "failed") days[k].failed++;
  }
  return {
    companyId: cid,
    agents: {
      active: agents.filter((a) => ["active", "idle", "running"].includes(a.status)).length,
      running: agents.filter((a) => a.status === "running").length,
      paused: agents.filter((a) => a.status === "paused").length,
      error: agents.filter((a) => a.status === "error").length,
    },
    tasks: {
      open: issues.filter((i) => ["backlog", "todo"].includes(i.status)).length,
      inProgress: issues.filter((i) => ["in_progress", "in_review"].includes(i.status)).length,
      blocked: issues.filter((i) => i.status === "blocked").length,
      done: issues.filter((i) => i.status === "done").length,
    },
    costs: { monthSpendCents: spend, monthBudgetCents: co.budgetMonthlyCents, monthUtilizationPercent: co.budgetMonthlyCents ? (spend / co.budgetMonthlyCents) * 100 : 0 },
    pendingApprovals: db.approvals.filter((a) => a.companyId === cid && a.status === "pending").length,
    runActivity: Object.entries(days).map(([date, v]) => ({ date, ...v, recovered: 0, other: 0, total: v.succeeded + v.failed })),
  };
});

on("GET", "/adapters", () =>
  [
    ["claude_local", "Claude Code"],
    ["codex_local", "Codex"],
    ["cursor", "Cursor"],
    ["gemini_local", "Gemini CLI"],
    ["opencode_local", "OpenCode"],
    ["openclaw_gateway", "OpenClaw Gateway"],
    ["hermes_local", "Hermes"],
    ["process", "Custom process"],
    ["http", "HTTP endpoint"],
  ].map(([type, label], i) => ({ type, label, source: i === 5 ? "external" : "builtin", loaded: true, disabled: type === "hermes_local", modelsCount: [14, 9, 22, 6, 41, 0, 3, 0, 0][i], version: i < 6 ? ["2.1.4", "0.48.0", "1.6.2", "0.22.1", "0.9.17", "2026.10.3"][i] : null })),
);

on("GET", "/companies/:cid/agents", (m) => db.agents.filter((a) => a.companyId === m[1]));
const createAgent = (cid: string, b: any, viaHire: boolean) => {
  if (!b?.name?.trim()) throw new HttpError(400, "name: Required");
  if (!b?.adapterType) throw new HttpError(400, "adapterType: Required");
  const co = find(db.companies, cid, "Company");
  const needsApproval = viaHire && co.requireBoardApprovalForNewAgents;
  const a: Agent = {
    id: uid(),
    companyId: cid,
    name: b.name.trim(),
    role: b.role ?? "general",
    title: b.title ?? null,
    status: needsApproval ? "pending_approval" : "idle",
    reportsTo: b.reportsTo ?? null,
    capabilities: b.capabilities ?? null,
    adapterType: b.adapterType,
    adapterConfig: b.adapterConfig ?? {},
    budgetMonthlyCents: b.budgetMonthlyCents ?? 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    errorReason: null,
    lastHeartbeatAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
  db.agents.push(a);
  let approval: Approval | null = null;
  if (needsApproval) {
    approval = { id: uid(), companyId: cid, type: "hire_agent", requestedByAgentId: null, requestedByUserId: "local-board", status: "pending", payload: { agentId: a.id, name: a.name, role: a.role, title: a.title, adapterType: a.adapterType }, decisionNote: null, decidedAt: null, createdAt: now() };
    db.approvals.unshift(approval);
  }
  logActivity(cid, null, "agent.created", "agent", a.id, { name: a.name });
  return { agent: a, approval };
};
on("POST", "/companies/:cid/agents", (m, b) => createAgent(m[1]!, b, false).agent);
on("POST", "/companies/:cid/agent-hires", (m, b) => createAgent(m[1]!, b, true));
on("GET", "/agents/:id", (m) => find(db.agents, m[1]!, "Agent"));
on("PATCH", "/agents/:id", (m, b) => Object.assign(find(db.agents, m[1]!, "Agent"), b, { updatedAt: now() }));
on("DELETE", "/agents/:id", (m) => {
  db.agents = db.agents.filter((a) => a.id !== m[1]);
  return { ok: true };
});
const setStatus = (status: Agent["status"], extra: Partial<Agent> = {}) => (m: RegExpMatchArray) => {
  const a = find(db.agents, m[1]!, "Agent");
  if (a.status === "terminated") throw new HttpError(409, "Agent is terminated");
  Object.assign(a, { status, updatedAt: now() }, extra);
  emit(a.companyId, "agent.status", { agentId: a.id, status });
  logActivity(a.companyId, null, `agent.${status}`, "agent", a.id, { name: a.name });
  return a;
};
on("POST", "/agents/:id/pause", setStatus("paused", { pauseReason: "Paused by board" }));
on("POST", "/agents/:id/resume", setStatus("idle", { pauseReason: null }));
on("POST", "/agents/:id/terminate", setStatus("terminated"));
on("POST", "/agents/:id/clear-error", setStatus("idle", { errorReason: null }));
on("POST", "/agents/:id/wakeup", (m, b) => {
  const a = find(db.agents, m[1]!, "Agent");
  if (a.status === "paused" || a.status === "terminated" || a.status === "pending_approval") {
    return { status: "skipped", reason: a.status, message: `Agent is ${a.status.replace("_", " ")}` };
  }
  if (a.status === "error") throw new HttpError(409, a.errorReason ?? "Agent is in an error state");
  if (db.runs.some((r) => r.agentId === a.id && ["queued", "running"].includes(r.status))) {
    return { status: "skipped", reason: "already_running", message: "Agent already has a run in progress" };
  }
  return startRun(a, b?.source ?? "on_demand", b?.reason);
});
on("GET", "/agents/:id/runtime-state", (m) => {
  const runs = db.runs.filter((r) => r.agentId === m[1]);
  const c = db.costs.filter((x) => x.agentId === m[1]);
  return {
    sessionId: runs.length ? `sess_${m[1]!.slice(0, 8)}` : null,
    lastRunId: runs[0]?.id ?? null,
    lastRunStatus: runs[0]?.status ?? null,
    totalInputTokens: c.reduce((s, x) => s + x.inputTokens, 0),
    totalOutputTokens: c.reduce((s, x) => s + x.outputTokens, 0),
    totalCostCents: c.reduce((s, x) => s + x.costCents, 0),
  };
});

on("GET", "/companies/:cid/issues", (m, _b, q) => {
  let list = db.issues.filter((i) => i.companyId === m[1]);
  const status = q.get("status");
  if (status) {
    const set = new Set(status.split(","));
    list = list.filter((i) => set.has(i.status));
  }
  const assignee = q.get("assigneeAgentId");
  if (assignee) list = list.filter((i) => i.assigneeAgentId === assignee);
  const project = q.get("projectId");
  if (project) list = list.filter((i) => i.projectId === project);
  const text = q.get("q")?.toLowerCase();
  if (text) list = list.filter((i) => i.title.toLowerCase().includes(text) || i.identifier?.toLowerCase().includes(text));
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
});
on("POST", "/companies/:cid/issues", (m, b) => {
  const cid = m[1]!;
  const co = find(db.companies, cid, "Company");
  if (!b?.title?.trim() && !b?.description?.trim()) throw new HttpError(400, "title: Title or description is required");
  db.issueCounter[cid] = (db.issueCounter[cid] ?? 0) + 1;
  const i: Issue = {
    id: uid(),
    companyId: cid,
    identifier: `${co.issuePrefix}-${db.issueCounter[cid]}`,
    projectId: b.projectId ?? null,
    goalId: b.goalId ?? null,
    parentId: b.parentId ?? null,
    title: b.title?.trim() || b.description.slice(0, 80),
    description: b.description ?? null,
    status: b.status ?? (b.assigneeAgentId ? "todo" : "backlog"),
    priority: b.priority ?? "medium",
    assigneeAgentId: b.assigneeAgentId ?? null,
    assigneeUserId: null,
    activeRun: null,
    createdAt: now(),
    updatedAt: now(),
  };
  db.issues.unshift(i);
  logActivity(cid, null, "issue.created", "issue", i.id, { title: i.title, assigneeAgentId: i.assigneeAgentId });
  const assignee = i.assigneeAgentId ? db.agents.find((a) => a.id === i.assigneeAgentId) : null;
  if (assignee && ["idle", "active"].includes(assignee.status)) startRun(assignee, "assignment", `Assigned ${i.identifier}`);
  return i;
});
on("GET", "/issues/:id", (m) => find(db.issues, m[1]!, "Task"));
on("PATCH", "/issues/:id", (m, b) => {
  const i = find(db.issues, m[1]!, "Task");
  const { comment, ...rest } = b ?? {};
  const prevAssignee = i.assigneeAgentId;
  Object.assign(i, rest, { updatedAt: now() });
  if (comment) db.comments.push({ id: uid(), issueId: i.id, authorType: "user", authorAgentId: null, authorUserId: "local-board", body: comment, createdAt: now() });
  logActivity(i.companyId, null, "issue.updated", "issue", i.id, { title: i.title, ...rest });
  if (rest.assigneeAgentId && rest.assigneeAgentId !== prevAssignee) {
    const a = db.agents.find((x) => x.id === rest.assigneeAgentId);
    if (i.status === "backlog") i.status = "todo";
    if (a && ["idle", "active"].includes(a.status)) startRun(a, "assignment", `Assigned ${i.identifier}`);
  }
  return i;
});
on("DELETE", "/issues/:id", (m) => {
  db.issues = db.issues.filter((i) => i.id !== m[1]);
  return { ok: true };
});
on("GET", "/issues/:id/comments", (m) => db.comments.filter((c) => c.issueId === m[1]).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));
on("POST", "/issues/:id/comments", (m, b) => {
  const i = find(db.issues, m[1]!, "Task");
  if (!b?.body?.trim()) throw new HttpError(400, "body: Required");
  const c: IssueComment = { id: uid(), issueId: i.id, authorType: "user", authorAgentId: null, authorUserId: "local-board", body: b.body, createdAt: now() };
  db.comments.push(c);
  logActivity(i.companyId, null, "issue.comment_added", "issue", i.id, { title: i.title });
  return c;
});
on("GET", "/issues/:id/activity", (m) => db.activity.filter((a) => a.entityType === "issue" && a.entityId === m[1]));
on("GET", "/issues/:id/runs", (m) => db.runs.filter((r) => r.issueId === m[1]));

on("GET", "/companies/:cid/heartbeat-runs", (m, _b, q) => {
  let list = db.runs.filter((r) => r.companyId === m[1]);
  const agentId = q.get("agentId");
  if (agentId) list = list.filter((r) => r.agentId === agentId);
  return list.slice(0, Number(q.get("limit") ?? 100));
});
on("GET", "/companies/:cid/live-runs", (m) => db.runs.filter((r) => r.companyId === m[1] && ["queued", "running"].includes(r.status)));
on("GET", "/heartbeat-runs/:id", (m) => find(db.runs, m[1]!, "Run"));
on("GET", "/heartbeat-runs/:id/events", (m, _b, q) => {
  const after = Number(q.get("afterSeq") ?? 0);
  return db.events.filter((e) => e.runId === m[1] && e.seq > after);
});
on("POST", "/heartbeat-runs/:id/cancel", (m) => {
  const r = find(db.runs, m[1]!, "Run");
  if (!["queued", "running"].includes(r.status)) throw new HttpError(409, "Run is not active");
  r.status = "cancelled";
  r.finishedAt = now();
  const a = db.agents.find((x) => x.id === r.agentId);
  if (a && a.status === "running") a.status = "idle";
  const issue = r.issueId ? db.issues.find((i) => i.id === r.issueId) : null;
  if (issue) issue.activeRun = null;
  emit(r.companyId, "heartbeat.run.status", { runId: r.id, agentId: r.agentId, status: "cancelled" });
  emit(r.companyId, "agent.status", { agentId: r.agentId, status: "idle" });
  return r;
});

on("GET", "/companies/:cid/approvals", (m, _b, q) => {
  let list = db.approvals.filter((a) => a.companyId === m[1]);
  const s = q.get("status");
  if (s) list = list.filter((a) => a.status === s);
  return list;
});
const decide = (status: Approval["status"]) => (m: RegExpMatchArray, b: any) => {
  const ap = find(db.approvals, m[1]!, "Approval");
  if (ap.status !== "pending" && ap.status !== "revision_requested") throw new HttpError(409, `Approval is already ${ap.status}`);
  Object.assign(ap, { status, decisionNote: b?.decisionNote ?? null, decidedAt: now() });
  if (ap.type === "hire_agent") {
    const agentId = ap.payload.agentId as string | undefined;
    if (agentId) {
      const a = db.agents.find((x) => x.id === agentId);
      if (a) a.status = status === "approved" ? "idle" : status === "rejected" ? "terminated" : a.status;
    } else if (status === "approved") {
      createAgent(ap.companyId, { ...ap.payload, reportsTo: ap.requestedByAgentId }, false);
    }
  }
  logActivity(ap.companyId, null, `approval.${status}`, "approval", ap.id, { type: ap.type });
  return ap;
};
on("POST", "/approvals/:id/approve", decide("approved"));
on("POST", "/approvals/:id/reject", decide("rejected"));
on("POST", "/approvals/:id/request-revision", decide("revision_requested"));

const inRange = (q: URLSearchParams) => (c: CostEvent) => {
  const from = q.get("from");
  const to = q.get("to");
  return (!from || c.createdAt >= from) && (!to || c.createdAt <= to);
};
on("GET", "/companies/:cid/costs/summary", (m, _b, q) => {
  const co = find(db.companies, m[1]!, "Company");
  const list = db.costs.filter((c) => c.companyId === m[1]).filter(inRange(q));
  const spend = list.reduce((s, c) => s + c.costCents, 0);
  return { spendCents: spend, budgetCents: co.budgetMonthlyCents, utilizationPercent: co.budgetMonthlyCents ? (spend / co.budgetMonthlyCents) * 100 : 0, eventCount: list.length };
});
on("GET", "/companies/:cid/costs/by-agent", (m, _b, q) => {
  const list = db.costs.filter((c) => c.companyId === m[1]).filter(inRange(q));
  return db.agents
    .filter((a) => a.companyId === m[1])
    .map((a) => {
      const mine = list.filter((c) => c.agentId === a.id);
      return {
        agentId: a.id,
        agentName: a.name,
        agentStatus: a.status,
        costCents: mine.reduce((s, c) => s + c.costCents, 0),
        inputTokens: mine.reduce((s, c) => s + c.inputTokens, 0),
        cachedInputTokens: mine.reduce((s, c) => s + c.cachedInputTokens, 0),
        outputTokens: mine.reduce((s, c) => s + c.outputTokens, 0),
        eventCount: mine.length,
      };
    })
    .filter((r) => r.eventCount > 0);
});

on("GET", "/companies/:cid/projects", (m) => db.projects.filter((p) => p.companyId === m[1]));
on("POST", "/companies/:cid/projects", (m, b) => {
  if (!b?.name?.trim()) throw new HttpError(400, "name: Required");
  const p = { id: uid(), companyId: m[1]!, name: b.name.trim(), description: b.description ?? null, status: b.status ?? "backlog", color: b.color ?? null };
  db.projects.push(p);
  return p;
});
on("GET", "/companies/:cid/goals", (m) => db.goals.filter((g) => g.companyId === m[1]));
on("GET", "/companies/:cid/activity", (m, _b, q) => db.activity.filter((a) => a.companyId === m[1]).slice(0, Number(q.get("limit") ?? 50)));


// ---------- auth ----------

const currentUser = () => db.users.find((u) => u.id === db.sessionUserId) ?? null;
const requireUser = () => {
  const u = currentUser();
  if (!u) throw new HttpError(401, "Unauthorized");
  return u;
};
const publicUser = (u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email, image: null });

on("GET", "/auth/get-session", () => {
  const u = requireUser();
  return { session: { id: `agentox:session:${u.id}`, userId: u.id }, user: publicUser(u) };
});
on("POST", "/auth/sign-in/email", (_m, b) => {
  const u = db.users.find((x) => x.email.toLowerCase() === String(b?.email ?? "").trim().toLowerCase());
  if (!u || u.password !== b?.password) throw new HttpError(401, "Invalid email or password", "INVALID_EMAIL_OR_PASSWORD");
  db.sessionUserId = u.id;
  return { user: publicUser(u) };
});
on("POST", "/auth/sign-up/email", (_m, b) => {
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Invalid email", "INVALID_EMAIL");
  if (String(b?.password ?? "").length < 8) throw new HttpError(400, "Password too short", "PASSWORD_TOO_SHORT");
  if (db.users.some((x) => x.email === email)) throw new HttpError(422, "User already exists", "USER_ALREADY_EXISTS");
  const u = { id: uid(), name: String(b?.name ?? "").trim() || email.split("@")[0]!, email, password: b.password, createdAt: now() };
  db.users = [...db.users, u];
  // New demo accounts join the sample workspace so there's something to look at.
  db.members = [...db.members, ...db.companies.map((c) => ({ id: uid(), companyId: c.id, userId: u.id, role: "operator", createdAt: now() }))];
  db.sessionUserId = u.id;
  return { user: publicUser(u) };
});
on("POST", "/auth/sign-out", () => {
  db.sessionUserId = null;
  return { success: true };
});
on("GET", "/auth/profile", () => publicUser(requireUser()));
on("PATCH", "/auth/profile", (_m, b) => {
  const u = requireUser();
  if (!String(b?.name ?? "").trim()) throw new HttpError(400, "name: Required");
  u.name = String(b.name).trim();
  db.users = [...db.users];
  return publicUser(u);
});
on("GET", "/cli-auth/me", () => {
  const u = requireUser();
  const ids = db.members.filter((m) => m.userId === u.id).map((m) => m.companyId);
  return { userId: u.id, isInstanceAdmin: db.members.some((m) => m.userId === u.id && m.role === "owner"), companyIds: ids };
});
on("GET", "/invites/:token", (m) => {
  const inv = db.invites.find((i) => i.token === m[1] && !i.revokedAt);
  if (!inv) throw new HttpError(404, "Invite not found or expired");
  const co = db.companies.find((c) => c.id === inv.companyId);
  return { id: inv.id, companyId: inv.companyId, companyName: co?.name, inviteType: "company_join", allowedJoinTypes: inv.allowedJoinTypes, humanRole: inv.humanRole, expiresAt: inv.expiresAt, invitedByUserName: "Demo Operator", inviteMessage: null };
});
on("POST", "/invites/:token/accept", (m) => {
  const u = requireUser();
  const inv = db.invites.find((i) => i.token === m[1] && !i.revokedAt);
  if (!inv) throw new HttpError(404, "Invite not found or expired");
  if (db.members.some((x) => x.userId === u.id && x.companyId === inv.companyId)) throw new HttpError(409, "You already belong to this company");
  const jr = { id: uid(), companyId: inv.companyId, status: "pending_approval" as const, requestType: "human" as const, requestingUserId: u.id, requesterName: u.name, requesterEmail: u.email, createdAt: now() };
  db.joinRequests = [jr, ...db.joinRequests];
  return jr;
});

// ---------- members ----------

on("GET", "/companies/:cid/members", (m) =>
  db.members
    .filter((x) => x.companyId === m[1])
    .map((x) => {
      const u = db.users.find((y) => y.id === x.userId);
      return { id: x.id, userId: x.userId, membershipRole: x.role, principalType: "user", user: u ? { id: u.id, name: u.name, email: u.email } : null, createdAt: x.createdAt };
    }),
);
on("GET", "/companies/:cid/invites", (m, _b, q) => {
  const state = q.get("state");
  const list = db.invites.filter((i) => i.companyId === m[1]).filter((i) => (state === "active" ? !i.revokedAt && !i.acceptedAt : true));
  return { invites: list, nextOffset: null };
});
on("POST", "/companies/:cid/invites", (m, b) => {
  const token = uid().replace(/-/g, "").slice(0, 24);
  const inv = { id: uid(), companyId: m[1]!, token, humanRole: b?.humanRole ?? "operator", allowedJoinTypes: b?.allowedJoinTypes ?? "human", createdAt: now(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), acceptedAt: null, revokedAt: null, invitePath: `/invite/${token}` };
  db.invites = [inv, ...db.invites];
  return { ...inv, inviteUrl: `${location.origin}/invite/${token}` };
});
on("POST", "/invites/:id/revoke", (m) => {
  const inv = find(db.invites, m[1]!, "Invite");
  inv.revokedAt = now();
  db.invites = [...db.invites];
  return inv;
});
on("GET", "/companies/:cid/join-requests", (m, _b, q) => db.joinRequests.filter((j) => j.companyId === m[1] && (!q.get("status") || j.status === q.get("status"))));
const decideJoin = (status: "approved" | "rejected") => (m: RegExpMatchArray) => {
  const jr = find(db.joinRequests, m[2]!, "Join request");
  jr.status = status;
  if (status === "approved" && jr.requestingUserId) db.members = [...db.members, { id: uid(), companyId: jr.companyId, userId: jr.requestingUserId, role: "operator", createdAt: now() }];
  if (status === "approved" && !jr.requestingUserId) {
    const u = { id: uid(), name: jr.requesterName ?? "New member", email: jr.requesterEmail ?? `${uid().slice(0, 6)}@example.com`, password: uid(), createdAt: now() };
    db.users = [...db.users, u];
    db.members = [...db.members, { id: uid(), companyId: jr.companyId, userId: u.id, role: "operator", createdAt: now() }];
  }
  db.joinRequests = [...db.joinRequests];
  return jr;
};
on("POST", "/companies/:cid/join-requests/:id/approve", decideJoin("approved"));
on("POST", "/companies/:cid/join-requests/:id/reject", decideJoin("rejected"));

// ---------- integrations ----------

on("POST", "/companies/:cid/adapters/:type/test-environment", (m) => {
  const type = decodeURIComponent(m[2]!);
  // OpenCode routes through OpenRouter in the demo; it passes once a working key is connected.
  const fail = type === "opencode_local" && !db.aiConnections.some((c) => c.companyId === m[1] && c.provider === "openrouter" && c.status === "connected");
  const warn = type === "gemini_local";
  return {
    adapterType: type,
    status: fail ? "fail" : warn ? "warn" : "pass",
    testedAt: now(),
    checks: [
      { code: "binary", level: "info", message: `${type.replace(/_local$/, "")} CLI found on PATH`, detail: `/usr/local/bin/${type.split("_")[0]}` },
      { code: "version", level: "info", message: "Version is supported" },
      fail
        ? { code: "auth", level: "error", message: "No credentials found", hint: "Set OPENROUTER_API_KEY or add an OpenRouter connection under Model providers." }
        : warn
          ? { code: "auth", level: "warn", message: "Using a personal login; runs will bill to that account", hint: "Add a shared API key connection for team usage." }
          : { code: "auth", level: "info", message: "Credentials present" },
      { code: "workspace", level: "info", message: "Working directory is writable" },
    ],
  };
});
on("GET", "/companies/:cid/ai-connections", (m) => ({ currentUserId: db.sessionUserId, canManageConnections: true, connections: db.aiConnections.filter((c) => c.companyId === m[1]) }));
on("POST", "/companies/:cid/ai-connections", (m, b) => {
  if (!b?.provider) throw new HttpError(400, "provider: Required");
  if (!String(b?.apiKey ?? "").trim()) throw new HttpError(400, "apiKey: Required");
  if (!String(b?.name ?? "").trim()) throw new HttpError(400, "name: Required");
  const key = String(b.apiKey);
  const c = { id: uid(), grantId: uid(), companyId: m[1]!, provider: b.provider, method: "api_key" as const, name: b.name.trim(), accountLabel: `${key.slice(0, 6)}…${key.slice(-4)}`, ownership: b.ownership ?? "shared", ownerName: currentUser()?.name ?? null, isDefault: !db.aiConnections.some((x) => x.companyId === m[1] && x.isDefault), status: "connected" as const };
  db.aiConnections = [...db.aiConnections, c];
  return { connectionId: c.id, grantId: c.grantId };
});
on("PUT", "/companies/:cid/ai-connections/default", (m, b) => {
  db.aiConnections = db.aiConnections.map((c) => (c.companyId === m[1] ? { ...c, isDefault: c.grantId === b?.grantId } : c));
  return { ok: true };
});
on("DELETE", "/tool-connections/:id/grants/:gid", (m) => {
  db.aiConnections = db.aiConnections.filter((c) => c.id !== m[1]);
  return { ok: true };
});
on("GET", "/companies/:cid/tools/gallery", () => ({
  apps: [
    ["github", "GitHub", "Repos, issues and pull requests", "Engineering"],
    ["slack", "Slack", "Post updates and take requests in channels", "Communication"],
    ["linear", "Linear", "Sync tasks with Linear issues", "Project management"],
    ["notion", "Notion", "Read and write workspace pages", "Knowledge"],
    ["google-drive", "Google Drive", "Search and edit docs and sheets", "Knowledge"],
    ["stripe", "Stripe", "Billing data and customer lookups", "Finance"],
    ["sentry", "Sentry", "Pull error reports into tasks", "Engineering"],
    ["postgres", "Postgres", "Query a database read-only", "Data"],
  ].map(([slug, name, description, cat]) => ({ slug, name, description, categories: [cat], availability: "available" })),
}));
on("GET", "/companies/:cid/tools/connections", (m) => ({ connections: db.toolConnections.filter((c) => c.companyId === m[1]) }));
on("POST", "/companies/:cid/tools/apps/connect", (m, b) => {
  const c = { id: uid(), companyId: m[1]!, name: b?.name ?? b?.galleryKey, applicationId: b?.galleryKey, connectionPurpose: "tool" as const, authKind: "oauth" as const, status: "active", healthStatus: "healthy" };
  db.toolConnections = [...db.toolConnections, c];
  return { connection: c };
});
on("POST", "/tool-connections/:id/health-check", (m) => {
  const c = find(db.toolConnections, m[1]!, "Connection");
  Object.assign(c, { healthStatus: "healthy", healthMessage: null });
  db.toolConnections = [...db.toolConnections];
  return c;
});
on("DELETE", "/tool-connections/:id", (m) => {
  db.toolConnections = db.toolConnections.filter((c) => c.id !== m[1]);
  db.aiConnections = db.aiConnections.filter((c) => c.id !== m[1]);
  return { ok: true };
});
on("GET", "/companies/:cid/secrets", (m) => db.secrets.filter((s) => s.companyId === m[1]));
on("POST", "/companies/:cid/secrets", (m, b) => {
  const name = String(b?.name ?? "").trim();
  if (!name) throw new HttpError(400, "name: Required");
  if (!String(b?.value ?? "")) throw new HttpError(400, "value: Required");
  const key = (b.key ?? name).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (db.secrets.some((s) => s.companyId === m[1] && s.key === key)) throw new HttpError(409, `A secret with key ${key} already exists`);
  const sec = { id: uid(), companyId: m[1]!, key, name, provider: "local_encrypted", status: "active", latestVersion: 1, description: b.description ?? null, lastRotatedAt: null, referenceCount: 0, createdAt: now(), updatedAt: now() };
  db.secrets = [...db.secrets, sec];
  return sec;
});
on("DELETE", "/secrets/:id", (m) => {
  db.secrets = db.secrets.filter((s) => s.id !== m[1]);
  return { ok: true };
});
on("GET", "/board-api-keys", () => db.apiKeys.filter((k) => !k.revokedAt));
on("POST", "/board-api-keys", (_m, b) => {
  const k = { id: uid(), name: String(b?.name ?? "").trim() || "agentox cli", createdAt: now(), lastUsedAt: null, revokedAt: null, expiresAt: b?.expiresAt ?? null };
  db.apiKeys = [...db.apiKeys, k];
  return { ...k, token: `pcp_${uid().replace(/-/g, "")}` };
});
on("DELETE", "/board-api-keys/:id", (m) => {
  db.apiKeys = db.apiKeys.map((k) => (k.id === m[1] ? { ...k, revokedAt: now() } : k));
  return { ok: true, keyId: m[1] };
});
on("GET", "/mcp/setup", () => ({ enabled: true, serverUrl: `${location.origin}/mcp/agentox` }));
on("GET", "/mcp/connections", () => db.mcpConnections.filter((c) => !c.revokedAt));
on("DELETE", "/mcp/connections/:id", (m) => {
  db.mcpConnections = db.mcpConnections.map((c) => (c.id === m[1] ? { ...c, revokedAt: now() } : c));
  return undefined;
});

export async function mockRequest<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 140));
  const [path, query = ""] = fullPath.split("?");
  const q = new URLSearchParams(query);
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = path!.match(re);
    if (!match) continue;
    try {
      const result = h(match, body ? structuredClone(body) : body, q);
      if (method !== "GET") save();
      return structuredClone(result) as T;
    } catch (e) {
      if (e instanceof HttpError) throw new ApiError(e.status, e.message, { error: e.message, code: e.code, message: e.message });
      throw e;
    }
  }
  throw new ApiError(404, `Demo backend has no route for ${method} ${path}`, null);
}
