// Subset of the agentox server contract that the interface relies on.

export type DeploymentMode = "local_trusted" | "authenticated";

export interface HealthStatus {
  deploymentExposure?: "private" | "public";
  bootstrapInviteActive?: boolean;
  status: "ok" | "starting";
  version?: string;
  deploymentMode?: DeploymentMode;
  authReady?: boolean;
  bootstrapStatus?: "ready" | "bootstrap_pending";
}

export interface Session {
  user: { id: string; name?: string | null; email?: string | null } | null;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: string;
  issuePrefix: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  companyId: string;
  agents: { active: number; running: number; paused: number; error: number };
  tasks: { open: number; inProgress: number; blocked: number; done: number };
  costs: { monthSpendCents: number; monthBudgetCents: number; monthUtilizationPercent: number };
  pendingApprovals: number;
  runActivity: Array<{ date: string; succeeded: number; failed: number; recovered: number; other: number; total: number }>;
}

export const AGENT_ROLES = ["ceo", "cto", "cmo", "cfo", "security", "engineer", "designer", "pm", "qa", "devops", "researcher", "general"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export type AgentStatus = "active" | "paused" | "idle" | "running" | "error" | "pending_approval" | "terminated";

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role: AgentRole | string;
  title: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  pauseReason: string | null;
  errorReason?: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdapterInfo {
  type: string;
  label: string;
  source: "builtin" | "external";
  loaded?: boolean;
  disabled?: boolean;
}

export interface AgentRuntimeState {
  sessionId: string | null;
  lastRunId: string | null;
  lastRunStatus: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
}

export const ISSUE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export interface Issue {
  id: string;
  companyId: string;
  identifier: string | null;
  projectId: string | null;
  goalId: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  activeRun?: { id: string; status: string; agentId: string; startedAt: string | null; finishedAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  authorType: "agent" | "user" | "system" | string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: string;
}

export type RunStatus = "queued" | "scheduled_retry" | "running" | "succeeded" | "interrupted" | "failed" | "cancelled" | "timed_out";

export interface HeartbeatRun {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  invocationSource: string;
  triggerDetail: string | null;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  exitCode: number | null;
  usageJson?: Record<string, unknown> | null;
  stdoutExcerpt?: string | null;
  createdAt: string;
}

export interface HeartbeatRunEvent {
  id: number | string;
  runId: string;
  seq: number;
  eventType: string;
  stream: "system" | "stdout" | "stderr" | null;
  level: string | null;
  message: string | null;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "revision_requested" | "approved" | "rejected" | "cancelled";

export interface Approval {
  id: string;
  companyId: string;
  type: "hire_agent" | "approve_ceo_strategy" | "budget_override_required" | "request_board_approval" | string;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CostSummary {
  spendCents: number;
  budgetCents: number;
  utilizationPercent: number;
  eventCount: number;
}

export interface CostByAgent {
  agentId: string;
  agentName: string;
  agentStatus: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  eventCount: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  color?: string | null;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
}

export interface ActivityEvent {
  id: string;
  actorType: "agent" | "user" | "system" | "plugin";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  runId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface LiveEvent {
  id: number;
  companyId: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

/* ---------- auth ---------- */

export interface HealthFull extends HealthStatus {
  deploymentExposure?: "private" | "public";
  bootstrapInviteActive?: boolean;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image?: string | null;
}

export interface SessionResponse {
  session: { id: string; userId: string };
  user: AuthUser;
}

export interface CliMe {
  userId: string;
  isInstanceAdmin: boolean;
  companyIds: string[];
}

export interface InviteInfo {
  id: string;
  companyId: string;
  companyName?: string | null;
  inviteType: "company_join" | "bootstrap_ceo";
  allowedJoinTypes: "human" | "agent" | "both";
  humanRole?: string | null;
  expiresAt: string | null;
  inviteMessage?: string | null;
  invitedByUserName?: string | null;
}

export interface CompanyInvite {
  id: string;
  humanRole?: string | null;
  allowedJoinTypes: string;
  createdAt: string;
  expiresAt: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  inviteUrl?: string;
  invitePath?: string;
  token?: string;
}

export interface Member {
  id: string;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  membershipRole?: string | null;
  principalType?: string;
  principalId?: string | null;
  status?: string;
  user?: { id: string; name?: string | null; email?: string | null } | null;
  createdAt?: string;
}

export interface JoinRequest {
  id: string;
  status: "pending_approval" | "approved" | "rejected";
  requestType?: "human" | "agent";
  agentName?: string | null;
  requestingUserId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  createdAt: string;
}

/* ---------- integrations ---------- */

export interface AdapterDetail extends AdapterInfo {
  modelsCount?: number;
  version?: string | null;
  packageName?: string | null;
  capabilities?: Record<string, unknown>;
}

export interface EnvCheck {
  code: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export interface EnvTestResult {
  adapterType: string;
  status: "pass" | "warn" | "fail";
  checks: EnvCheck[];
  testedAt: string;
}

export const AI_PROVIDERS = ["anthropic", "openai", "openrouter", "xai", "google", "github"] as const;

export interface AiConnection {
  id: string;
  grantId: string;
  provider: string;
  method: "subscription" | "api_key";
  name: string;
  accountLabel?: string | null;
  ownership: "personal" | "shared";
  ownerName?: string | null;
  isDefault: boolean;
  status: "connected" | "needs_attention" | "expired" | "revoked";
  unavailableReason?: string | null;
}

export interface AiConnectionsResponse {
  currentUserId?: string | null;
  canManageConnections?: boolean;
  connections: AiConnection[];
}

export interface AppField {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "datetime" | "select" | "checkbox";
  required?: boolean;
  advanced?: boolean;
  hidden?: boolean;
  placeholder?: string;
  helperMd?: string;
  secret?: boolean;
  defaultValue?: string | boolean;
}

/** One way to connect an app (OAuth, API key, or no auth). */
export interface AppMethod {
  key: string;
  label?: string;
  auth: "oauth" | "api_key" | "none";
  whenToUse?: string;
  credentialFields?: AppField[];
  tenantFields?: AppField[];
  consoleLinks?: { keys?: string; register?: string; docs?: string };
}

export interface ToolApp {
  slug: string;
  name: string;
  description?: string | null;
  categories?: string[];
  methods?: AppMethod[];
  availability?: { available: boolean; reason?: string } | string;
  setupPrerequisite?: { title: string; description: string; actionLabel: string; actionUrl: string };
}

export interface ConnectAppResult {
  connectionId: string;
  connection: ToolConnection;
  actions?: {
    readOnly: Array<{ catalogEntryId: string }>;
    canMakeChanges: Array<{ catalogEntryId: string }>;
  };
  auth?: { kind: "oauth"; startUrl: string | null; manualClientRequired?: boolean } | null;
}

export interface ToolConnection {
  id: string;
  name: string;
  applicationId?: string | null;
  connectionPurpose: "tool" | "channel" | "ai";
  authKind: "oauth" | "api_key" | "none";
  status?: string;
  healthStatus?: string | null;
  healthMessage?: string | null;
  requiresReauthorization?: boolean;
}

export interface Secret {
  id: string;
  key: string;
  name: string;
  provider: string;
  status: string;
  latestVersion?: number;
  description?: string | null;
  lastRotatedAt?: string | null;
  referenceCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardApiKey {
  id: string;
  name: string;
  token?: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface McpSetup {
  enabled: boolean;
  serverUrl: string | null;
}

export interface McpConnection {
  id: string;
  clientName: string | null;
  companyName?: string | null;
  scopes?: string[] | string | null;
  createdAt: string;
  revokedAt: string | null;
}
