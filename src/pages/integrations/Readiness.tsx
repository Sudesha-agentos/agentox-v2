import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAgentActions, useApiKeys, useMcpConnections, useSecrets, useToolConnections } from "@/api/hooks";
import { Avatar, Button, ErrorBox, Panel, SkeletonRows, Spinner, Status, StatusGlyph, cx, type Glyph } from "@/components/ui";
import { AddProviderModal } from "./Models";
import { providerFromText, providerLabel, useReadiness, type AgentRow, type Verdict } from "./model";

const verdictGlyph: Record<Verdict["kind"], Glyph> = { ready: "ok", warn: "paused", blocked: "error", checking: "queued", paused: "paused" };

function Fix({ row, cid, onProvider, onTab, broken }: { row: AgentRow; cid: string; onProvider: (p: string) => void; onTab: (t: string) => void; broken: Set<string> }) {
  const { clearError, resume } = useAgentActions(cid);
  const v = row.verdict;
  if (v.kind === "ready" || v.kind === "checking") return null;
  if (v.kind === "paused")
    return (
      <Button size="xs" onClick={() => resume.mutate(row.agent.id)}>
        Resume
      </Button>
    );
  if (v.kind === "blocked" && v.cause === "agent")
    return (
      <span className="flex gap-1">
        <Button size="xs" onClick={() => clearError.mutate(row.agent.id)}>
          Clear &amp; retry
        </Button>
        <Link to={`/${cid}/agents/${row.agent.id}`}>
          <Button size="xs" variant="ghost">
            Open
          </Button>
        </Link>
      </span>
    );
  const provider = "check" in v ? providerFromText(`${v.check?.hint ?? ""} ${v.check?.message ?? ""}`) : null;
  if (provider)
    return (
      <Button size="xs" variant={v.kind === "blocked" ? "primary" : "secondary"} onClick={() => onProvider(provider)}>
        {broken.has(provider) ? "Replace" : "Add"} {providerLabel(provider)} key
      </Button>
    );
  return (
    <Button size="xs" variant="ghost" onClick={() => onTab("runtimes")}>
      Details
    </Button>
  );
}

function Tile({ label, value, foot, glyph, onClick }: { label: string; value: ReactNode; foot: ReactNode; glyph?: Glyph; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col bg-panel px-4 py-3.5 text-left transition-colors hover:bg-hover">
      <span className="flex items-center justify-between text-xs text-fg-3">
        {label}
        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="mono mt-2 flex items-center gap-2 text-xl font-medium tnum">
        {value}
        {glyph && <StatusGlyph kind={glyph} />}
      </span>
      <span className="mt-1.5 text-xs text-fg-3">{foot}</span>
    </button>
  );
}

