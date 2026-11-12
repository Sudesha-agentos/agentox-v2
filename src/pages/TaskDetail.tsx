import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Check, ChevronRight, Clock, CornerDownLeft, Play, RotateCcw, Square, Trash2, Zap } from "lucide-react";
import { api } from "@/api/client";
import { isSkipped, useAction, useAgentActions, useComments, useIssue, useIssueActivity, useIssueRuns, useProjects, useRun, useRunEvents, useUpdateIssue } from "@/api/hooks";
import { ISSUE_PRIORITIES, type ActivityEvent, type Agent, type HeartbeatRun, type Issue, type IssueComment, type IssuePriority, type IssueStatus } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { agentReadiness } from "@/lib/readiness";
import { useAgentMap } from "@/lib/useAgentMap";
import { clock, dateTime, duration, timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Avatar, Button, Chip, ErrorBox, Kbd, Panel, Select, Skeleton, StatusGlyph, cx, type Glyph } from "@/components/ui";
import { IssueStatusIcon, RunStatus, issueStatusMeta, isActiveRun, priorityMeta } from "@/components/status";
import { StatusMenu } from "@/components/StatusMenu";
import { Markdown } from "@/components/Markdown";
import { Transcript } from "@/components/Transcript";

/* ------------------------------------------------------- next step */

function Banner({ glyph, title, body, children, tone = "default" }: { glyph: Glyph; title: ReactNode; body?: ReactNode; children?: ReactNode; tone?: "default" | "alarm" }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border px-3.5 py-3", tone === "alarm" ? "border-fg bg-inv text-inv-fg" : "border-line-2 bg-raised")}>
      {tone === "alarm" ? <span className="size-2 shrink-0 rotate-45 bg-inv-fg" /> : <StatusGlyph kind={glyph} />}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {body && <div className={cx("mt-0.5 text-xs", tone === "alarm" ? "opacity-80" : "text-fg-3")}>{body}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-1.5">{children}</div>}
    </div>
  );
}

/** Embedded live run: the user watches the agent work without leaving the task. */
function LiveRunPanel({ cid, runId, agent }: { cid: string; runId: string; agent?: Agent }) {
  const run = useRun(cid, runId);
  const active = !!run.data && isActiveRun(run.data.status);
  const events = useRunEvents(cid, runId, active);
  const cancel = useAction(() => api.post(`/heartbeat-runs/${runId}/cancel`), { cid, success: "Run cancelled" });
  const last = events.data?.filter((e) => e.stream !== "system").at(-1)?.message;
  return (
    <Panel className="overflow-hidden border-line-3">
      <div className="sweep flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <StatusGlyph kind={run.data?.status === "queued" ? "queued" : "live"} />
        <span className="text-sm font-medium">{agent?.name ?? "Agent"} {run.data?.status === "queued" ? "is about to start" : "is working on this"}</span>
        <Chip icon={<Clock />}>{run.data?.status === "queued" ? "queued" : duration(run.data?.startedAt)}</Chip>
        <span className="ml-auto flex gap-1">
          <Button size="xs" variant="ghost" icon={<Square />} loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>
            Stop
          </Button>
          <Link to={`/${cid}/runs/${runId}`}>
            <Button size="xs" variant="ghost" icon={<ArrowUpRight />}>
              Full run
            </Button>
          </Link>
        </span>
      </div>
      {last && (
        <div className="flex items-center gap-2 border-b border-line bg-raised px-3.5 py-1.5 text-xs">
          <span className="mono text-2xs tracking-wider text-fg-4 uppercase">Now</span>
          <span className="mono truncate text-fg-2">{last}</span>
        </div>
      )}
      <Transcript events={events.data ?? []} active={active} className="h-56" empty={run.data?.status === "queued" ? "waiting for the runtime to start…" : undefined} />
    </Panel>
  );
}

