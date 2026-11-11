import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/** Where a signed-in person is in getting to a workspace (served by the agentox gateway). */
export type OnboardingStep = "verify" | "create" | "request" | "pending" | "ready";

export interface AccessRequest {
  id: string;
  companyId: string;
  userId: string;
  email: string;
  name: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  role: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface OnboardingState {
  step: OnboardingStep;
  user: { id: string; email: string; name: string };
  domain: string;
  personal: boolean;
  emailVerified: boolean;
  codeSentAt?: string | null;
  /** The name a new workspace will get (step "create"). */
  workspaceName?: string;
  /** The team's existing workspace (steps "request" and "pending"). */
  workspace?: { id: string; name: string };
  request?: AccessRequest;
  lastDecision?: "rejected" | null;
}

export interface CliCode {
  code: string;
  command: string;
  expiresAt: string;
  keyExpiresAt: string;
}

export const gatewayKeys = {
  state: ["agentox", "state"] as const,
  config: ["agentox", "config"] as const,
  requests: (cid: string) => ["agentox", "requests", cid] as const,
};

export function useOnboarding(enabled = true) {
  return useQuery({
    queryKey: gatewayKeys.state,
    queryFn: () => api.get<OnboardingState>("/agentox/state"),
    enabled,
    retry: 1,
    refetchInterval: (q) => (q.state.data?.step === "pending" ? 4000 : false),
  });
}

export function useGatewayConfig() {
  return useQuery({ queryKey: gatewayKeys.config, queryFn: () => api.get<{ serviceUserId: string | null }>("/agentox/config"), staleTime: Infinity, retry: false });
}

function useStateMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: gatewayKeys.state }) });
}

export const useSendCode = () => useMutation({ mutationFn: () => api.post<{ sent?: boolean; verified?: boolean }>("/agentox/email/send", {}) });
export const useVerifyCode = () => useStateMutation((code: string) => api.post("/agentox/email/verify", { code }));
export const useCreateWorkspace = () => useStateMutation(() => api.post<{ companyId: string }>("/agentox/workspace", {}));
export const useRequestAccess = () => useStateMutation(() => api.post<AccessRequest>("/agentox/access-requests", {}));
export const useCancelRequest = () => useStateMutation(() => api.del("/agentox/access-requests/mine"));

/** Pending requests to join a workspace; empty for people who can't admit others. */
export function useAccessRequests(cid: string) {
  return useQuery({
    queryKey: gatewayKeys.requests(cid),
    queryFn: () => api.get<AccessRequest[]>(`/agentox/companies/${cid}/access-requests`),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useDecideAccess(cid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; role?: string }) => api.post<AccessRequest>(`/agentox/access-requests/${v.id}/decide`, { decision: v.decision, role: v.role }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: gatewayKeys.requests(cid) });
      qc.invalidateQueries({ queryKey: ["c", cid, "members"] });
    },
  });
}

export const useCliCode = () => useMutation({ mutationFn: () => api.post<CliCode>("/agentox/cli/codes", {}) });
