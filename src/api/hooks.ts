import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, qs } from "./client";
import type {
  ActivityEvent,
  Agent,
  AgentRuntimeState,
  Approval,
  Company,
  CostByAgent,
  CostSummary,
  DashboardSummary,
  Goal,
  HealthStatus,
  HeartbeatRun,
  HeartbeatRunEvent,
  Issue,
  IssueComment,
  Project,
  AdapterDetail,
  AiConnectionsResponse,
  BoardApiKey,
  CompanyInvite,
  JoinRequest,
  McpConnection,
  McpSetup,
  Member,
  Secret,
  ToolApp,
  ToolConnection,
  EnvTestResult,
} from "./types";
import { toast, toastError } from "@/lib/toast";

// Every company-scoped key starts with ["c", companyId] so one invalidation refreshes a company.
export const keys = {
  health: ["health"] as const,
  companies: ["companies"] as const,
  dashboard: (cid: string) => ["c", cid, "dashboard"] as const,
  agents: (cid: string) => ["c", cid, "agents"] as const,
  agent: (cid: string, id: string) => ["c", cid, "agent", id] as const,
  runtime: (cid: string, id: string) => ["c", cid, "agent", id, "runtime"] as const,
  adapters: (cid: string) => ["c", cid, "adapters"] as const,
  issues: (cid: string, filters: Record<string, string | undefined> = {}) => ["c", cid, "issues", filters] as const,
  issue: (cid: string, id: string) => ["c", cid, "issue", id] as const,
  comments: (cid: string, id: string) => ["c", cid, "issue", id, "comments"] as const,
  issueRuns: (cid: string, id: string) => ["c", cid, "issue", id, "runs"] as const,
  runs: (cid: string, agentId?: string) => ["c", cid, "runs", agentId ?? "all"] as const,
  liveRuns: (cid: string) => ["c", cid, "live-runs"] as const,
  run: (cid: string, id: string) => ["c", cid, "run", id] as const,
  runEvents: (cid: string, id: string) => ["c", cid, "run", id, "events"] as const,
  approvals: (cid: string, status?: string) => ["c", cid, "approvals", status ?? "all"] as const,
  costSummary: (cid: string, range: string) => ["c", cid, "costs", "summary", range] as const,
  costByAgent: (cid: string, range: string) => ["c", cid, "costs", "by-agent", range] as const,
  projects: (cid: string) => ["c", cid, "projects"] as const,
  goals: (cid: string) => ["c", cid, "goals"] as const,
  activity: (cid: string) => ["c", cid, "activity"] as const,
  members: (cid: string) => ["c", cid, "members"] as const,
  invites: (cid: string) => ["c", cid, "invites"] as const,
  joinRequests: (cid: string) => ["c", cid, "join-requests"] as const,
  aiConnections: (cid: string) => ["c", cid, "ai-connections"] as const,
  toolGallery: (cid: string) => ["c", cid, "tools", "gallery"] as const,
  toolConnections: (cid: string) => ["c", cid, "tools", "connections"] as const,
  secrets: (cid: string) => ["c", cid, "secrets"] as const,
  apiKeys: ["user", "api-keys"] as const,
  mcpSetup: ["user", "mcp-setup"] as const,
  mcpConnections: ["user", "mcp-connections"] as const,
};

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: () => api.get<HealthStatus>("/health"), retry: false, refetchInterval: (q) => (q.state.status === "error" ? 5000 : 30000) });

export const useCompanies = (enabled = true) =>
  useQuery({ queryKey: keys.companies, queryFn: () => api.get<Company[]>("/companies?scope=accessible"), enabled });

export const useDashboard = (cid: string) => useQuery({ queryKey: keys.dashboard(cid), queryFn: () => api.get<DashboardSummary>(`/companies/${cid}/dashboard`) });

export const useAgents = (cid: string) => useQuery({ queryKey: keys.agents(cid), queryFn: () => api.get<Agent[]>(`/companies/${cid}/agents`) });

export const useAgent = (cid: string, id: string) => useQuery({ queryKey: keys.agent(cid, id), queryFn: () => api.get<Agent>(`/agents/${id}?companyId=${cid}`) });

export const useRuntimeState = (cid: string, id: string) =>
  useQuery({ queryKey: keys.runtime(cid, id), queryFn: () => api.get<AgentRuntimeState>(`/agents/${id}/runtime-state?companyId=${cid}`), retry: false });

export const useAdapters = (cid: string) =>
  useQuery({ queryKey: keys.adapters(cid), queryFn: () => api.get<AdapterDetail[]>(`/adapters?companyId=${cid}`), staleTime: 5 * 60_000 });

