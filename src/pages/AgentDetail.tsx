import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Clock, Coins, Hash, Pencil, Play, Plus, Power, RotateCcw, Zap } from "lucide-react";
import { api } from "@/api/client";
import { isSkipped, useAction, useAgent, useAgentActions, useIssues, useRuns, useRuntimeState } from "@/api/hooks";
import type { Agent } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { cents, compact, duration, roleLabel, timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Avatar, Button, Chip, DL, Empty, ErrorBox, Field, Input, Meter, Modal, Panel, PanelHeader, Skeleton, StatusGlyph, Table, Tabs, Td, Textarea, Th, Tr, cx } from "@/components/ui";
import { AgentStatus, IssueStatusIcon, PriorityIcon, RunStatus, isActiveRun } from "@/components/status";
import { NewIssueModal } from "@/components/NewIssueModal";
import { useAdapterLabel } from "./Agents";

function EditAgentModal({ agent, cid, open, onClose }: { agent: Agent; cid: string; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(agent.title ?? "");
  const [capabilities, setCapabilities] = useState(agent.capabilities ?? "");
  const [budget, setBudget] = useState(String(agent.budgetMonthlyCents / 100));
  const save = useAction(
    () => api.patch<Agent>(`/agents/${agent.id}?companyId=${cid}`, { title: title.trim() || null, capabilities: capabilities.trim() || null, budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)) }),
    { cid, success: "Agent updated" },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${agent.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutateAsync(undefined).then(onClose).catch(() => {})}>
            Save changes
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Capabilities" hint="Managers read this when deciding who to delegate to.">
        <Textarea rows={3} value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />
      </Field>
      <Field label="Monthly budget · USD" hint="The agent is paused when it reaches this. 0 means no cap.">
        <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} className="mono" />
      </Field>
    </Modal>
  );
}

