import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Clock, Pause, Play, Square, Zap } from "lucide-react";
import { api } from "@/api/client";
import { isSkipped, useAction, useAgentActions, useIssues, useLiveRuns, useRunEvents, useRuns } from "@/api/hooks";
import type { Agent, HeartbeatRun, Issue, LiveEvent } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useLive, useLiveEvents } from "@/lib/live";
import { useAgentMap } from "@/lib/useAgentMap";
import { clock, duration, timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Avatar, Button, Chip, Empty, IconButton, Panel, PanelHeader, Segmented, StatusGlyph, cx } from "@/components/ui";
import { AgentStatus, IssueStatusIcon, RunStatus, isActiveRun } from "@/components/status";
import { Transcript } from "@/components/Transcript";

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

interface Lane {
  agent: Agent;
  current?: HeartbeatRun;
  last?: HeartbeatRun;
  queue: Issue[];
  review: Issue[];
}

const laneRank = (l: Lane) => (l.current?.status === "running" ? 0 : l.current ? 1 : l.agent.status === "error" ? 2 : l.queue.length ? 3 : l.review.length ? 4 : l.agent.status === "paused" ? 6 : 5);

/** The latest meaningful line the agent printed, i.e. what it's doing right now. */
function CurrentStep({ cid, runId }: { cid: string; runId: string }) {
  const events = useRunEvents(cid, runId, true);
  const last = events.data?.filter((e) => e.stream !== "system").at(-1);
  return <span className="mono block truncate text-xs text-fg-2">{last?.message ?? "starting…"}</span>;
}