function NextStep({ issue, cid, agent, activeRun, onReview }: { issue: Issue; cid: string; agent?: Agent; activeRun?: HeartbeatRun | Issue["activeRun"]; onReview: () => void }) {
  const update = useUpdateIssue(cid);
  const { wake, resume, clearError } = useAgentActions(cid);
  const navigate = useNavigate();
  const startNow = () => agent && wake.mutate({ id: agent.id, reason: `Work on ${issue.identifier ?? issue.title}` }, { onSuccess: (r) => isSkipped(r) && toast(r.message ?? "Agent is busy; it will pick this up next", "error") });

  if (activeRun && isActiveRun(activeRun.status)) return <LiveRunPanel cid={cid} runId={activeRun.id} agent={agent} />;

  switch (issue.status) {
    case "done":
      return (
        <Banner glyph="ok" title="Done" body={`Closed ${timeAgo(issue.updatedAt)}${agent ? ` · worked by ${agent.name}` : ""}`}>
          <Button size="xs" icon={<RotateCcw />} onClick={() => update.mutate({ id: issue.id, patch: { status: "todo" } })}>
            Reopen
          </Button>
        </Banner>
      );
    case "cancelled":
      return (
        <Banner glyph="off" title="Cancelled">
          <Button size="xs" onClick={() => update.mutate({ id: issue.id, patch: { status: "backlog" } })}>
            Restore
          </Button>
        </Banner>
      );
    case "in_review":
      return (
        <Banner glyph="live" title={`${agent?.name ?? "The agent"} finished. Your review is needed`} body="Read the update below, then accept the work or send it back with notes.">
          <Button size="xs" variant="primary" icon={<Check />} onClick={() => update.mutate({ id: issue.id, patch: { status: "done" } })}>
            Accept &amp; close
          </Button>
          <Button size="xs" icon={<CornerDownLeft />} onClick={onReview}>
            Request changes
          </Button>
        </Banner>
      );
    case "blocked":
      return (
        <Banner glyph="paused" title="Blocked" body="Read the latest comment for what's needed, then unblock to hand it back to the agent.">
          <Button size="xs" onClick={() => update.mutate({ id: issue.id, patch: { status: "todo" } })}>
            Unblock
          </Button>
        </Banner>
      );
  }

  if (!agent) {
    return <Banner glyph="idle" title="Nobody is assigned" body="Pick an agent in the sidebar. It wakes up and starts right away." />;
  }
  const r = agentReadiness(agent);
  if (r.kind === "blocked") {
    return (
      <Banner glyph="error" tone="alarm" title={`${agent.name} can't work on this`} body={r.detail ?? r.label}>
        {r.fix === "clear-error" && (
          <button className="h-6 rounded-sm border border-inv-fg/40 px-2 text-xs hover:bg-inv-fg hover:text-inv" onClick={() => clearError.mutate(agent.id)}>
            Clear error &amp; retry
          </button>
        )}
        <button className="h-6 rounded-sm border border-inv-fg/40 px-2 text-xs hover:bg-inv-fg hover:text-inv" onClick={() => navigate(`/${cid}/agents/${agent.id}`)}>
          Open agent
        </button>
      </Banner>
    );
  }
  if (r.kind === "waiting") {
    return (
      <Banner glyph={r.fix === "resume" ? "paused" : "queued"} title={`Waiting on ${agent.name}`} body={r.label}>
        {r.fix === "resume" && (
          <Button size="xs" variant="primary" icon={<Play />} loading={resume.isPending} onClick={() => resume.mutate(agent.id)}>
            Resume {agent.name}
          </Button>
        )}
        {r.fix === "approve" && (
          <Link to={`/${cid}/approvals`}>
            <Button size="xs">Review hire</Button>
          </Link>
        )}
      </Banner>
    );
  }
  if (r.kind === "busy") {
    return <Banner glyph="queued" title={`Queued for ${agent.name}`} body="They're finishing another run and will pick this up next." />;
  }
  return (
    <Banner glyph="idle" title={`Assigned to ${agent.name}`} body="They'll pick it up on their next heartbeat. Start now if you don't want to wait.">
      <Button size="xs" variant="primary" icon={<Zap />} loading={wake.isPending} onClick={startNow}>
        Start now
      </Button>
    </Banner>
  );
}

/* --------------------------------------------------------- timeline */

type Item =
  | { kind: "created"; at: string }
  | { kind: "comment"; at: string; c: IssueComment }
  | { kind: "activity"; at: string; a: ActivityEvent }
  | { kind: "run"; at: string; r: HeartbeatRun };

