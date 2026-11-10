import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Columns3, List, Plus, Search, X } from "lucide-react";
import { useIssues, useProjects, useUpdateIssue } from "@/api/hooks";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, type Issue, type IssueStatus } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { duration, timeAgo } from "@/lib/format";
import { Avatar, Button, Empty, ErrorBox, IconButton, Input, PageHeader, Panel, Segmented, Select, SkeletonRows, StatusGlyph, Toolbar, cx } from "@/components/ui";
import { IssueStatusIcon, PriorityIcon, isActiveRun, issueStatusMeta, priorityMeta } from "@/components/status";
import { NewIssueModal } from "@/components/NewIssueModal";
import { StatusMenu } from "@/components/StatusMenu";

const VIEW_KEY = "agentox.tasks.view";
const BOARD_COLUMNS: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
const prioRank = (p: string) => ISSUE_PRIORITIES.indexOf(p as never);

function readView(): "list" | "board" {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

function IssueRow({ issue, cid }: { issue: Issue; cid: string }) {
  const agents = useAgentMap(cid);
  const update = useUpdateIssue(cid);
  const a = issue.assigneeAgentId ? agents.get(issue.assigneeAgentId) : null;
  return (
    <div className="group flex h-9 items-center gap-3 border-b border-line px-3.5 last:border-b-0 hover:bg-hover">
      <PriorityIcon priority={issue.priority} />
      <span className="mono hidden w-16 shrink-0 text-xs text-fg-4 sm:block">{issue.identifier}</span>
      <StatusMenu value={issue.status} onChange={(status) => update.mutate({ id: issue.id, patch: { status } })} compact />
      <Link to={`/${cid}/tasks/${issue.id}`} className="min-w-0 flex-1 truncate text-sm">
        {issue.title}
      </Link>
      {issue.activeRun && isActiveRun(issue.activeRun.status) ? (
        <span className="flex items-center gap-1.5 text-xs text-fg-2">
          <StatusGlyph kind="live" />
          <span className="max-sm:hidden">
            {a?.name ?? "agent"} working · <span className="mono">{duration(issue.activeRun.startedAt)}</span>
          </span>
        </span>
      ) : issue.status === "in_review" ? (
        <span className="rounded-xs border border-line-3 px-1.5 text-2xs text-fg max-sm:hidden">needs review</span>
      ) : a && (a.status === "paused" || a.status === "error") && !["done", "cancelled"].includes(issue.status) ? (
        <span className="text-2xs text-fg-3 max-sm:hidden">{a.name} {a.status === "paused" ? "paused" : "errored"}</span>
      ) : null}
      <span className="mono hidden shrink-0 text-xs text-fg-4 md:block">{timeAgo(issue.updatedAt)}</span>
      {a ? <Avatar name={a.name} size={18} /> : <span className="size-[18px] shrink-0 rounded-xs border border-dashed border-line-3" title="Unassigned" />}
    </div>
  );
}

function ListView({ issues, cid }: { issues: Issue[]; cid: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true, cancelled: true });
  const groups = ISSUE_STATUSES.map((s) => ({ status: s, items: issues.filter((i) => i.status === s).sort((a, b) => prioRank(a.priority) - prioRank(b.priority)) })).filter((g) => g.items.length);
  return (
    <Panel className="overflow-hidden">
      {groups.map((g) => (
        <div key={g.status}>
          <button onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !c[g.status] }))} className="flex h-8 w-full items-center gap-2 border-b border-line bg-raised px-3.5 text-left text-xs">
            <ChevronRight className={cx("size-3 text-fg-4 transition-transform", !collapsed[g.status] && "rotate-90")} />
            <IssueStatusIcon status={g.status} />
            <span className="text-fg-2">{issueStatusMeta[g.status].label}</span>
            <span className="mono text-fg-4">{g.items.length}</span>
          </button>
          {!collapsed[g.status] && g.items.map((i) => <IssueRow key={i.id} issue={i} cid={cid} />)}
        </div>
      ))}
    </Panel>
  );
}