export const useIssues = (cid: string, filters: { status?: string; assigneeAgentId?: string; projectId?: string; q?: string } = {}) =>
  useQuery({
    queryKey: keys.issues(cid, filters),
    queryFn: () => api.get<Issue[]>(`/companies/${cid}/issues${qs({ ...filters, limit: 500 })}`),
    placeholderData: (prev) => prev,
  });

export const useIssue = (cid: string, id: string) => useQuery({ queryKey: keys.issue(cid, id), queryFn: () => api.get<Issue>(`/issues/${id}`) });

export const useComments = (cid: string, id: string) =>
  useQuery({ queryKey: keys.comments(cid, id), queryFn: () => api.get<IssueComment[]>(`/issues/${id}/comments?order=asc`) });

export const useIssueRuns = (cid: string, id: string) =>
  useQuery({ queryKey: keys.issueRuns(cid, id), queryFn: () => api.get<HeartbeatRun[]>(`/issues/${id}/runs`), retry: false });

export const useRuns = (cid: string, agentId?: string, limit = 100) =>
  useQuery({ queryKey: keys.runs(cid, agentId), queryFn: () => api.get<HeartbeatRun[]>(`/companies/${cid}/heartbeat-runs${qs({ agentId, limit })}`) });

export const useLiveRuns = (cid: string) =>
  useQuery({ queryKey: keys.liveRuns(cid), queryFn: () => api.get<HeartbeatRun[]>(`/companies/${cid}/live-runs?limit=20`), refetchInterval: 15000 });

export const useRun = (cid: string, id: string) =>
  useQuery({
    queryKey: keys.run(cid, id),
    queryFn: () => api.get<HeartbeatRun>(`/heartbeat-runs/${id}`),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 4000 : false),
  });

export const useRunEvents = (cid: string, id: string, active: boolean) =>
  useQuery({
    queryKey: keys.runEvents(cid, id),
    queryFn: () => api.get<HeartbeatRunEvent[]>(`/heartbeat-runs/${id}/events?afterSeq=0&limit=1000`),
    enabled: !!id,
    refetchInterval: active ? 2500 : false,
  });

export const useApprovals = (cid: string, status?: string) =>
  useQuery({ queryKey: keys.approvals(cid, status), queryFn: () => api.get<Approval[]>(`/companies/${cid}/approvals${qs({ status })}`) });

export type CostRange = "mtd" | "7d" | "30d" | "all";
function rangeParams(range: CostRange) {
  const d = new Date();
  if (range === "mtd") return qs({ from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString() });
  if (range === "7d") return qs({ from: new Date(Date.now() - 7 * 86_400_000).toISOString() });
  if (range === "30d") return qs({ from: new Date(Date.now() - 30 * 86_400_000).toISOString() });
  return qs({ period: "all" });
}
export const useCostSummary = (cid: string, range: CostRange) =>
  useQuery({ queryKey: keys.costSummary(cid, range), queryFn: () => api.get<CostSummary>(`/companies/${cid}/costs/summary${rangeParams(range)}`) });
export const useCostByAgent = (cid: string, range: CostRange) =>
  useQuery({ queryKey: keys.costByAgent(cid, range), queryFn: () => api.get<CostByAgent[]>(`/companies/${cid}/costs/by-agent${rangeParams(range)}`) });

export const useProjects = (cid: string) => useQuery({ queryKey: keys.projects(cid), queryFn: () => api.get<Project[]>(`/companies/${cid}/projects`) });
export const useGoals = (cid: string) => useQuery({ queryKey: keys.goals(cid), queryFn: () => api.get<Goal[]>(`/companies/${cid}/goals`) });
export const useActivity = (cid: string, limit = 30) =>
  useQuery({ queryKey: keys.activity(cid), queryFn: () => api.get<ActivityEvent[]>(`/companies/${cid}/activity?limit=${limit}`) });

// ---------- mutations ----------

/** Mutation that toasts on success/failure and refreshes the given keys (default: whole company). */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult, v: TVars) => string | null); invalidate?: (v: TVars, r: TResult) => QueryKey[]; cid?: string } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      const msg = typeof opts.success === "function" ? opts.success(r, v) : opts.success;
      if (msg) toast(msg);
      const ks = opts.invalidate?.(v, r) ?? (opts.cid ? [["c", opts.cid]] : [["c"]]);
      ks.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: toastError,
  });
}

export type WakeResult = HeartbeatRun | { status: "skipped"; reason?: string; message?: string };
export const isSkipped = (r: WakeResult): r is { status: "skipped"; reason?: string; message?: string } => r.status === "skipped";

