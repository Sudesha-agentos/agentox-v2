import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, Network, Pause, Play, Plus, Search, Zap } from "lucide-react";
import { isSkipped, useAdapters, useAgentActions, useAgents, useIssues, useLiveRuns } from "@/api/hooks";
import { OrgChart } from "@/components/OrgChart";
import { useIssueMap } from "@/lib/useIssueMap";
import type { Agent } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { cents, roleLabel, timeAgo, titleCase } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Avatar, Button, Empty, ErrorBox, IconButton, Input, Meter, PageHeader, Panel, Segmented, SkeletonRows, Table, Tag, Td, Th, Toolbar, Tr, cx } from "@/components/ui";
import { AgentStatus } from "@/components/status";
import { HireAgentModal } from "@/components/HireAgentModal";

export function useAdapterLabel(cid: string) {
  const { data = [] } = useAdapters(cid);
  return (type: string) => data.find((a) => a.type === type)?.label ?? type;
}

export function AgentActions({ agent, cid, size = "xs" }: { agent: Agent; cid: string; size?: "xs" | "sm" }) {
  const { wake, pause, resume } = useAgentActions(cid);
  if (agent.status === "terminated" || agent.status === "pending_approval") return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (agent.status === "paused") {
    return (
      <span onClick={stop}>
        <Button size={size} icon={<Play />} loading={resume.isPending && resume.variables === agent.id} onClick={() => resume.mutate(agent.id)}>
          Resume
        </Button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={stop}>
      <Button
        size={size}
        icon={<Zap />}
        disabled={agent.status === "running" || agent.status === "error"}
        loading={wake.isPending && wake.variables?.id === agent.id}
        onClick={() => wake.mutate({ id: agent.id }, { onSuccess: (r) => isSkipped(r) && toast(r.message ?? "Skipped: the agent is busy", "error") })}
      >
        Wake
      </Button>
      <IconButton label="Pause" size="xs" onClick={() => pause.mutate(agent.id)} disabled={pause.isPending && pause.variables === agent.id}>
        <Pause />
      </IconButton>
    </span>
  );
}

type Filter = "all" | "running" | "idle" | "paused" | "error";
const matches = (a: Agent, f: Filter) =>
  f === "all" ? a.status !== "terminated" : f === "idle" ? a.status === "idle" || a.status === "active" : a.status === f;

export function AgentsPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Agents" }], "agents");
  const navigate = useNavigate();
  const agents = useAgents(cid);
  const { data: openIssues = [] } = useIssues(cid, { status: "todo,in_progress,in_review,blocked" });
  const label = useAdapterLabel(cid);
  const { data: liveRuns = [] } = useLiveRuns(cid);
  const issueMap = useIssueMap(cid);
  const [hireOpen, setHireOpen] = useState(false);
  const [view, setView] = useState<"table" | "org">("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const all = agents.data ?? [];
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of openIssues) if (i.assigneeAgentId) m.set(i.assigneeAgentId, (m.get(i.assigneeAgentId) ?? 0) + 1);
    return m;
  }, [openIssues]);
  // Everyone under each manager, not just direct reports (shown on collapsed teams).
  const totalReports = useMemo(() => {
    const m = new Map<string, number>();
    const count = (id: string): number => all.filter((a) => a.reportsTo === id).reduce((n, a) => n + 1 + count(a.id), 0);
    for (const a of all) m.set(a.id, count(a.id));
    return m;
  }, [all]);
  const counts = useMemo(() => Object.fromEntries((["all", "running", "idle", "paused", "error"] as Filter[]).map((f) => [f, all.filter((a) => matches(a, f)).length])), [all]);
  const needle = q.trim().toLowerCase();
  const visible = all.filter((a) => matches(a, filter) && (!needle || a.name.toLowerCase().includes(needle) || a.title?.toLowerCase().includes(needle) || a.role.includes(needle)));

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Your AI workforce. Each agent runs on a runtime, reports to a manager and spends against a budget."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setHireOpen(true)}>
            Hire agent
          </Button>
        }
      />
      <Toolbar>
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter agents" className="h-7 pl-8 text-sm" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          items={(["all", "running", "idle", "paused", "error"] as Filter[]).map((f) => ({ value: f, label: <>{titleCase(f)} <span className="mono text-fg-4">{counts[f]}</span></> }))}
        />
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={setView}
            items={[
              { value: "table", label: "Table", icon: <List /> },
              { value: "org", label: "Org", icon: <Network /> },
            ]}
          />
        </div>
      </Toolbar>

      <Panel className="overflow-hidden">
        {agents.isError ? (
          <div className="p-3.5">
            <ErrorBox error={agents.error} onRetry={() => agents.refetch()} />
          </div>
        ) : agents.isPending ? (
          <SkeletonRows rows={6} />
        ) : all.length === 0 ? (
          <Empty
            title="No agents yet"
            body="Start with a CEO. It plans the work and proposes the rest of the team for your approval."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setHireOpen(true)}>
                Hire first agent
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <Empty title="No agents match" />
        ) : view === "org" ? (
          <OrgChart agents={visible} cid={cid} openTasks={openCount} liveRuns={liveRuns} issues={issueMap} totalReports={totalReports} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th>Status</Th>
                <Th className="max-md:hidden">Runtime</Th>
                <Th className="max-lg:hidden">Reports to</Th>
                <Th align="right">Open</Th>
                <Th className="w-44 max-md:hidden">Spend · month</Th>
                <Th align="right" className="max-sm:hidden">
                  Heartbeat
                </Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const mgr = a.reportsTo ? byId.get(a.reportsTo) : null;
                return (
                  <Tr key={a.id} onClick={() => navigate(`/${cid}/agents/${a.id}`)} className={cx(a.status === "terminated" && "opacity-50")}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={a.name} size={24} />
                        <span className="min-w-0">
                          <span className="block truncate">{a.name}</span>
                          <span className="block truncate text-xs text-fg-3">{a.title ?? roleLabel(a.role)}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <AgentStatus status={a.status} />
                    </Td>
                    <Td className="max-md:hidden">
                      <Tag className="mono">{label(a.adapterType)}</Tag>
                    </Td>
                    <Td className="text-fg-2 max-lg:hidden">{mgr?.name ?? <span className="text-fg-4">-</span>}</Td>
                    <Td mono align="right">
                      {openCount.get(a.id) ?? 0}
                    </Td>
                    <Td className="max-md:hidden">
                      <div className="mono mb-1 flex justify-between text-2xs text-fg-3 tnum">
                        <span>{cents(a.spentMonthlyCents)}</span>
                        <span className="text-fg-4">{a.budgetMonthlyCents ? cents(a.budgetMonthlyCents) : "∞"}</span>
                      </div>
                      <Meter value={a.spentMonthlyCents} max={a.budgetMonthlyCents} />
                    </Td>
                    <Td mono align="right" className="max-sm:hidden">
                      {timeAgo(a.lastHeartbeatAt)}
                    </Td>
                    <Td align="right">
                      <AgentActions agent={a} cid={cid} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <HireAgentModal open={hireOpen} onClose={() => setHireOpen(false)} />
    </div>
  );
}
