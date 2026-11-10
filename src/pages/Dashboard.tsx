import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Clock } from "lucide-react";
import { useActivity, useApprovals, useDashboard, useIssues, useLiveRuns, useRuns } from "@/api/hooks";
import type { ActivityEvent, Agent } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { useIssueMap } from "@/lib/useIssueMap";
import { cents, clock, duration, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Chip, Empty, ErrorBox, Meter, Panel, PanelHeader, Skeleton, StatusGlyph, Table, Td, Th, Tr, cx } from "@/components/ui";
import { RunStatus, approvalTypeLabel } from "@/components/status";

function Metric({ label, value, foot, to }: { label: string; value: React.ReactNode; foot?: React.ReactNode; to?: string }) {
  const body = (
    <>
      <div className="text-xs text-fg-3">{label}</div>
      <div className="mono mt-2 text-2xl leading-none font-medium tracking-tight tnum">{value}</div>
      <div className="mt-2 min-h-4 text-xs text-fg-3">{foot}</div>
    </>
  );
  const cls = "block min-w-0 border-line px-4 py-3.5 [&:not(:last-child)]:border-r max-md:[&:nth-child(2n)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b";
  return to ? (
    <Link to={to} className={cx(cls, "transition-colors hover:bg-hover")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function RunChart({ data }: { data: Array<{ date: string; succeeded: number; failed: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.succeeded + d.failed));
  const ok = data.reduce((s, d) => s + d.succeeded, 0);
  const bad = data.reduce((s, d) => s + d.failed, 0);
  return (
    <Panel>
      <PanelHeader
        title="Runs"
        meta="14d"
        action={
          <div className="flex items-center gap-3 text-xs text-fg-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-xs bg-fg-4" /> succeeded <span className="mono text-fg-2">{ok}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="hatch size-2 rounded-xs bg-fg" /> failed <span className="mono text-fg-2">{bad}</span>
            </span>
          </div>
        }
      />
      <div className="relative px-3.5 pt-4">
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute inset-x-3.5 border-t border-dashed border-line" style={{ top: `calc(1rem + ${(1 - f) * 160}px)` }} />
        ))}
        <div className="relative flex h-40 items-end gap-[3px]">
          {data.map((d) => {
            const total = d.succeeded + d.failed;
            return (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="mono pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-xs border border-line-2 bg-raised px-2 py-1 text-2xs whitespace-nowrap text-fg-2 group-hover:block">
                  {d.date.slice(5)} · {d.succeeded} ok · {d.failed} fail
                </div>
                <div className="flex flex-col" style={{ height: `${(total / max) * 100}%`, minHeight: total ? 2 : 0 }}>
                  {d.failed > 0 && <div className="hatch bg-fg" style={{ flex: d.failed }} />}
                  <div className="bg-fg-4 transition-colors group-hover:bg-fg-3" style={{ flex: d.succeeded }} />
                </div>
                {total === 0 && <div className="h-px bg-line-3" />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mono flex justify-between px-3.5 pt-2 pb-3 text-2xs text-fg-4">
        <span>{data[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>
    </Panel>
  );
}

function describe(e: ActivityEvent): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  const title = [d.title, d.issueTitle, d.identifier, d.name].find((v): v is string => typeof v === "string") ?? "";
  const [entity, verb = ""] = e.action.split(".");
  if (e.action === "issue.updated" && typeof d.status === "string") return `moved ${title ? `“${title}”` : "a task"} → ${titleCase(d.status).toLowerCase()}`;
  if (e.action === "issue.comment_added") return `commented on ${title ? `“${title}”` : "a task"}`;
  if (e.action === "issue.created") return `opened ${title ? `“${title}”` : "a task"}`;
  if (e.action === "agent.error") return "hit an error";
  if (entity === "approval") return `${verb === "created" ? "requested" : verb} ${(approvalTypeLabel[String(d.type)] ?? "approval").toLowerCase()}`;
  if (entity === "agent") return `${verb.replace(/_/g, " ")} ${title}`.trim();
  return `${verb.replace(/_/g, " ")} ${entity} ${title}`.trim();
}

function ActivityFeed({ cid, agents }: { cid: string; agents: Map<string, Agent> }) {
  const { data, isPending } = useActivity(cid, 25);
  return (
    <Panel>
      <PanelHeader title="Activity" />
      {isPending ? (
        <div className="space-y-2 p-3.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4" />)}</div>
      ) : !data?.length ? (
        <Empty title="Nothing yet" body="Agent and operator actions stream in here." />
      ) : (
        <ol className="py-1">
          {data.slice(0, 14).map((e) => {
            const agent = e.agentId ? agents.get(e.agentId) : e.actorType === "agent" ? agents.get(e.actorId) : undefined;
            const who = agent?.name ?? (e.actorType === "user" ? "you" : e.actorType);
            const link = e.entityType === "issue" ? `/${cid}/tasks/${e.entityId}` : e.entityType === "agent" ? `/${cid}/agents/${e.entityId}` : e.entityType === "approval" ? `/${cid}/approvals` : null;
            const row = (
              <div className="flex items-baseline gap-3 px-3.5 py-1.5 text-sm">
                <span className="mono w-12 shrink-0 text-2xs text-fg-4 tnum">{clock(e.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-fg">{who}</span> <span className="text-fg-3">{describe(e)}</span>
                </span>
              </div>
            );
            return <li key={e.id}>{link ? <Link to={link} className="block hover:bg-hover">{row}</Link> : row}</li>;
          })}
        </ol>
      )}
    </Panel>
  );
}

export function DashboardPage() {
  const company = useCompany();
  const cid = company.id;
  useCrumbs([{ label: "Overview" }], "overview");
  const navigate = useNavigate();
  const dash = useDashboard(cid);
  const agents = useAgentMap(cid);
  const issues = useIssueMap(cid);
  const { data: liveRuns = [] } = useLiveRuns(cid);
  const { data: recent = [] } = useRuns(cid, undefined, 100);
  const { data: blocked = [] } = useIssues(cid, { status: "blocked" });
  const { data: pending = [] } = useApprovals(cid, "pending");
  const errored = [...agents.values()].filter((a) => a.status === "error");
  const d = dash.data;

  const last24 = recent.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 86_400_000);
  const finished24 = last24.filter((r) => ["succeeded", "failed", "timed_out"].includes(r.status));
  const rate = finished24.length ? Math.round((finished24.filter((r) => r.status === "succeeded").length / finished24.length) * 100) : null;

  const attention = [
    ...errored.map((a) => ({ key: a.id, to: `/${cid}/agents/${a.id}`, glyph: "error" as const, title: `${a.name} errored`, meta: a.errorReason ?? "" })),
    ...pending.map((a) => ({ key: a.id, to: `/${cid}/approvals`, glyph: "live" as const, title: `${approvalTypeLabel[a.type] ?? a.type} request awaiting decision`, meta: timeAgo(a.createdAt) })),
    ...blocked.map((i) => ({ key: i.id, to: `/${cid}/tasks/${i.id}`, glyph: "paused" as const, title: i.title, meta: `${i.identifier ?? ""} · blocked` })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Overview</h1>
          <p className="mt-1 max-w-2xl truncate text-sm text-fg-3">{company.description ?? "Your agent workforce at a glance."}</p>
        </div>
      </div>
      {dash.isError && <ErrorBox error={dash.error} onRetry={() => dash.refetch()} />}

      <Panel className="grid grid-cols-2 md:grid-cols-5">
        {d ? (
          <>
            <Metric to={`/${cid}/agents`} label="Agents online" value={d.agents.active} foot={<>{d.agents.running} running · {d.agents.paused} paused{d.agents.error ? ` · ${d.agents.error} error` : ""}</>} />
            <Metric to={`/${cid}/runs`} label="Runs · 24h" value={last24.length} foot={`${liveRuns.length} in flight`} />
            <Metric to={`/${cid}/runs`} label="Success · 24h" value={rate === null ? "-" : `${rate}%`} foot={`${finished24.length} finished`} />
            <Metric
              to={`/${cid}/spend`}
              label="Spend · month"
              value={cents(d.costs.monthSpendCents)}
              foot={d.costs.monthBudgetCents ? <Meter value={d.costs.monthSpendCents} max={d.costs.monthBudgetCents} className="mt-1.5" /> : "no budget cap"}
            />
            <Metric to={`/${cid}/approvals`} label="Awaiting decision" value={d.pendingApprovals} foot={d.pendingApprovals ? "needs you" : "clear"} />
          </>
        ) : (
          [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="border-line px-4 py-3.5 [&:not(:last-child)]:border-r">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-16" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {d ? <RunChart data={d.runActivity.slice(-14)} /> : <Skeleton className="h-64" />}

          <Panel>
            <PanelHeader
              title="Recent runs"
              action={
                <Link to={`/${cid}/runs`} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
                  All runs <ArrowUpRight className="size-3" />
                </Link>
              }
            />
            {recent.length === 0 ? (
              <Empty title="No runs yet" body="Wake an agent or assign it a task." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Agent</Th>
                    <Th>Status</Th>
                    <Th className="max-sm:hidden">Task</Th>
                    <Th align="right">Duration</Th>
                    <Th align="right">Started</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.slice(0, 8).map((r) => {
                    const a = agents.get(r.agentId);
                    return (
                      <Tr key={r.id} onClick={() => navigate(`/${cid}/runs/${r.id}`)}>
                        <Td>
                          <span className="flex items-center gap-2">
                            <Avatar name={a?.name ?? "?"} size={18} />
                            {a?.name ?? "Unknown"}
                          </span>
                        </Td>
                        <Td>
                          <RunStatus status={r.status} />
                        </Td>
                        <Td className="max-w-64 truncate max-sm:hidden">{r.issueId && issues.get(r.issueId) ? <><span className="mono text-xs text-fg-3">{issues.get(r.issueId)!.identifier}</span> {issues.get(r.issueId)!.title}</> : <span className="text-fg-4">inbox</span>}</Td>
                        <Td mono align="right">
                          {duration(r.startedAt, r.finishedAt)}
                        </Td>
                        <Td mono align="right">
                          {timeAgo(r.createdAt)}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  Live {liveRuns.length > 0 && <StatusGlyph kind="live" />}
                </span>
              }
              meta={String(liveRuns.length)}
              action={
                <Link to={`/${cid}/live`} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
                  Open <ArrowUpRight className="size-3" />
                </Link>
              }
            />
            {liveRuns.length === 0 ? (
              <div className="dot-grid px-3.5 py-6 text-center text-sm text-fg-3">No agents running.</div>
            ) : (
              <ul className="divide-y divide-line">
                {liveRuns.map((r) => {
                  const a = agents.get(r.agentId);
                  return (
                    <li key={r.id}>
                      <Link to={`/${cid}/runs/${r.id}`} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-hover">
                        <Avatar name={a?.name ?? "?"} size={20} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{a?.name ?? "Agent"}</span>
                          <span className="block truncate text-xs text-fg-3">{r.issueId && issues.get(r.issueId) ? `${issues.get(r.issueId)!.identifier} ${issues.get(r.issueId)!.title}` : "inbox"}</span>
                        </span>
                        <Chip icon={<Clock />}>{r.status === "queued" ? "queued" : duration(r.startedAt)}</Chip>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Needs attention" meta={String(attention.length)} />
            {attention.length === 0 ? (
              <div className="dot-grid px-3.5 py-6 text-center text-sm text-fg-3">All clear.</div>
            ) : (
              <ul className="divide-y divide-line">
                {attention.slice(0, 7).map((it) => (
                  <li key={it.key}>
                    <Link to={it.to} className="flex items-start gap-2.5 px-3.5 py-2.5 hover:bg-hover">
                      <span className="mt-1.5">
                        <StatusGlyph kind={it.glyph} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{it.title}</span>
                        {it.meta && <span className="block truncate text-xs text-fg-3">{it.meta}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <ActivityFeed cid={cid} agents={agents} />
        </div>
      </div>
    </div>
  );
}
