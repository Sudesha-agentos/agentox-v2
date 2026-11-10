import type { Agent } from "@/api/types";

export type Readiness = {
  /** ready: starts now · busy: queued behind current run · waiting: needs an operator · blocked: can't run */
  kind: "ready" | "busy" | "waiting" | "blocked";
  label: string;
  detail?: string;
  fix?: "resume" | "clear-error" | "approve" | "reassign";
};

/** What happens if work is handed to this agent right now. */
export function agentReadiness(a: Agent): Readiness {
  switch (a.status) {
    case "idle":
    case "active":
      return { kind: "ready", label: "Starts immediately" };
    case "running":
      return { kind: "busy", label: "Busy · picks this up after the current run" };
    case "paused":
      return { kind: "waiting", label: "Paused · won't start until resumed", detail: a.pauseReason ?? undefined, fix: "resume" };
    case "error":
      return { kind: "blocked", label: "Can't run · agent is in an error state", detail: a.errorReason ?? undefined, fix: "clear-error" };
    case "pending_approval":
      return { kind: "waiting", label: "Not hired yet · waiting for approval", fix: "approve" };
    case "terminated":
      return { kind: "blocked", label: "Terminated · reassign this task", fix: "reassign" };
  }
}
