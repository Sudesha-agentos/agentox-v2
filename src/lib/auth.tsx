import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/api/client";
import type { AuthUser, CliMe, HealthStatus, SessionResponse } from "@/api/types";

/*
 * Auth state machine (mirrors the server's own gate):
 *   offline            server unreachable
 *   local_trusted      no auth; implicit local operator
 *   authenticated:
 *     bootstrap        a brand-new server nobody has set up yet
 *     signed_out       → /login
 *     onboarding       signed in, no workspace yet → verify email, then create or request one
 *     ready
 */

export type AuthMode = "local_trusted" | "authenticated";
export type AuthPhase = "loading" | "offline" | "bootstrap" | "signed_out" | "onboarding" | "ready";

interface AuthApi {
  phase: AuthPhase;
  mode: AuthMode;
  user: AuthUser | null;
  health: HealthStatus | undefined;
  /** The server answered before but the latest check failed; the app stays up and shows a notice. */
  reconnecting: boolean;
  canSignOut: boolean;
  retry: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  claimInstance: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

async function fetchSession(): Promise<SessionResponse | null> {
  try {
    const s = await api.get<SessionResponse | null>("/auth/get-session");
    return s && s.user ? s : null;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
    throw e;
  }
}

async function fetchMe(): Promise<CliMe | null> {
  try {
    return await api.get<CliMe>("/cli-auth/me");
  } catch {
    return null; // older servers: skip the membership check
  }
}

/** Better Auth errors carry `code` and `message` in a few shapes. */
export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { code?: string; message?: string; error?: { code?: string; message?: string } | string } | null;
    const code = (typeof b?.error === "object" ? b.error?.code : undefined) ?? b?.code;
    if (code === "EMAIL_PASSWORD_SIGN_UP_DISABLED") return "Sign-up is disabled on this server. Ask an admin for an invite.";
    if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "An account with this email already exists.";
    if (code === "INVALID_EMAIL_OR_PASSWORD" || e.status === 401) return "Incorrect email or password.";
    if (code === "PASSWORD_TOO_SHORT") return "Password must be at least 8 characters.";
    const msg = (typeof b?.error === "object" ? b.error?.message : undefined) ?? b?.message;
    if (msg) return msg;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<HealthStatus>("/health"),
    // A brief blip (a restart, a dropped packet) should not flash the unreachable screen.
    retry: 2,
    retryDelay: 1500,
    refetchInterval: (q) => (q.state.status === "error" ? 4000 : q.state.data?.bootstrapStatus === "bootstrap_pending" ? 2500 : 30000),
  });
  const authed = health.data?.deploymentMode === "authenticated";
  const healthFailing = health.errorUpdatedAt > health.dataUpdatedAt;
  const session = useQuery({ queryKey: ["session"], queryFn: fetchSession, enabled: authed, retry: false, staleTime: 60_000 });
  const me = useQuery({ queryKey: ["me", session.data?.user.id], queryFn: fetchMe, enabled: authed && !!session.data, retry: false, staleTime: 60_000 });

  const value = useMemo<AuthApi>(() => {
    const mode: AuthMode = authed ? "authenticated" : "local_trusted";
    let phase: AuthPhase = "loading";
    // Offline only when the server has never answered; once it has, keep the last known state.
    // (A query that never succeeded goes back to "pending" on every retry, so judge by timestamps.)
    if (!health.data && healthFailing) phase = "offline";
    else if (health.isPending) phase = "loading";
    else if (!authed) phase = "ready";
    else if (health.data?.bootstrapStatus === "bootstrap_pending") phase = "bootstrap";
    else if (session.isPending) phase = "loading";
    else if (session.isError) phase = "offline";
    else if (!session.data) phase = "signed_out";
    else if (me.isPending) phase = "loading";
    else if (me.data && me.data.companyIds.length === 0) phase = "onboarding";
    else phase = "ready";

    const after = async () => {
      qc.removeQueries({ queryKey: ["c"] });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["health"] });
      await qc.invalidateQueries({ queryKey: ["companies"] });
    };

    return {
      phase,
      mode,
      user: session.data?.user ?? null,
      health: health.data,
      reconnecting: !!health.data && healthFailing,
      canSignOut: authed && !!session.data,
      retry: () => {
        health.refetch();
        if (authed) session.refetch();
      },
      signIn: async (email, password) => {
        await api.post("/auth/sign-in/email", { email, password });
        await after();
      },
      signUp: async (name, email, password) => {
        await api.post("/auth/sign-up/email", { name, email, password });
        await after();
      },
      signOut: async () => {
        try {
          await api.post("/auth/sign-out", {});
        } finally {
          qc.clear();
          window.location.href = "/login";
        }
      },
      claimInstance: async () => {
        await api.post("/bootstrap/claim", {});
        await after();
      },
      refresh: after,
    };
  }, [authed, health.isError, health.isPending, health.data, session.isPending, session.isError, session.data, me.isPending, me.data, qc, health, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