export function useAgentActions(cid: string) {
  const wake = useAction((v: { id: string; reason?: string; forceFreshSession?: boolean }) => api.post<WakeResult>(`/agents/${v.id}/wakeup?companyId=${cid}`, { source: "on_demand", triggerDetail: "manual", reason: v.reason || undefined, forceFreshSession: v.forceFreshSession || undefined }), {
    cid,
    success: (r) => (isSkipped(r) ? null : "Heartbeat started"),
  });
  const pause = useAction((id: string) => api.post<Agent>(`/agents/${id}/pause?companyId=${cid}`), { cid, success: "Agent paused" });
  const resume = useAction((id: string) => api.post<Agent>(`/agents/${id}/resume?companyId=${cid}`), { cid, success: "Agent resumed" });
  const terminate = useAction((id: string) => api.post<Agent>(`/agents/${id}/terminate?companyId=${cid}`), { cid, success: "Agent terminated" });
  const clearError = useAction((id: string) => api.post<Agent>(`/agents/${id}/clear-error?companyId=${cid}`), { cid, success: "Error cleared" });
  return { wake, pause, resume, terminate, clearError };
}

export function useUpdateIssue(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<Issue> & { comment?: string } }) => api.patch<Issue>(`/issues/${v.id}`, v.patch),
    // Optimistic so board drags and status pickers feel instant
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["c", cid, "issues"] });
      const snapshots = qc.getQueriesData<Issue[]>({ queryKey: ["c", cid, "issues"] });
      snapshots.forEach(([k, list]) => list && qc.setQueryData(k, list.map((i) => (i.id === id ? { ...i, ...patch } : i))));
      const single = qc.getQueryData<Issue>(keys.issue(cid, id));
      if (single) qc.setQueryData(keys.issue(cid, id), { ...single, ...patch });
      return { snapshots, single };
    },
    onError: (err, { id }, ctx) => {
      ctx?.snapshots.forEach(([k, list]) => qc.setQueryData(k, list));
      if (ctx?.single) qc.setQueryData(keys.issue(cid, id), ctx.single);
      toastError(err);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["c", cid] }),
  });
}

// ---------- people ----------

export const useMembers = (cid: string) => useQuery({ queryKey: keys.members(cid), queryFn: () => api.get<Member[]>(`/companies/${cid}/members`) });
export const useInvites = (cid: string) =>
  useQuery({ queryKey: keys.invites(cid), queryFn: () => api.get<{ invites: CompanyInvite[] }>(`/companies/${cid}/invites?state=active&limit=50`).then((r) => r.invites ?? []) });
export const useJoinRequests = (cid: string) =>
  useQuery({ queryKey: keys.joinRequests(cid), queryFn: () => api.get<JoinRequest[]>(`/companies/${cid}/join-requests?status=pending_approval`) });

// ---------- integrations ----------

export const useAiConnections = (cid: string) =>
  useQuery({ queryKey: keys.aiConnections(cid), queryFn: () => api.get<AiConnectionsResponse>(`/companies/${cid}/ai-connections`) });
export const useToolGallery = (cid: string) =>
  useQuery({ queryKey: keys.toolGallery(cid), queryFn: () => api.get<{ apps: ToolApp[] }>(`/companies/${cid}/tools/gallery`).then((r) => r.apps ?? []), staleTime: 10 * 60_000 });
export const useToolConnections = (cid: string) =>
  useQuery({ queryKey: keys.toolConnections(cid), queryFn: () => api.get<{ connections: ToolConnection[] }>(`/companies/${cid}/tools/connections`).then((r) => r.connections ?? []) });
export const useSecrets = (cid: string) => useQuery({ queryKey: keys.secrets(cid), queryFn: () => api.get<Secret[]>(`/companies/${cid}/secrets`) });
export const useApiKeys = () => useQuery({ queryKey: keys.apiKeys, queryFn: () => api.get<BoardApiKey[]>("/board-api-keys") });
export const useMcpSetup = () => useQuery({ queryKey: keys.mcpSetup, queryFn: () => api.get<McpSetup>("/mcp/setup"), retry: false });
export const useMcpConnections = () => useQuery({ queryKey: keys.mcpConnections, queryFn: () => api.get<McpConnection[]>("/mcp/connections"), retry: false });

export const useIssueActivity = (cid: string, id: string) =>
  useQuery({ queryKey: ["c", cid, "issue", id, "activity"], queryFn: () => api.get<ActivityEvent[]>(`/issues/${id}/activity`), retry: false });

/** Environment test per runtime. Cached so the readiness view doesn't re-run checks on every visit. */
export const useEnvTest = (cid: string, type: string, enabled = true) =>
  useQuery({
    queryKey: ["c", cid, "env-test", type],
    queryFn: () => api.post<EnvTestResult>(`/companies/${cid}/adapters/${encodeURIComponent(type)}/test-environment`, { adapterConfig: {} }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