function RunItem({ r, cid, agent }: { r: HeartbeatRun; cid: string; agent?: Agent }) {
  const [open, setOpen] = useState(false);
  const active = isActiveRun(r.status);
  const events = useRunEvents(cid, open ? r.id : "", false);
  return (
    <div className="min-w-0 flex-1">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-2 text-left text-sm">
        <ChevronRight className={cx("size-3 text-fg-4 transition-transform", open && "rotate-90")} />
        <span className="text-fg">{agent?.name ?? "Agent"}</span>
        <span className="text-fg-3">{active ? "is running a heartbeat" : "ran a heartbeat"}</span>
        <RunStatus status={r.status} />
        {!active && <Chip icon={<Clock />}>{duration(r.startedAt, r.finishedAt)}</Chip>}
        <Link to={`/${cid}/runs/${r.id}`} onClick={(e) => e.stopPropagation()} className="mono text-2xs text-fg-4 hover:text-fg">
          {r.id.slice(0, 8)}
        </Link>
      </button>
      {r.error && <div className="mono mt-1 ml-5 text-xs text-fg-2">↳ {r.error}</div>}
      {open && (
        <Panel className="mt-2 overflow-hidden">
          <Transcript events={events.data ?? []} active={false} className="max-h-64" empty={events.isPending ? "loading…" : undefined} />
        </Panel>
      )}
    </div>
  );
}

function activityText(a: ActivityEvent, agents: Map<string, Agent>): string | null {
  const d = (a.details ?? {}) as Record<string, unknown>;
  if (a.action === "issue.updated") {
    const parts: string[] = [];
    if (typeof d.status === "string") parts.push(`moved this to ${issueStatusMeta[d.status as IssueStatus]?.label.toLowerCase() ?? d.status}`);
    if ("assigneeAgentId" in d) parts.push(d.assigneeAgentId ? `assigned ${agents.get(String(d.assigneeAgentId))?.name ?? "an agent"}` : "unassigned this");
    if (typeof d.priority === "string") parts.push(`set priority to ${priorityMeta[d.priority as IssuePriority]?.label.toLowerCase() ?? d.priority}`);
    if (typeof d.title === "string" && Object.keys(d).length === 1) return null;
    return parts.length ? parts.join(", ") : null;
  }
  return null; // comments, runs and creation have their own rows
}

