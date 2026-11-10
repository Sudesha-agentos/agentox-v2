import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAdapters, useAgents, useAiConnections } from "@/api/hooks";
import type { AdapterDetail, Agent, EnvCheck, EnvTestResult } from "@/api/types";

export const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  xai: "xAI",
  google: "Google",
  github: "GitHub Models",
};
export const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

/** Guess which provider a failing check is asking for, so the fix can open the right form. */
export function providerFromText(text: string | null | undefined): string | null {
  const m = /(openrouter|anthropic|claude|openai|chatgpt|codex|gemini|google|xai|grok|github)/i.exec(text ?? "");
  if (!m) return null;
  const k = m[1]!.toLowerCase();
  return ({ claude: "anthropic", chatgpt: "openai", codex: "openai", gemini: "google", grok: "xai" } as Record<string, string>)[k] ?? k;
}

export type Verdict =
  | { kind: "ready"; label: string }
  | { kind: "warn"; label: string; check?: EnvCheck }
  | { kind: "blocked"; label: string; check?: EnvCheck; cause: "runtime" | "agent" | "disabled" }
  | { kind: "checking"; label: string }
  | { kind: "paused"; label: string };

export interface AgentRow {
  agent: Agent;
  adapter?: AdapterDetail;
  test?: EnvTestResult;
  verdict: Verdict;
}

export const envTestKey = (cid: string, type: string) => ["c", cid, "env-test", type] as const;

/**
 * Readiness of every agent: runtime available → environment check passes → agent itself healthy.
 * Environment checks run once per runtime in use and are cached for five minutes.
 */
export function useReadiness(cid: string) {
  const agents = useAgents(cid);
  const adapters = useAdapters(cid);
  const providers = useAiConnections(cid);
  const live = (agents.data ?? []).filter((a) => a.status !== "terminated");
  const types = [...new Set(live.map((a) => a.adapterType))].sort();
  const usable = new Set((adapters.data ?? []).filter((a) => !a.disabled && a.loaded !== false).map((a) => a.type));

  const tests = useQueries({
    queries: types.map((t) => ({
      queryKey: envTestKey(cid, t),
      queryFn: () => api.post<EnvTestResult>(`/companies/${cid}/adapters/${encodeURIComponent(t)}/test-environment`, { adapterConfig: {} }),
      enabled: adapters.isSuccess && usable.has(t),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  const rows = useMemo<AgentRow[]>(() => {
    const byType = new Map(types.map((t, i) => [t, tests[i]]));
    return live.map((agent) => {
      const adapter = adapters.data?.find((a) => a.type === agent.adapterType);
      const q = byType.get(agent.adapterType);
      const test = q?.data;
      let verdict: Verdict;
      if (!adapter || adapter.disabled || adapter.loaded === false) {
        verdict = { kind: "blocked", cause: "disabled", label: adapter?.disabled ? `${adapter.label} runtime is disabled on this server` : `Runtime ${agent.adapterType} isn't installed` };
      } else if (q?.isPending && q.fetchStatus !== "idle") {
        verdict = { kind: "checking", label: "Checking runtime…" };
      } else if (q?.isError) {
        verdict = { kind: "warn", label: "Couldn't run the environment check" };
      } else if (test?.status === "fail") {
        const check = test.checks.find((c) => c.level === "error");
        // Root cause first: a failing runtime is usually why the agent errored too.
        verdict = { kind: "blocked", cause: "runtime", label: `${check?.message ?? "Runtime check failed"}${agent.status === "error" ? " · agent halted" : ""}`, check };
      } else if (test?.status === "warn") {
        const check = test.checks.find((c) => c.level === "warn");
        verdict = { kind: "warn", label: check?.message ?? "Runtime has warnings", check };
      } else if (agent.status === "error") {
        // Runtime is fine now; the agent just needs its error cleared to retry.
        verdict = { kind: "blocked", cause: "agent", label: agent.errorReason ?? "Agent halted on its last run" };
      } else if (agent.status === "paused") {
        verdict = { kind: "paused", label: "Ready, but paused" };
      } else {
        verdict = { kind: "ready", label: "Ready to work" };
      }
      return { agent, adapter, test, verdict };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.map((a) => a.id + a.status + a.adapterType).join(), adapters.data, tests.map((t) => t.dataUpdatedAt + t.status + t.fetchStatus).join()]);

  return {
    rows,
    types,
    tests: new Map(types.map((t, i) => [t, tests[i]!])),
    adapters,
    providers,
    loading: agents.isPending || adapters.isPending,
    error: agents.error ?? adapters.error,
  };
}
