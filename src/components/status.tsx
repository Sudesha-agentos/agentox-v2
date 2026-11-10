import type { AgentStatus, ApprovalStatus, IssuePriority, IssueStatus, RunStatus } from "@/api/types";
import { Status, cx, type Glyph } from "./ui";
import { titleCase } from "@/lib/format";

export const agentStatusMeta: Record<AgentStatus, { glyph: Glyph; label: string }> = {
  running: { glyph: "live", label: "Running" },
  active: { glyph: "ok", label: "Active" },
  idle: { glyph: "idle", label: "Idle" },
  paused: { glyph: "paused", label: "Paused" },
  error: { glyph: "error", label: "Error" },
  pending_approval: { glyph: "queued", label: "Pending approval" },
  terminated: { glyph: "off", label: "Terminated" },
};

export function AgentStatus({ status }: { status: AgentStatus }) {
  const m = agentStatusMeta[status] ?? { glyph: "idle" as Glyph, label: titleCase(status) };
  return <Status kind={m.glyph}>{m.label}</Status>;
}

export const runStatusMeta: Record<RunStatus, { glyph: Glyph; label: string }> = {
  queued: { glyph: "queued", label: "Queued" },
  scheduled_retry: { glyph: "queued", label: "Retry scheduled" },
  running: { glyph: "live", label: "Running" },
  succeeded: { glyph: "ok", label: "Succeeded" },
  interrupted: { glyph: "paused", label: "Interrupted" },
  failed: { glyph: "error", label: "Failed" },
  cancelled: { glyph: "off", label: "Cancelled" },
  timed_out: { glyph: "error", label: "Timed out" },
};

export const isActiveRun = (s: string) => s === "queued" || s === "running" || s === "scheduled_retry";

export function RunStatus({ status }: { status: RunStatus }) {
  const m = runStatusMeta[status] ?? { glyph: "idle" as Glyph, label: titleCase(status) };
  return <Status kind={m.glyph}>{m.label}</Status>;
}

/* Issue status: a 14px ring that fills as work progresses. */
export const issueStatusMeta: Record<IssueStatus, { label: string; fill: number; dashed?: boolean; blocked?: boolean; struck?: boolean }> = {
  backlog: { label: "Backlog", fill: 0, dashed: true },
  todo: { label: "Todo", fill: 0 },
  in_progress: { label: "In progress", fill: 0.5 },
  in_review: { label: "In review", fill: 0.75 },
  blocked: { label: "Blocked", fill: 0, blocked: true },
  done: { label: "Done", fill: 1 },
  cancelled: { label: "Cancelled", fill: 0, struck: true },
};

export function IssueStatusIcon({ status, className }: { status: IssueStatus; className?: string }) {
  const m = issueStatusMeta[status] ?? issueStatusMeta.todo;
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 14 14" className={cx("size-3.5 shrink-0", status === "cancelled" || status === "backlog" ? "text-fg-4" : "text-fg-2", className)} role="img" aria-label={m.label}>
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={m.dashed ? "2 1.6" : undefined} />
      {m.fill > 0 && m.fill < 1 && <circle cx="7" cy="7" r={r / 2} fill="none" stroke="currentColor" strokeWidth={r} strokeDasharray={`${(c / 2) * m.fill} ${c}`} transform="rotate(-90 7 7)" />}
      {m.fill === 1 && (
        <>
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path d="M4.2 7.2 6.1 9 9.8 5.2" fill="none" stroke="var(--panel)" strokeWidth="1.4" />
        </>
      )}
      {m.blocked && <path d="M3.2 10.8 10.8 3.2" stroke="currentColor" strokeWidth="1.2" />}
      {m.struck && <path d="M4.5 4.5 9.5 9.5M9.5 4.5 4.5 9.5" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

export const priorityMeta: Record<IssuePriority, { label: string; bars: number }> = {
  critical: { label: "Urgent", bars: 4 },
  high: { label: "High", bars: 3 },
  medium: { label: "Medium", bars: 2 },
  low: { label: "Low", bars: 1 },
};

export function PriorityIcon({ priority, className }: { priority: IssuePriority; className?: string }) {
  const m = priorityMeta[priority] ?? priorityMeta.medium;
  if (priority === "critical") {
    return (
      <span className={cx("mono inline-flex size-3.5 shrink-0 items-center justify-center rounded-xs bg-inv text-[9px] font-bold text-inv-fg", className)} role="img" aria-label="Urgent priority" title="Urgent">
        !
      </span>
    );
  }
  return (
    <span className={cx("inline-flex size-3.5 shrink-0 items-end gap-[1.5px]", className)} role="img" aria-label={`${m.label} priority`} title={`${m.label} priority`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cx("w-[3px] rounded-[0.5px]", i < m.bars ? "bg-fg-2" : "bg-line-3")} style={{ height: 5 + i * 3.5 }} />
      ))}
    </span>
  );
}

export const approvalStatusMeta: Record<ApprovalStatus, { glyph: Glyph; label: string }> = {
  pending: { glyph: "live", label: "Pending" },
  revision_requested: { glyph: "queued", label: "Changes requested" },
  approved: { glyph: "ok", label: "Approved" },
  rejected: { glyph: "off", label: "Rejected" },
  cancelled: { glyph: "off", label: "Cancelled" },
};

export const approvalTypeLabel: Record<string, string> = {
  hire_agent: "Hire",
  approve_ceo_strategy: "Strategy",
  budget_override_required: "Budget override",
  request_board_approval: "Board approval",
};
