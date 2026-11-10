import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clock, Copy, Hash, Square } from "lucide-react";
import { api } from "@/api/client";
import { useAction, useIssue, useRun, useRunEvents } from "@/api/hooks";
import type { HeartbeatRunEvent } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { dateTime, duration, titleCase } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Avatar, Button, Chip, DL, ErrorBox, IconButton, Panel, PanelHeader, Skeleton } from "@/components/ui";
import { IssueStatusIcon, RunStatus, isActiveRun, issueStatusMeta } from "@/components/status";
import { Transcript } from "@/components/Transcript";

function LinkedIssue({ cid, id }: { cid: string; id: string }) {
  const { data } = useIssue(cid, id);
  return (
    <Link to={`/${cid}/tasks/${id}`} className="truncate underline decoration-line-3 underline-offset-4 hover:decoration-fg">
      {data ? `${data.identifier ?? ""} ${data.title}` : "View task"}
    </Link>
  );
}

/** Which task this run was for, and where that task stands now. */
function TaskCard({ cid, id }: { cid: string; id: string }) {
  const { data } = useIssue(cid, id);
  if (!data) return <Skeleton className="mb-4 h-14" />;
  return (
    <Link to={`/${cid}/tasks/${id}`} className="mb-4 flex items-center gap-3 rounded-sm border border-line-2 bg-panel px-3.5 py-2.5 hover:border-line-3">
      <span className="mono text-2xs tracking-wider text-fg-4 uppercase">Task</span>
      <IssueStatusIcon status={data.status} />
      <span className="mono text-xs text-fg-3">{data.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{data.title}</span>
      <span className="text-xs text-fg-3 max-sm:hidden">now {issueStatusMeta[data.status].label.toLowerCase()}</span>
      <ArrowUpRight className="size-3.5 text-fg-4" />
    </Link>
  );
}

export function RunDetailPage() {
  const { id = "" } = useParams();
  const { id: cid } = useCompany();
  const run = useRun(cid, id);
  const active = !!run.data && isActiveRun(run.data.status);
  const events = useRunEvents(cid, id, active);
  const agents = useAgentMap(cid);
  useCrumbs([{ label: "Runs", to: `/${cid}/runs` }, { label: <span className="mono">{id.slice(0, 8)}</span> }], `run-${id}`);

  // Older runs may only have a raw log file and no structured events.
  const hasEvents = (events.data?.length ?? 0) > 0;
  const rawLog = useQuery({
    queryKey: ["c", cid, "run", id, "log"],
    queryFn: () => api.get<{ content: string }>(`/heartbeat-runs/${id}/log?offset=0&limitBytes=256000`),
    enabled: events.isSuccess && !hasEvents && !active,
    retry: false,
  });
  const cancel = useAction(() => api.post(`/heartbeat-runs/${id}/cancel`), { cid, success: "Run cancelled" });

  if (run.isError) return <ErrorBox error={run.error} onRetry={() => run.refetch()} />;
  if (run.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  const r = run.data;
  const agent = agents.get(r.agentId);
  const usage = (r.usageJson ?? {}) as Record<string, unknown>;
  const fallback: HeartbeatRunEvent[] = (rawLog.data?.content ?? r.stdoutExcerpt ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line, i) => ({ id: i, runId: r.id, seq: i, eventType: "log", stream: "stdout", level: null, message: line, createdAt: r.startedAt ?? r.createdAt }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Avatar name={agent?.name ?? "?"} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-medium tracking-tight">
              {agent ? (
                <Link to={`/${cid}/agents/${agent.id}`} className="hover:underline">
                  {agent.name}
                </Link>
              ) : (
                "Agent"
              )}
              <span className="text-fg-3"> · heartbeat</span>
            </h1>
            <RunStatus status={r.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip icon={<Clock />}>{duration(r.startedAt, r.finishedAt)}</Chip>
            <Chip icon={<Hash />}>{hasEvents ? events.data!.length : fallback.length} lines</Chip>
            {typeof usage.inputTokens === "number" && <Chip>{(usage.inputTokens as number).toLocaleString()} in</Chip>}
            {typeof usage.outputTokens === "number" && <Chip>{(usage.outputTokens as number).toLocaleString()} out</Chip>}
            <span className="mono flex items-center gap-1 text-xs text-fg-4">
              {r.id}
              <IconButton label="Copy run id" size="xs" onClick={() => navigator.clipboard?.writeText(r.id).then(() => toast("Run id copied"))}>
                <Copy />
              </IconButton>
            </span>
          </div>
        </div>
        {active && (
          <Button variant="danger" icon={<Square />} loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
            Cancel run
          </Button>
        )}
      </div>

      {r.issueId ? (
        <TaskCard cid={cid} id={r.issueId} />
      ) : (
        <div className="mb-4 rounded-sm border border-dashed border-line-2 px-3.5 py-2.5 text-sm text-fg-3">No task attached. The agent checked its inbox and mentions.</div>
      )}
      {r.error && (
        <div className="mb-4 flex items-start gap-3 rounded-sm bg-inv px-3.5 py-2.5 text-inv-fg">
          <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-inv-fg" />
          <span className="mono text-xs break-words">{r.error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel className="flex min-w-0 flex-col overflow-hidden">
          <PanelHeader title="Transcript" meta={active ? "streaming" : undefined} />
          <Transcript events={hasEvents ? events.data! : fallback} active={active} className="h-[62vh] min-h-80" empty={events.isPending ? "loading…" : undefined} />
        </Panel>
        <div className="space-y-4">
          <Panel className="px-3.5 pb-1">
            <DL
              items={[
                ["Trigger", `${titleCase(r.invocationSource)}${r.triggerDetail ? ` · ${r.triggerDetail}` : ""}`],
                ["Task", r.issueId ? <LinkedIssue cid={cid} id={r.issueId} /> : <span className="text-fg-4">-</span>],
                ["Queued", <span className="mono text-xs">{dateTime(r.createdAt)}</span>],
                ["Started", <span className="mono text-xs">{dateTime(r.startedAt)}</span>],
                ["Finished", <span className="mono text-xs">{dateTime(r.finishedAt)}</span>],
                r.exitCode !== null && ["Exit code", <span className="mono text-xs">{r.exitCode}</span>],
                ...Object.entries(usage)
                  .filter(([, v]) => typeof v === "number")
                  .slice(0, 6)
                  .map(([k, v]) => [titleCase(k), <span className="mono text-xs">{(v as number).toLocaleString()}</span>] as [string, React.ReactNode]),
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