function WakeModal({ agent, cid, open, onClose }: { agent: Agent; cid: string; open: boolean; onClose: () => void }) {
  const { wake } = useAgentActions(cid);
  const [reason, setReason] = useState("");
  const [fresh, setFresh] = useState(false);
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Wake ${agent.name}`}
      description="Runs one heartbeat now: the agent checks its assignments and inbox, then works the highest-priority task."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Zap />}
            loading={wake.isPending}
            onClick={() =>
              wake.mutate(
                { id: agent.id, reason, forceFreshSession: fresh },
                {
                  onSuccess: (r) => {
                    setReason("");
                    onClose();
                    if (isSkipped(r)) toast(r.message ?? "Skipped", "error");
                    else navigate(`/${cid}/runs/${r.id}`);
                  },
                },
              )
            }
          >
            Start heartbeat
          </Button>
        </>
      }
    >
      <Field label="Instruction (optional)">
        <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Prioritise the auth security review today." />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-2">
        <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="accent-[var(--fg)]" />
        Start a fresh session (discard conversation memory)
      </label>
    </Modal>
  );
}

type Tab = "overview" | "runs" | "tasks" | "config";

export function AgentDetailPage() {
  const { id = "" } = useParams();
  const { id: cid } = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  const agentQ = useAgent(cid, id);
  const runtime = useRuntimeState(cid, id);
  const runs = useRuns(cid, id, 50);
  const issues = useIssues(cid, { assigneeAgentId: id });
  const agents = useAgentMap(cid);
  const label = useAdapterLabel(cid);
  const { pause, resume, terminate, clearError } = useAgentActions(cid);
  const [wakeOpen, setWakeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const agent = agents.get(id) ?? agentQ.data;
  useCrumbs([{ label: "Agents", to: `/${cid}/agents` }, { label: agent?.name ?? "…" }], `agent-${id}-${agent?.name}`);

  if (agentQ.isError && !agent) return <ErrorBox error={agentQ.error} onRetry={() => agentQ.refetch()} />;
  if (!agent)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-64" />
      </div>
    );

  const manager = agent.reportsTo ? agents.get(agent.reportsTo) : null;
  const reports = [...agents.values()].filter((a) => a.reportsTo === agent.id && a.status !== "terminated");
  const allIssues = issues.data ?? [];
  const open = allIssues.filter((i) => !["done", "cancelled"].includes(i.status));
  const dead = agent.status === "terminated";
  const runList = runs.data ?? [];
  const finished = runList.filter((r) => ["succeeded", "failed", "timed_out"].includes(r.status));
  const rate = finished.length ? Math.round((finished.filter((r) => r.status === "succeeded").length / finished.length) * 100) : null;
  const activeRun = runList.find((r) => isActiveRun(r.status));
  const config = Object.entries(agent.adapterConfig ?? {});
  const setTab = (t: Tab) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });

  const RunTable = ({ limit }: { limit?: number }) =>
    runList.length === 0 ? (
      <Empty title="No runs yet" body="Wake the agent to start its first heartbeat." />
    ) : (
      <Table>
        <thead>
          <tr>
            <Th>Run</Th>
            <Th>Status</Th>
            <Th className="max-sm:hidden">Trigger</Th>
            <Th align="right">Duration</Th>
            <Th align="right">Started</Th>
          </tr>
        </thead>
        <tbody>
          {runList.slice(0, limit).map((r) => (
            <Tr key={r.id} onClick={() => navigate(`/${cid}/runs/${r.id}`)}>
              <Td mono>{r.id.slice(0, 8)}</Td>
              <Td>
                <RunStatus status={r.status} />
              </Td>
              <Td className="text-fg-3 max-sm:hidden">{r.invocationSource.replace(/_/g, " ")}</Td>
              <Td mono align="right">
                {duration(r.startedAt, r.finishedAt)}
              </Td>
              <Td mono align="right">
                {timeAgo(r.createdAt)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    );

  const TaskList = ({ items }: { items: typeof allIssues }) =>
    items.length === 0 ? (
      <Empty title="Nothing assigned" body="Assign a task and the agent wakes up to work on it." action={<Button icon={<Plus />} onClick={() => setAssignOpen(true)}>Assign task</Button>} />
    ) : (
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id}>
            <Link to={`/${cid}/tasks/${i.id}`} className="flex h-9 items-center gap-2.5 px-3.5 text-sm hover:bg-hover">
              <PriorityIcon priority={i.priority} />
              <IssueStatusIcon status={i.status} />
              <span className="mono w-16 shrink-0 text-xs text-fg-4">{i.identifier}</span>
              <span className={cx("min-w-0 flex-1 truncate", ["done", "cancelled"].includes(i.status) && "text-fg-3")}>{i.title}</span>
              {i.activeRun && <StatusGlyph kind="live" />}
              <span className="mono text-xs text-fg-4">{timeAgo(i.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div>
      {/* identity */}
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Avatar name={agent.name} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-medium tracking-tight">{agent.name}</h1>
            <AgentStatus status={agent.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-fg-3">
            <span>{agent.title ?? roleLabel(agent.role)}</span>
            <span className="text-fg-4">·</span>
            <span className="mono text-xs">{label(agent.adapterType)}</span>
            {manager && (
              <>
                <span className="text-fg-4">·</span>
                <span>
                  reports to{" "}
                  <Link to={`/${cid}/agents/${manager.id}`} className="text-fg-2 hover:text-fg">
                    {manager.name}
                  </Link>
                </span>
              </>
            )}
          </div>
        </div>
        {!dead && (
          <div className="flex flex-wrap items-center gap-1.5">
            {agent.status === "paused" ? (
              <Button variant="primary" icon={<RotateCcw />} loading={resume.isPending} onClick={() => resume.mutate(agent.id)}>
                Resume
              </Button>
            ) : agent.status !== "pending_approval" ? (
              <>
                <Button variant="primary" icon={<Zap />} disabled={agent.status === "running" || agent.status === "error"} onClick={() => setWakeOpen(true)}>
                  Wake
                </Button>
                <Button loading={pause.isPending} onClick={() => pause.mutate(agent.id)}>
                  Pause
                </Button>
              </>
            ) : null}
            <Button icon={<Plus />} onClick={() => setAssignOpen(true)}>
              Assign
            </Button>
            <Button variant="ghost" icon={<Pencil />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              icon={<Power />}
              loading={terminate.isPending}
              onClick={() => confirm(`Terminate ${agent.name}? This stops it permanently.`) && terminate.mutate(agent.id)}
            >
              Terminate
            </Button>
          </div>
        )}
      </div>

      {agent.status === "error" && (
        <div className="mb-4 flex items-start gap-3 rounded-sm border border-fg bg-inv px-3.5 py-3 text-sm text-inv-fg">
          <span className="mt-1.5 size-2 shrink-0 rotate-45 bg-inv-fg" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Agent halted on error</div>
            <div className="mono mt-0.5 text-xs break-words opacity-80">{agent.errorReason ?? "See the latest run for details."}</div>
          </div>
          <button onClick={() => clearError.mutate(agent.id)} className="h-7 shrink-0 rounded-sm border border-inv-fg/40 px-2.5 text-sm hover:bg-inv-fg hover:text-inv">
            Clear and retry
          </button>
        </div>
      )}
      {agent.status === "pending_approval" && (
        <div className="mb-4 flex items-center gap-3 rounded-sm border border-line-2 px-3.5 py-2.5 text-sm">
          <StatusGlyph kind="queued" />
          <span className="flex-1 text-fg-2">This hire is waiting for an operator to approve it.</span>
          <Link to={`/${cid}/approvals`} className="text-fg underline underline-offset-4">
            Review
          </Link>
        </div>
      )}
      {activeRun && (
        <Link to={`/${cid}/runs/${activeRun.id}`} className="mb-4 flex items-center gap-3 rounded-sm border border-line-2 bg-raised px-3.5 py-2.5 text-sm hover:border-line-3">
          <StatusGlyph kind="live" />
          <span className="flex-1">
            Working on{" "}
            {activeRun.issueId && allIssues.find((x) => x.id === activeRun.issueId) ? (
              <span className="text-fg">
                <span className="mono text-xs text-fg-3">{allIssues.find((x) => x.id === activeRun.issueId)!.identifier}</span> {allIssues.find((x) => x.id === activeRun.issueId)!.title}
              </span>
            ) : (
              <span className="text-fg-3">its inbox</span>
            )}
          </span>
          <Chip icon={<Clock />}>{activeRun.status === "queued" ? "queued" : duration(activeRun.startedAt)}</Chip>
          <span className="flex items-center gap-1 text-fg-2">
            <Play className="size-3" /> Watch
          </span>
        </Link>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: "overview", label: "Overview" },
          { value: "runs", label: "Runs", count: runList.length },
          { value: "tasks", label: "Tasks", count: open.length },
          { value: "config", label: "Configuration" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            <Panel className="grid grid-cols-2 sm:grid-cols-4">
              {[
                ["Spend · month", cents(agent.spentMonthlyCents)],
                ["Success", rate === null ? "-" : `${rate}%`],
                ["Input tokens", runtime.data ? compact(runtime.data.totalInputTokens) : "-"],
                ["Output tokens", runtime.data ? compact(runtime.data.totalOutputTokens) : "-"],
              ].map(([k, v], i) => (
                <div key={k} className={cx("border-line px-4 py-3", i < 3 && "sm:border-r", i % 2 === 0 && "max-sm:border-r", i < 2 && "max-sm:border-b")}>
                  <div className="text-xs text-fg-3">{k}</div>
                  <div className="mono mt-1.5 text-lg font-medium tnum">{v}</div>
                </div>
              ))}
            </Panel>
            <Panel>
              <PanelHeader title="Open tasks" meta={String(open.length)} action={<Button size="xs" variant="ghost" icon={<Plus />} onClick={() => setAssignOpen(true)}>Assign</Button>} />
              {issues.isPending ? <Skeleton className="m-3.5 h-16" /> : <TaskList items={open.slice(0, 8)} />}
            </Panel>
            <Panel>
              <PanelHeader title="Recent runs" action={<Button size="xs" variant="ghost" onClick={() => setTab("runs")}>View all</Button>} />
              {runs.isPending ? <Skeleton className="m-3.5 h-24" /> : <RunTable limit={6} />}
            </Panel>
          </div>
          <div className="min-w-0 space-y-4">
            <Panel className="p-3.5">
              <div className="mb-2 flex items-baseline justify-between text-xs text-fg-3">
                <span>Budget</span>
                <span className="mono tnum">
                  {cents(agent.spentMonthlyCents)} / {agent.budgetMonthlyCents ? cents(agent.budgetMonthlyCents) : "∞"}
                </span>
              </div>
              <Meter value={agent.spentMonthlyCents} max={agent.budgetMonthlyCents} />
            </Panel>
            {agent.capabilities && (
              <Panel className="p-3.5">
                <div className="mb-1.5 text-xs text-fg-3">Capabilities</div>
                <p className="text-sm leading-relaxed text-fg-2">{agent.capabilities}</p>
              </Panel>
            )}
            <Panel className="px-3.5 pb-1">
              <DL
                items={[
                  ["Role", roleLabel(agent.role)],
                  ["Runtime", <span className="mono text-xs">{agent.adapterType}</span>],
                  ["Last heartbeat", <span className="mono text-xs">{timeAgo(agent.lastHeartbeatAt)}</span>],
                  ["Hired", <span className="mono text-xs">{timeAgo(agent.createdAt)}</span>],
                  ["Agent ID", <span className="mono text-xs" title={agent.id}>{agent.id.slice(0, 8)}</span>],
                ]}
              />
            </Panel>
            {reports.length > 0 && (
              <Panel>
                <PanelHeader title="Direct reports" meta={String(reports.length)} />
                <ul className="divide-y divide-line">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link to={`/${cid}/agents/${r.id}`} className="flex h-9 items-center gap-2.5 px-3.5 hover:bg-hover">
                        <Avatar name={r.name} size={18} />
                        <span className="flex-1 truncate text-sm">{r.name}</span>
                        <AgentStatus status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === "runs" && <Panel>{runs.isPending ? <Skeleton className="m-3.5 h-40" /> : <RunTable />}</Panel>}

      {tab === "tasks" && <Panel>{issues.isPending ? <Skeleton className="m-3.5 h-40" /> : <TaskList items={[...open, ...allIssues.filter((i) => !open.includes(i))]} />}</Panel>}

      {tab === "config" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Runtime" meta={agent.adapterType} />
            <div className="px-3.5 pb-1">
              <DL
                items={[
                  ["Adapter", label(agent.adapterType)],
                  ...config.map(([k, v]) => [<span className="mono text-xs">{k}</span>, <span className="mono text-xs" title={typeof v === "string" ? v : undefined}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>] as [React.ReactNode, React.ReactNode]),
                ]}
              />
              {config.length === 0 && <p className="py-3 text-sm text-fg-3">Using adapter defaults.</p>}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Usage to date" />
            <div className="px-3.5 pb-1">
              <DL
                items={[
                  ["Session", <span className="mono text-xs">{runtime.data?.sessionId ?? "-"}</span>],
                  ["Total cost", <Chip icon={<Coins />}>{cents(runtime.data?.totalCostCents)}</Chip>],
                  ["Input tokens", <Chip icon={<Hash />}>{compact(runtime.data?.totalInputTokens)}</Chip>],
                  ["Output tokens", <Chip icon={<Hash />}>{compact(runtime.data?.totalOutputTokens)}</Chip>],
                  ["Last run", runtime.data?.lastRunStatus ? <RunStatus status={runtime.data.lastRunStatus as never} /> : "-"],
                ]}
              />
            </div>
          </Panel>
        </div>
      )}

      <WakeModal agent={agent} cid={cid} open={wakeOpen} onClose={() => setWakeOpen(false)} />
      <EditAgentModal key={agent.updatedAt} agent={agent} cid={cid} open={editOpen} onClose={() => setEditOpen(false)} />
      <NewIssueModal open={assignOpen} onClose={() => setAssignOpen(false)} defaults={{ assigneeAgentId: agent.id }} />
    </div>
  );
}