function Timeline({ issue, cid, agents, comments, runs, activity }: { issue: Issue; cid: string; agents: Map<string, Agent>; comments: IssueComment[]; runs: HeartbeatRun[]; activity: ActivityEvent[] }) {
  const items = useMemo<Item[]>(() => {
    const list: Item[] = [{ kind: "created", at: issue.createdAt }];
    comments.forEach((c) => list.push({ kind: "comment", at: c.createdAt, c }));
    runs.forEach((r) => list.push({ kind: "run", at: r.startedAt ?? r.createdAt, r }));
    activity.filter((a) => activityText(a, agents)).forEach((a) => list.push({ kind: "activity", at: a.createdAt, a }));
    return list.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [issue.createdAt, comments, runs, activity, agents]);

  const created = activity.find((a) => a.action === "issue.created");
  const initialAssignee = (created?.details as { assigneeAgentId?: string } | null)?.assigneeAgentId;

  return (
    <ol className="relative">
      <span className="absolute top-2 bottom-2 left-[10px] w-px bg-line-2" aria-hidden />
      {items.map((it, i) => {
        const when = (
          <span className="mono shrink-0 text-2xs text-fg-4" title={dateTime(it.at)}>
            {clock(it.at)}
          </span>
        );
        if (it.kind === "comment") {
          const agent = it.c.authorAgentId ? agents.get(it.c.authorAgentId) : undefined;
          const name = agent?.name ?? (it.c.authorType === "user" ? "You" : "Operator");
          return (
            <li key={`c${it.c.id}`} className="relative flex gap-3 pb-5">
              <Avatar name={name} size={21} human={!agent} className="relative z-10" />
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-fg-3">commented</span>
                  <span className="ml-auto">{when}</span>
                </div>
                <div className="rounded-sm border border-line bg-panel px-3 py-2.5 text-sm text-fg-2">
                  <Markdown text={it.c.body} />
                </div>
              </div>
            </li>
          );
        }
        if (it.kind === "run") {
          return (
            <li key={`r${it.r.id}`} className="relative flex gap-3 pb-5">
              <span className="relative z-10 flex size-[21px] shrink-0 items-center justify-center rounded-xs border border-line-3 bg-canvas">
                <StatusGlyph kind={isActiveRun(it.r.status) ? "live" : it.r.status === "succeeded" ? "ok" : it.r.status === "failed" || it.r.status === "timed_out" ? "error" : "off"} />
              </span>
              <RunItem r={it.r} cid={cid} agent={agents.get(it.r.agentId)} />
              {when}
            </li>
          );
        }
        const src = it.kind === "activity" ? it.a : created;
        const actor = src ? (src.agentId ? agents.get(src.agentId)?.name : src.actorType === "user" ? "You" : "System") : "Someone";
        const text =
          it.kind === "created"
            ? `created this task${initialAssignee ? ` and assigned ${agents.get(initialAssignee)?.name ?? "an agent"}` : ""}`
            : activityText(it.a, agents);
        return (
          <li key={it.kind === "activity" ? `a${it.a.id}` : `k${i}`} className="relative flex items-center gap-3 pb-5 text-sm">
            <span className="relative z-10 flex size-[21px] shrink-0 items-center justify-center">
              <span className="size-1.5 rounded-full bg-fg-4 ring-4 ring-canvas" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-fg-2">{actor ?? "Someone"}</span> <span className="text-fg-3">{text}</span>
            </span>
            {when}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------- page */

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2 border-b border-line py-2 last:border-b-0">
      <span className="text-xs text-fg-3">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskDetailPage() {
  const { id = "" } = useParams();
  const { id: cid } = useCompany();
  const navigate = useNavigate();
  const issue = useIssue(cid, id);
  const comments = useComments(cid, id);
  const runs = useIssueRuns(cid, id);
  const activity = useIssueActivity(cid, id);
  const agents = useAgentMap(cid);
  const { data: projects = [] } = useProjects(cid);
  const update = useUpdateIssue(cid);
  const { wake } = useAgentActions(cid);
  const [draft, setDraft] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [editing, setEditing] = useState<null | "title" | "description">(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useCrumbs([{ label: "Tasks", to: `/${cid}/tasks` }, { label: <span className="mono">{issue.data?.identifier ?? "…"}</span> }], `task-${id}-${issue.data?.identifier}`);

  const addComment = useAction((body: string) => api.post<IssueComment>(`/issues/${id}/comments`, { body, clientRequestId: crypto.randomUUID() }), {
    invalidate: () => [["c", cid, "issue", id], ["c", cid, "activity"]],
  });
  const remove = useAction(() => api.del(`/issues/${id}`), { cid, success: "Task deleted" });

  useEffect(() => {
    if (reviewMode) composerRef.current?.focus();
  }, [reviewMode]);

  if (issue.isError) return <ErrorBox error={issue.error} onRetry={() => issue.refetch()} />;
  if (issue.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  const i = issue.data;
  const assignee = i.assigneeAgentId ? agents.get(i.assigneeAgentId) : undefined;
  const runList = runs.data ?? [];
  const activeRun = i.activeRun && isActiveRun(i.activeRun.status) ? i.activeRun : runList.find((r) => isActiveRun(r.status));
  const readiness = assignee ? agentReadiness(assignee) : null;

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync(body);
      setDraft("");
      if (reviewMode && assignee) {
        // Send it back: reopen and hand to the agent with the notes.
        await update.mutateAsync({ id, patch: { status: "todo" } });
        wake.mutate({ id: assignee.id, reason: `Changes requested on ${i.identifier}: ${body.slice(0, 200)}` });
        toast(`Sent back to ${assignee.name}`);
        setReviewMode(false);
      }
    } catch {
      // toast already shown
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_288px]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="mono text-xs text-fg-4">{i.identifier}</span>
          <span className="flex items-center gap-1.5 text-xs text-fg-3">
            <IssueStatusIcon status={i.status} /> {issueStatusMeta[i.status].label}
          </span>
        </div>
        {editing === "title" ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim() && titleDraft !== i.title) update.mutate({ id, patch: { title: titleDraft.trim() } });
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(null);
            }}
            className="-mx-1.5 w-full rounded-sm border border-line-3 bg-canvas px-1.5 py-0.5 text-xl font-medium tracking-tight outline-none"
          />
        ) : (
          <h1
            onClick={() => {
              setTitleDraft(i.title);
              setEditing("title");
            }}
            className="-mx-1.5 cursor-text rounded-sm px-1.5 py-0.5 text-xl font-medium tracking-tight hover:bg-hover"
            title="Click to edit"
          >
            {i.title}
          </h1>
        )}

        <section className="mt-3">
          {editing === "description" ? (
            <div className="space-y-2">
              <textarea autoFocus rows={7} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} className="w-full rounded-sm border border-line-3 bg-canvas px-2.5 py-2 text-sm leading-relaxed outline-none" />
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => {
                    update.mutate({ id, patch: { description: descDraft } });
                    setEditing(null);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                setDescDraft(i.description ?? "");
                setEditing("description");
              }}
              className="-mx-2 cursor-text rounded-sm px-2 py-1.5 text-md text-fg-2 hover:bg-hover"
              title="Click to edit"
            >
              {i.description ? <Markdown text={i.description} /> : <span className="text-fg-4">Add context or acceptance criteria…</span>}
            </div>
          )}
        </section>

        <section className="mt-5">
          <NextStep issue={i} cid={cid} agent={assignee} activeRun={activeRun} onReview={() => setReviewMode(true)} />
        </section>

        <section className="mt-8">
          <div className="mono mb-4 text-2xs tracking-wider text-fg-4 uppercase">Timeline</div>
          {comments.isPending || runs.isPending ? (
            <Skeleton className="h-24" />
          ) : (
            <Timeline issue={i} cid={cid} agents={agents} comments={comments.data ?? []} runs={runList} activity={activity.data ?? []} />
          )}

          <div className={cx("rounded-sm border bg-panel", reviewMode ? "border-fg-3" : "border-line-2 focus-within:border-line-3")}>
            {reviewMode && (
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
                <CornerDownLeft className="size-3 text-fg-3" />
                <span className="flex-1 text-fg-2">Requesting changes. {assignee?.name ?? "The agent"} gets your notes and starts again.</span>
                <button className="text-fg-3 hover:text-fg" onClick={() => setReviewMode(false)}>
                  Cancel
                </button>
              </div>
            )}
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              rows={3}
              placeholder={reviewMode ? "What should change?" : assignee ? `Message ${assignee.name}…` : "Leave a comment…"}
              className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-fg-4"
            />
            <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
              <span className="flex items-center gap-1 text-2xs text-fg-4">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd>
              </span>
              <Button variant="primary" size="xs" loading={addComment.isPending} disabled={!draft.trim()} onClick={submit}>
                {reviewMode ? "Send back" : "Comment"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <Panel className="px-3.5 py-1">
          <Prop label="Status">
            <StatusMenu value={i.status} onChange={(status) => update.mutate({ id, patch: { status } })} />
          </Prop>
          <Prop label="Assignee">
            <Select value={i.assigneeAgentId ?? ""} onChange={(e) => update.mutate({ id, patch: { assigneeAgentId: e.target.value || null } })} className="h-7 text-sm">
              <option value="">Unassigned</option>
              {[...agents.values()]
                .filter((a) => a.status !== "terminated" || a.id === i.assigneeAgentId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Prop>
          {assignee && readiness && (
            <div className="-mt-px border-b border-line py-2 pl-[92px] text-2xs text-fg-3">
              <Link to={`/${cid}/agents/${assignee.id}`} className="hover:text-fg">
                {activeRun && activeRun.agentId === assignee.id ? "Working on this now" : readiness.label}
              </Link>
            </div>
          )}
          <Prop label="Priority">
            <Select value={i.priority} onChange={(e) => update.mutate({ id, patch: { priority: e.target.value as IssuePriority } })} className="h-7 text-sm">
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityMeta[p].label}
                </option>
              ))}
            </Select>
          </Prop>
          {projects.length > 0 && (
            <Prop label="Project">
              <Select value={i.projectId ?? ""} onChange={(e) => update.mutate({ id, patch: { projectId: e.target.value || null } })} className="h-7 text-sm">
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Prop>
          )}
          <Prop label="Runs">
            <span className="mono text-xs text-fg-2">
              {runList.length} · {runList.filter((r) => r.status === "succeeded").length} ok
            </span>
          </Prop>
          <Prop label="Created">
            <span className="mono text-xs text-fg-2">{dateTime(i.createdAt)}</span>
          </Prop>
          <Prop label="Updated">
            <span className="mono text-xs text-fg-2">{timeAgo(i.updatedAt)}</span>
          </Prop>
        </Panel>

        <Button
          variant="ghost"
          size="xs"
          className="w-full"
          icon={<Trash2 />}
          onClick={async () => {
            if (!confirm(`Delete ${i.identifier ?? "this task"}? This can't be undone.`)) return;
            await remove.mutateAsync(undefined).then(() => navigate(`/${cid}/tasks`)).catch(() => {});
          }}
        >
          Delete task
        </Button>
      </aside>
    </div>
  );
}