function BoardView({ issues, cid, onAdd }: { issues: Issue[]; cid: string; onAdd: (s: IssueStatus) => void }) {
  const agents = useAgentMap(cid);
  const update = useUpdateIssue(cid);
  const [over, setOver] = useState<IssueStatus | null>(null);
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-2">
        {BOARD_COLUMNS.map((status) => {
          const items = issues.filter((i) => i.status === status).sort((a, b) => prioRank(a.priority) - prioRank(b.priority));
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/issue");
                const issue = issues.find((i) => i.id === id);
                if (issue && issue.status !== status) update.mutate({ id, patch: { status } });
              }}
              className={cx("flex w-[272px] flex-col rounded-md border transition-colors", over === status ? "border-fg-3 bg-hover" : "border-line bg-panel")}
            >
              <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-xs">
                <IssueStatusIcon status={status} />
                <span className="text-fg-2">{issueStatusMeta[status].label}</span>
                <span className="mono text-fg-4">{items.length}</span>
                <IconButton label={`Add to ${issueStatusMeta[status].label}`} size="xs" className="ml-auto" onClick={() => onAdd(status)}>
                  <Plus />
                </IconButton>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-1.5 p-1.5">
                {items.map((i) => {
                  const a = i.assigneeAgentId ? agents.get(i.assigneeAgentId) : null;
                  return (
                    <Link
                      key={i.id}
                      to={`/${cid}/tasks/${i.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/issue", i.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="block cursor-grab rounded-sm border border-line-2 bg-canvas p-2.5 transition-colors hover:border-line-3 active:cursor-grabbing"
                    >
                      <div className="mono mb-1.5 flex items-center gap-1.5 text-2xs text-fg-4">
                        {i.identifier}
                        {i.activeRun && (
                          <span className="ml-auto flex items-center gap-1 font-sans text-fg-2">
                            <StatusGlyph kind="live" /> working
                          </span>
                        )}
                      </div>
                      <div className="line-clamp-3 text-sm leading-snug">{i.title}</div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <PriorityIcon priority={i.priority} />
                        <span className="mono text-2xs text-fg-4">{timeAgo(i.updatedAt)}</span>
                        <span className="ml-auto">{a && <Avatar name={a.name} size={18} />}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TasksPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Tasks" }], "tasks");
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(readView);
  const [newOpen, setNewOpen] = useState<{ status?: IssueStatus } | null>(null);
  const q = params.get("q") ?? "";
  const assignee = params.get("assignee") ?? "";
  const priority = params.get("priority") ?? "";
  const project = params.get("project") ?? "";
  const issues = useIssues(cid);
  const agents = useAgentMap(cid);
  const { data: projects = [] } = useProjects(cid);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const switchView = (v: "list" | "board") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // not remembered
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (issues.data ?? []).filter(
      (i) =>
        (!needle || i.title.toLowerCase().includes(needle) || i.identifier?.toLowerCase().includes(needle)) &&
        (!assignee || (assignee === "none" ? !i.assigneeAgentId : i.assigneeAgentId === assignee)) &&
        (!priority || i.priority === priority) &&
        (!project || i.projectId === project),
    );
  }, [issues.data, q, assignee, priority, project]);
  const hasFilters = q || assignee || priority || project;
  const openCount = (issues.data ?? []).filter((i) => !["done", "cancelled"].includes(i.status)).length;

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={issues.data ? `${openCount} open · assign a task to an agent and it wakes up to work on it.` : undefined}
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setNewOpen({})} kbd="C">
            New task
          </Button>
        }
      />
      <Toolbar>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
          <Input value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Filter tasks" className="h-7 pl-8 text-sm" />
        </div>
        <Select value={assignee} onChange={(e) => setParam("assignee", e.target.value)} className="h-7 w-36 text-sm">
          <option value="">Any assignee</option>
          <option value="none">Unassigned</option>
          {[...agents.values()].map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setParam("priority", e.target.value)} className="h-7 w-32 text-sm">
          <option value="">Any priority</option>
          {ISSUE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityMeta[p].label}
            </option>
          ))}
        </Select>
        {projects.length > 0 && (
          <Select value={project} onChange={(e) => setParam("project", e.target.value)} className="h-7 w-36 text-sm">
            <option value="">Any project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        {hasFilters && (
          <Button size="xs" variant="ghost" icon={<X />} onClick={() => setParams({}, { replace: true })}>
            Clear
          </Button>
        )}
        <div className="ml-auto">
          <Segmented
            value={view}
            onChange={switchView}
            items={[
              { value: "list", label: "List", icon: <List /> },
              { value: "board", label: "Board", icon: <Columns3 /> },
            ]}
          />
        </div>
      </Toolbar>

      {issues.isError ? (
        <ErrorBox error={issues.error} onRetry={() => issues.refetch()} />
      ) : issues.isPending ? (
        <Panel>
          <SkeletonRows rows={8} />
        </Panel>
      ) : (issues.data ?? []).length === 0 ? (
        <Panel>
          <Empty
            title="No tasks yet"
            body="Create a task and assign it to an agent. The agent wakes up and starts working."
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => setNewOpen({})}>
                Create first task
              </Button>
            }
          />
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel>
          <Empty title="No tasks match these filters" action={<Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
        </Panel>
      ) : view === "list" ? (
        <ListView issues={filtered} cid={cid} />
      ) : (
        <BoardView issues={filtered} cid={cid} onAdd={(status) => setNewOpen({ status })} />
      )}

      <NewIssueModal open={!!newOpen} onClose={() => setNewOpen(null)} defaults={{ status: newOpen?.status, assigneeAgentId: assignee && assignee !== "none" ? assignee : undefined }} />
    </div>
  );
}