export function ReadinessOverview({ cid, onTab }: { cid: string; onTab: (t: string) => void }) {
  const r = useReadiness(cid);
  const qc = useQueryClient();
  const apps = useToolConnections(cid);
  const secrets = useSecrets(cid);
  const apiKeys = useApiKeys();
  const mcp = useMcpConnections();
  const [provider, setProvider] = useState<string | null>(null);
  const replacing = provider ? (r.providers.data?.connections ?? []).find((c) => c.provider === provider && c.status !== "connected" && c.method === "api_key") : undefined;

  const rows = [...r.rows].sort((a, b) => ["blocked", "warn", "checking", "paused", "ready"].indexOf(a.verdict.kind) - ["blocked", "warn", "checking", "paused", "ready"].indexOf(b.verdict.kind));
  const canRun = r.rows.filter((x) => x.verdict.kind === "ready" || x.verdict.kind === "warn" || x.verdict.kind === "paused").length;
  const blocked = r.rows.filter((x) => x.verdict.kind === "blocked").length;
  const checking = r.rows.some((x) => x.verdict.kind === "checking");
  const conns = r.providers.data?.connections ?? [];
  const brokenProviders = conns.filter((c) => c.status !== "connected").length;
  const unhealthyApps = (apps.data ?? []).filter((a) => a.requiresReauthorization || (a.healthStatus && a.healthStatus !== "healthy")).length;

  return (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="mono text-2xs tracking-wider text-fg-4 uppercase">Readiness</div>
            <div className="mt-1 text-lg font-medium tracking-tight">
              {r.loading ? (
                "Checking your setup…"
              ) : r.rows.length === 0 ? (
                "No agents yet"
              ) : blocked === 0 ? (
                <>All {r.rows.length} agents can run</>
              ) : (
                <>
                  {canRun} of {r.rows.length} agents can run <span className="text-fg-3">· {blocked} need{blocked === 1 ? "s" : ""} a fix</span>
                </>
              )}
            </div>
          </div>
          {r.rows.length > 0 && (
            <div className="flex h-2 w-48 gap-px overflow-hidden" aria-hidden>
              {rows.map((x) => (
                <span key={x.agent.id} className={cx("flex-1", x.verdict.kind === "blocked" ? "bg-fg" : x.verdict.kind === "checking" ? "bg-line-3" : x.verdict.kind === "ready" ? "bg-fg-3" : "hatch bg-fg-4")} />
              ))}
            </div>
          )}
          <Button size="xs" variant="ghost" icon={checking ? <Spinner /> : <RefreshCw />} disabled={checking} onClick={() => qc.invalidateQueries({ queryKey: ["c", cid, "env-test"] })}>
            Re-check all
          </Button>
        </div>
        {r.error ? (
          <div className="p-3.5">
            <ErrorBox error={r.error} />
          </div>
        ) : r.loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.agent.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5", row.verdict.kind === "blocked" && "bg-raised")}>
                <Avatar name={row.agent.name} size={22} />
                <Link to={`/${cid}/agents/${row.agent.id}`} className="w-28 truncate text-sm hover:underline">
                  {row.agent.name}
                </Link>
                <span className="mono w-28 truncate text-2xs text-fg-4 max-sm:hidden">{row.adapter?.label ?? row.agent.adapterType}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {row.verdict.kind === "blocked" ? <Status kind="error">Blocked</Status> : <StatusGlyph kind={verdictGlyph[row.verdict.kind]} />}
                  <span className={cx("truncate text-sm", row.verdict.kind === "blocked" ? "text-fg" : "text-fg-2")}>{row.verdict.label}</span>
                </span>
                <Fix row={row} cid={cid} onProvider={setProvider} onTab={onTab} broken={new Set(conns.filter((c) => c.status !== "connected" && c.method === "api_key").map((c) => c.provider))} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Model providers"
          value={conns.length}
          glyph={brokenProviders ? "error" : conns.length ? "ok" : "idle"}
          foot={brokenProviders ? `${brokenProviders} need${brokenProviders === 1 ? "s" : ""} attention` : conns.length ? "All connected" : "None connected"}
          onClick={() => onTab("runtimes")}
        />
        <Tile label="Apps" value={apps.data?.length ?? "-"} glyph={unhealthyApps ? "paused" : undefined} foot={unhealthyApps ? `${unhealthyApps} degraded` : "GitHub, Slack, Linear…"} onClick={() => onTab("apps")} />
        <Tile label="Secrets" value={secrets.data?.length ?? "-"} foot="Encrypted, write-only" onClick={() => onTab("secrets")} />
        <Tile label="Developer access" value={(apiKeys.data?.length ?? 0) + (mcp.data?.length ?? 0)} foot={`${apiKeys.data?.length ?? 0} API keys · ${mcp.data?.length ?? 0} MCP clients`} onClick={() => onTab("developer")} />
      </div>

      {provider && <AddProviderModal key={provider} cid={cid} open onClose={() => setProvider(null)} provider={provider} replacing={replacing} />}
    </div>
  );
}