function TaskRef({ cid, issue, fallback }: { cid: string; issue?: Issue; fallback?: string }) {
  if (!issue) return <span className="text-sm text-fg-3">{fallback ?? "Checking inbox"}</span>;
  return (
    <Link to={`/${cid}/tasks/${issue.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-1.5 text-sm hover:underline">
      <IssueStatusIcon status={issue.status} />
      <span className="mono shrink-0 text-xs text-fg-3">{issue.identifier}</span>
      <span className="truncate">{issue.title}</span>
    </Link>
  );
}

function LaneRow({ lane, cid, issues, selected, onSelect }: { lane: Lane; cid: string; issues: Map<string, Issue>; selected: boolean; onSelect: () => void }) {
  const { agent, current, queue, review } = lane;
  const task = current?.issueId ? issues.get(current.issueId) : undefined;
  return (
    <button onClick={onSelect} className={cx("grid w-full grid-cols-[28px_1fr] gap-x-3 border-b border-line px-3.5 py-3 text-left transition-colors sm:grid-cols-[28px_150px_1fr]", selected ? "bg-active" : "hover:bg-hover")}>
      <Avatar name={agent.name} size={28} />
      <div className="min-w-0">
        <div className="truncate text-sm">{agent.name}</div>
        <div className="mt-0.5">
          <AgentStatus status={agent.status} />
        </div>
      </div>
      <div className="col-span-2 mt-2 min-w-0 sm:col-span-1 sm:mt-0">
        {current ? (
          <>
            <div className="flex items-center gap-2">
              <span className="mono w-9 shrink-0 text-2xs tracking-wider text-fg-4 uppercase">Now</span>
              <TaskRef cid={cid} issue={task} fallback={current.issueId ? "Loading task…" : "Working through inbox"} />
              <span className="ml-auto shrink-0">
                <Chip icon={<Clock />}>{current.status === "queued" ? "queued" : duration(current.startedAt)}</Chip>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-9 shrink-0" />
              <span className="min-w-0 flex-1">{current.status === "queued" ? <span className="mono text-xs text-fg-4">waiting for runtime…</span> : <CurrentStep cid={cid} runId={current.id} />}</span>
            </div>
          </>
        ) : agent.status === "error" ? (
          <div className="mono truncate text-xs text-fg">↳ {agent.errorReason ?? "Halted on error"}</div>
        ) : agent.status === "paused" ? (
          <div className="text-xs text-fg-3">Paused{queue.length ? ` with ${queue.length} task${queue.length > 1 ? "s" : ""} waiting` : ""}</div>
        ) : (
          <div className="text-xs text-fg-3">
            {lane.last ? `Last ran ${timeAgo(lane.last.finishedAt ?? lane.last.createdAt)}` : "No runs yet"}
          </div>
        )}
        {(queue.length > 0 || review.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
            <span className="mono w-9 shrink-0 text-2xs tracking-wider text-fg-4 uppercase">Next</span>
            {queue.length > 0 && (
              <span className="min-w-0 truncate">
                {queue[0]!.identifier} {queue[0]!.title}
                {queue.length > 1 && <span className="text-fg-4"> +{queue.length - 1}</span>}
              </span>
            )}
            {review.length > 0 && <span className="text-fg-2">· {review.length} awaiting your review</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function FocusPane({ lane, cid, issues }: { lane: Lane; cid: string; issues: Map<string, Issue> }) {
  const { agent, current, last, queue, review } = lane;
  const shown = current ?? last;
  const active = !!shown && isActiveRun(shown.status);
  const events = useRunEvents(cid, shown?.id ?? "", active);
  const task = shown?.issueId ? issues.get(shown.issueId) : undefined;
  const { wake, pause, resume } = useAgentActions(cid);
  const cancel = useAction(() => api.post(`/heartbeat-runs/${shown!.id}/cancel`), { cid, success: "Run stopped" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <Avatar name={agent.name} size={22} />
        <Link to={`/${cid}/agents/${agent.id}`} className="text-sm font-medium hover:underline">
          {agent.name}
        </Link>
        <AgentStatus status={agent.status} />
        <span className="ml-auto flex gap-1">
          {agent.status === "paused" ? (
            <Button size="xs" icon={<Play />} onClick={() => resume.mutate(agent.id)}>
              Resume
            </Button>
          ) : agent.status !== "terminated" && agent.status !== "pending_approval" ? (
            <>
              {!current && agent.status !== "error" && (
                <Button size="xs" variant="primary" icon={<Zap />} loading={wake.isPending} onClick={() => wake.mutate({ id: agent.id }, { onSuccess: (r) => isSkipped(r) && toast(r.message ?? "Skipped", "error") })}>
                  Wake
                </Button>
              )}
              <IconButton label="Pause" size="xs" onClick={() => pause.mutate(agent.id)}>
                <Pause />
              </IconButton>
            </>
          ) : null}
        </span>
      </div>

      {shown ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-raised px-3.5 py-2">
            <span className="mono text-2xs tracking-wider text-fg-4 uppercase">{active ? "Current run" : "Last run"}</span>
            <RunStatus status={shown.status} />
            <Chip icon={<Clock />}>{duration(shown.startedAt, shown.finishedAt)}</Chip>
            <span className="ml-auto flex gap-1">
              {active && (
                <Button size="xs" variant="ghost" icon={<Square />} onClick={() => cancel.mutate(undefined)}>
                  Stop
                </Button>
              )}
              <Link to={`/${cid}/runs/${shown.id}`}>
                <IconButton label="Open run" size="xs">
                  <ArrowUpRight />
                </IconButton>
              </Link>
            </span>
          </div>
          <div className="border-b border-line px-3.5 py-2">
            <TaskRef cid={cid} issue={task} fallback={shown.issueId ? "Task" : "No task: inbox and mentions"} />
          </div>
          <Transcript events={events.data ?? []} active={active} className="min-h-40 flex-1" />
        </>
      ) : (
        <Empty title="No runs yet" body={`Wake ${agent.name} or assign a task to see the transcript here.`} className="flex-1" />
      )}

      {(queue.length > 0 || review.length > 0) && (
        <div className="max-h-48 shrink-0 overflow-y-auto border-t border-line">
          {review.length > 0 && (
            <>
              <div className="mono px-3.5 pt-2.5 pb-1 text-2xs tracking-wider text-fg-4 uppercase">Waiting on you</div>
              {review.map((i) => (
                <Link key={i.id} to={`/${cid}/tasks/${i.id}`} className="flex h-8 items-center gap-2 px-3.5 text-sm hover:bg-hover">
                  <StatusGlyph kind="live" />
                  <span className="mono text-xs text-fg-3">{i.identifier}</span>
                  <span className="flex-1 truncate">{i.title}</span>
                  <span className="text-xs text-fg-3">Review →</span>
                </Link>
              ))}
            </>
          )}
          {queue.length > 0 && (
            <>
              <div className="mono px-3.5 pt-2.5 pb-1 text-2xs tracking-wider text-fg-4 uppercase">Up next · {queue.length}</div>
              {queue.map((i) => (
                <Link key={i.id} to={`/${cid}/tasks/${i.id}`} className="flex h-8 items-center gap-2 px-3.5 text-sm hover:bg-hover">
                  <IssueStatusIcon status={i.status} />
                  <span className="mono text-xs text-fg-3">{i.identifier}</span>
                  <span className="truncate">{i.title}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* Plain-language feed. Output chatter is hidden unless you ask for raw events. */
function Feed({ agents, runs, issues }: { agents: Map<string, Agent>; runs: Map<string, HeartbeatRun>; issues: Map<string, Issue> }) {
  const events = useLiveEvents();
  const [raw, setRaw] = useState<"story" | "raw">("story");
  const name = (id?: unknown) => (typeof id === "string" ? agents.get(id)?.name ?? "An agent" : "Someone");
  const taskOf = (runId?: unknown) => {
    const r = typeof runId === "string" ? runs.get(runId) : undefined;
    const i = r?.issueId ? issues.get(r.issueId) : undefined;
    return i ? `${i.identifier}` : null;
  };
  const sentence = (e: LiveEvent): string | null => {
    const p = e.payload as Record<string, unknown>;
    switch (e.type) {
      case "heartbeat.run.queued":
        return `${name(p.agentId)} was woken`;
      case "heartbeat.run.status": {
        const t = taskOf(p.runId);
        if (p.status === "running") return `${name(p.agentId)} started working${t ? ` on ${t}` : ""}`;
        if (p.status === "succeeded") return `${name(p.agentId)} finished${t ? ` ${t}` : " its run"}`;
        return `${name(p.agentId)}'s run ${String(p.status).replace(/_/g, " ")}${t ? ` (${t})` : ""}`;
      }
      case "agent.status":
        return p.status === "running" || p.status === "idle" ? null : `${name(p.agentId)} is now ${String(p.status).replace(/_/g, " ")}`;
      case "activity.logged": {
        const d = (p.details ?? {}) as Record<string, unknown>;
        const who = p.agentId ? name(p.agentId) : p.actorType === "user" ? "You" : "System";
        const named = [d.title, d.issueTitle, d.identifier].find((v): v is string => typeof v === "string");
        const title = named ? `“${named}”` : "a task";
        if (p.action === "issue.comment_added") return `${who} commented on ${title}`;
        if (p.action === "issue.created") return `${who} created ${title}`;
        if (p.action === "issue.updated" && typeof d.status === "string") return `${who} moved ${title} to ${d.status.replace(/_/g, " ")}`;
        return `${who} · ${String(p.action ?? "").replace(/[._]/g, " ")} ${title}`.trim();
      }
      default:
        return null;
    }
  };
  const rows = events.map((e) => ({ e, text: raw === "raw" ? `${e.type}  ${JSON.stringify(e.payload).slice(0, 140)}` : sentence(e) })).filter((r) => r.text);
  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <PanelHeader title="What's happening" meta={`${rows.length}`} action={<Segmented value={raw} onChange={setRaw} items={[{ value: "story", label: "Story" }, { value: "raw", label: "Raw" }]} />} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="dot-grid px-3.5 py-8 text-center text-xs text-fg-4">Listening. Updates appear the moment an agent starts, finishes, comments or changes a task.</div>
        ) : (
          <ol>
            {rows.map(({ e, text }, i) => (
              <li key={`${e.id}-${i}`} className={cx("flex gap-3 border-b border-line px-3.5 py-1.5 text-xs", i === 0 && "row-flash")}>
                <span className="mono shrink-0 text-fg-4 tnum">{clock(e.createdAt, true)}</span>
                <span className={cx("min-w-0 flex-1", raw === "raw" ? "mono truncate text-fg-3" : "text-fg-2")}>{text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

export function LivePage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Live" }], "live");
  useTick();
  const live = useLive();
  const agents = useAgentMap(cid);
  const { data: liveRuns = [] } = useLiveRuns(cid);
  const { data: recent = [] } = useRuns(cid, undefined, 100);
  const { data: allIssues = [] } = useIssues(cid);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"active" | "all">("active");

  const issues = useMemo(() => new Map(allIssues.map((i) => [i.id, i])), [allIssues]);
  const runs = useMemo(() => new Map([...recent, ...liveRuns].map((r) => [r.id, r])), [recent, liveRuns]);

  const lanes = useMemo<Lane[]>(() => {
    const out: Lane[] = [];
    for (const agent of agents.values()) {
      if (agent.status === "terminated") continue;
      const mine = [...runs.values()].filter((r) => r.agentId === agent.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const current = mine.find((r) => isActiveRun(r.status));
      const last = mine.find((r) => !isActiveRun(r.status));
      const assigned = allIssues.filter((i) => i.assigneeAgentId === agent.id);
      const queue = assigned.filter((i) => (i.status === "todo" || i.status === "in_progress") && i.id !== current?.issueId).sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.priority) - ["critical", "high", "medium", "low"].indexOf(b.priority));
      const review = assigned.filter((i) => i.status === "in_review");
      out.push({ agent, current, last, queue, review });
    }
    return out.sort((a, b) => laneRank(a) - laneRank(b));
  }, [agents, runs, allIssues]);

  const visible = filter === "all" ? lanes : lanes.filter((l) => l.current || l.queue.length || l.review.length || l.agent.status === "error");
  const selectedId = params.get("agent") ?? visible[0]?.agent.id ?? lanes[0]?.agent.id;
  const selected = lanes.find((l) => l.agent.id === selectedId);
  const working = lanes.filter((l) => l.current?.status === "running").length;
  const queued = lanes.filter((l) => l.current?.status === "queued").length;
  const waiting = lanes.reduce((n, l) => n + l.review.length, 0);

  return (
    <div className="flex flex-col lg:h-[calc(100vh-44px-48px)] lg:min-h-[560px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Live</h1>
          <p className="mt-1 text-sm text-fg-3">What every agent is doing right now, what's next, and what's waiting on you.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>
            <span className={cx("size-1.5 rounded-full", live.status === "live" ? "blink bg-fg" : "border border-fg-3")} />
            {live.status === "live" ? "streaming" : live.status}
          </Chip>
          <Chip>{working} working</Chip>
          {queued > 0 && <Chip>{queued} starting</Chip>}
          <Chip className={waiting ? "border-fg-3 text-fg" : undefined}>{waiting} to review</Chip>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_minmax(380px,44%)]">
        <div className="flex min-h-0 flex-col gap-4">
          <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PanelHeader title="Agents" meta={`${visible.length}/${lanes.length}`} action={<Segmented value={filter} onChange={setFilter} items={[{ value: "active", label: "Has work" }, { value: "all", label: "All" }]} />} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <Empty title="Everyone's idle" body="No agent is running or has work queued. Assign a task to get things moving." action={<Button size="xs" onClick={() => setFilter("all")}>Show all agents</Button>} />
              ) : (
                visible.map((l) => <LaneRow key={l.agent.id} lane={l} cid={cid} issues={issues} selected={l.agent.id === selectedId} onSelect={() => setParams({ agent: l.agent.id }, { replace: true })} />)
              )}
            </div>
          </Panel>
          <div className="h-64 shrink-0">
            <Feed agents={agents} runs={runs} issues={issues} />
          </div>
        </div>
        <Panel className="flex min-h-[420px] flex-col overflow-hidden">{selected ? <FocusPane key={selected.agent.id} lane={selected} cid={cid} issues={issues} /> : <Empty title="No agents yet" className="flex-1" />}</Panel>
      </div>
    </div>
  );
}
