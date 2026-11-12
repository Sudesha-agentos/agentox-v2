import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useRuns } from "@/api/hooks";
import type { RunStatus as RunStatusT } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { useIssueMap } from "@/lib/useIssueMap";
import { dateTime, duration, timeAgo } from "@/lib/format";
import { Avatar, Empty, ErrorBox, Input, PageHeader, Panel, Segmented, Select, SkeletonRows, Table, Td, Th, Toolbar, Tr } from "@/components/ui";
import { RunStatus } from "@/components/status";

const FILTERS: Array<{ key: string; label: string; match: (s: RunStatusT) => boolean }> = [
  { key: "all", label: "All", match: () => true },
  { key: "active", label: "Active", match: (s) => s === "queued" || s === "running" || s === "scheduled_retry" },
  { key: "failed", label: "Failed", match: (s) => ["failed", "timed_out", "interrupted"].includes(s) },
  { key: "succeeded", label: "Succeeded", match: (s) => s === "succeeded" },
];

export function RunsPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Runs" }], "runs");
  const runs = useRuns(cid, undefined, 200);
  const agents = useAgentMap(cid);
  const issues = useIssueMap(cid);
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [agent, setAgent] = useState("");
  const [q, setQ] = useState("");

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, (runs.data ?? []).filter((r) => f.match(r.status)).length])), [runs.data]);
  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const needle = q.trim().toLowerCase();
    return (runs.data ?? []).filter((r) => f.match(r.status) && (!agent || r.agentId === agent) && (!needle || r.id.startsWith(needle) || r.error?.toLowerCase().includes(needle) || (r.issueId ? `${issues.get(r.issueId)?.identifier ?? ""} ${issues.get(r.issueId)?.title ?? ""}`.toLowerCase().includes(needle) : false)));
  }, [runs.data, filter, agent, q, issues]);

  return (
    <div>
      <PageHeader index="03" title="Runs" description="Every heartbeat, with its full transcript. Failures surface first." />
      <Toolbar>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Run id, task or error" className="mono h-7 pl-8 text-xs" />
        </div>
        <Segmented value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f.key, label: <>{f.label} <span className="mono text-fg-4">{counts[f.key] ?? 0}</span></> }))} />
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-7 w-40 text-sm">
          <option value="">All agents</option>
          {[...agents.values()].map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Toolbar>
      <Panel className="overflow-hidden">
        {runs.isError ? (
          <div className="p-3.5">
            <ErrorBox error={runs.error} onRetry={() => runs.refetch()} />
          </div>
        ) : runs.isPending ? (
          <SkeletonRows rows={10} />
        ) : list.length === 0 ? (
          <Empty title={runs.data?.length ? "No runs match" : "No runs yet"} body={runs.data?.length ? undefined : "Wake an agent or assign it a task to start a run."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Run</Th>
                <Th>Agent</Th>
                <Th>Status</Th>
                <Th className="max-md:hidden">Task</Th>
                <Th className="max-xl:hidden">Trigger</Th>
                <Th align="right">Duration</Th>
                <Th align="right">Started</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const a = agents.get(r.agentId);
                return (
                  <Tr key={r.id} onClick={() => navigate(`/${cid}/runs/${r.id}`)}>
                    <Td mono>{r.id.slice(0, 8)}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar name={a?.name ?? "?"} size={18} />
                        <span className="truncate">{a?.name ?? "Unknown"}</span>
                      </span>
                    </Td>
                    <Td>
                      <RunStatus status={r.status} />
                    </Td>
                    <Td className="max-w-80 max-md:hidden">
                      {r.issueId && issues.get(r.issueId) ? (
                        <span className="flex min-w-0 items-center gap-1.5" title={issues.get(r.issueId)!.title}>
                          <span className="mono shrink-0 text-xs text-fg-3">{issues.get(r.issueId)!.identifier}</span>
                          <span className="truncate">{issues.get(r.issueId)!.title}</span>
                        </span>
                      ) : (
                        <span className="text-fg-4">inbox</span>
                      )}
                      {r.error && <div className="mono truncate text-2xs text-fg-3">↳ {r.error}</div>}
                    </Td>
                    <Td className="text-fg-3 max-xl:hidden">{r.invocationSource.replace(/_/g, " ")}</Td>
                    <Td mono align="right">
                      {duration(r.startedAt, r.finishedAt)}
                    </Td>
                    <Td mono align="right">
                      <span title={dateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
