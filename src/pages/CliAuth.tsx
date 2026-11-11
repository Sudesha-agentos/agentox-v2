import { useState } from "react";
import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Terminal, X } from "lucide-react";
import { api } from "@/api/client";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { Button, Spinner } from "@/components/ui";
import { AuthFrame, FormError, Heading } from "./Auth";

interface Challenge {
  id: string;
  status: "pending" | "approved" | "cancelled" | "expired";
  command: string;
  clientName: string | null;
  requestedAccess: "board" | "instance_admin_required";
  requestedCompanyName: string | null;
  expiresAt: string;
  requiresSignIn: boolean;
  canApprove: boolean;
}

/** Approves a terminal sign-in started with `agentox auth login`. */
export function CliAuthPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const location = useLocation();
  const auth = useAuth();
  const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const challenge = useQuery({
    queryKey: ["cli-auth", id],
    queryFn: () => api.get<Challenge>(`/cli-auth/challenges/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`),
    enabled: auth.phase !== "loading" && auth.phase !== "offline",
    retry: false,
  });

  if (auth.phase === "loading" || challenge.isPending) {
    return (
      <AuthFrame>
        <Spinner />
      </AuthFrame>
    );
  }
  if (auth.phase === "signed_out") return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (challenge.isError) {
    return (
      <AuthFrame>
        <Heading title="This sign-in link doesn't work" sub="It may have expired or been copied incorrectly. Run agentox auth login again in your terminal." />
      </AuthFrame>
    );
  }

  const c = challenge.data;
  const act = async (kind: "approve" | "cancel") => {
    setBusy(kind);
    setError(null);
    try {
      await api.post(`/cli-auth/challenges/${encodeURIComponent(id)}/${kind}`, { token });
      await challenge.refetch();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (c.status === "approved") {
    return (
      <AuthFrame>
        <Heading title="Your terminal is signed in" sub="You can close this tab and go back to your terminal." />
        <Check className="size-5" />
      </AuthFrame>
    );
  }
  if (c.status !== "pending") {
    return (
      <AuthFrame>
        <Heading title={c.status === "expired" ? "This request expired" : "Sign-in cancelled"} sub="Run agentox auth login again in your terminal to start over." />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame>
      <Heading title="Sign in your terminal?" sub={<>A terminal is asking to act as <span className="text-fg">{auth.user?.email}</span>. Only approve if you just started this yourself.</>} />
      <div className="mb-6 rounded-sm border border-line-2 bg-panel px-3 py-2.5">
        <div className="mb-1 flex items-center gap-2 text-xs text-fg-3">
          <Terminal className="size-3.5" /> {c.clientName ?? "agentox CLI"}
        </div>
        <div className="mono text-xs break-all text-fg">{c.command}</div>
        {c.requestedCompanyName && <div className="mt-1 text-xs text-fg-3">For {c.requestedCompanyName}</div>}
      </div>
      <FormError msg={error ?? (c.canApprove ? null : "Your account can't approve this request.")} />
      <div className="mt-4 flex gap-2">
        <Button variant="primary" size="md" className="h-9 flex-1" icon={<Check />} loading={busy === "approve"} disabled={!c.canApprove || !!busy} onClick={() => act("approve")}>
          Approve
        </Button>
        <Button size="md" className="h-9" icon={<X />} loading={busy === "cancel"} disabled={!!busy} onClick={() => act("cancel")}>
          Deny
        </Button>
      </div>
    </AuthFrame>
  );
}
