import { useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { api } from "@/api/client";
import { useAction, useApprovals } from "@/api/hooks";
import type { Approval } from "@/api/types";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { useAgentMap } from "@/lib/useAgentMap";
import { cents, timeAgo, titleCase } from "@/lib/format";
import { Avatar, Button, Empty, ErrorBox, PageHeader, Panel, Segmented, Skeleton, Status, Tag, Textarea } from "@/components/ui";
import { approvalStatusMeta, approvalTypeLabel } from "@/components/status";

function Payload({ a }: { a: Approval }) {
  const p = a.payload ?? {};
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  if (a.type === "hire_agent") {
    return (
      <div className="flex items-start gap-3">
        <Avatar name={str("name") ?? "New agent"} size={32} />
        <div className="min-w-0">
          <div className="text-md">{str("name") ?? "New agent"}</div>
          <div className="mono mt-0.5 text-xs text-fg-3">{[str("title"), str("role") && titleCase(str("role")), str("adapterType")].filter(Boolean).join(" · ")}</div>
          {str("reason") && <p className="mt-2 text-sm text-fg-2">{str("reason")}</p>}
        </div>
      </div>
    );
  }
  const summary = str("summary") ?? str("reason") ?? str("description") ?? str("message");
  const amount = typeof p.amountCents === "number" ? p.amountCents : null;
  const rest = Object.entries(p).filter(([k, v]) => !["summary", "reason", "description", "message", "amountCents"].includes(k) && v !== null && typeof v !== "object");
  return (
    <div className="space-y-2">
      {amount !== null && <div className="mono text-xl font-medium">{cents(amount)}</div>}
      {summary && <p className="text-md leading-relaxed whitespace-pre-wrap text-fg-2">{summary}</p>}
      {rest.length > 0 && (
        <dl className="mono grid grid-cols-[140px_1fr] gap-y-1 text-xs">
          {rest.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-4">{k}</dt>
              <dd className="truncate text-fg-2">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ApprovalCard({ a, cid }: { a: Approval; cid: string }) {
  const agents = useAgentMap(cid);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const requester = a.requestedByAgentId ? agents.get(a.requestedByAgentId) : null;
  const decide = useAction((action: "approve" | "reject" | "request-revision") => api.post<Approval>(`/approvals/${a.id}/${action}`, { decisionNote: note.trim() || null }), {
    cid,
    success: (_r, action) => (action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Changes requested"),
  });
  const open = a.status === "pending" || a.status === "revision_requested";
  const meta = approvalStatusMeta[a.status] ?? { glyph: "idle" as const, label: a.status };
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <Tag>{approvalTypeLabel[a.type] ?? titleCase(a.type)}</Tag>
        <Status kind={meta.glyph}>{meta.label}</Status>
        <span className="ml-auto flex items-center gap-2 text-xs text-fg-3">
          {requester && <Avatar name={requester.name} size={16} />}
          {requester ? requester.name : a.requestedByUserId ? "You" : "System"}
          <span className="mono text-fg-4">{timeAgo(a.createdAt)}</span>
        </span>
      </div>
      <div className="px-4 py-4">
        <Payload a={a} />
        {a.decisionNote && !open && <p className="mt-3 border-l border-line-3 pl-3 text-sm text-fg-3">{a.decisionNote}</p>}
      </div>
      {open && (
        <div className="space-y-2 border-t border-line bg-raised px-4 py-3">
          {showNote && <Textarea autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the agent (optional)" className="min-h-0" />}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary" icon={<Check />} loading={decide.isPending && decide.variables === "approve"} disabled={decide.isPending} onClick={() => decide.mutate("approve")}>
              Approve
            </Button>
            <Button variant="danger" icon={<X />} loading={decide.isPending && decide.variables === "reject"} disabled={decide.isPending} onClick={() => decide.mutate("reject")}>
              Reject
            </Button>
            <Button variant="ghost" icon={<MessageSquare />} disabled={decide.isPending} onClick={() => (showNote && note.trim() ? decide.mutate("request-revision") : setShowNote(true))}>
              {showNote && note.trim() ? "Send" : "Request changes"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function ApprovalsPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Approvals" }], "approvals");
  const [tab, setTab] = useState<"open" | "all">("open");
  const approvals = useApprovals(cid);
  const all = approvals.data ?? [];
  const isOpen = (a: Approval) => a.status === "pending" || a.status === "revision_requested";
  const list = all.filter((a) => tab === "all" || isOpen(a));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Approvals"
        description="Decisions agents can't make alone: hires, strategy changes, budget overrides."
        actions={<Segmented value={tab} onChange={setTab} items={[{ value: "open", label: <>Open <span className="mono text-fg-4">{all.filter(isOpen).length}</span></> }, { value: "all", label: "All" }]} />}
      />
      {approvals.isError ? (
        <ErrorBox error={approvals.error} onRetry={() => approvals.refetch()} />
      ) : approvals.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : list.length === 0 ? (
        <Panel>
          <Empty title={tab === "open" ? "Nothing waiting on you" : "No approvals yet"} body="When agents ask to hire, change strategy or exceed budget, the request lands here." />
        </Panel>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <ApprovalCard key={a.id} a={a} cid={cid} />
          ))}
        </div>
      )}
    </div>
  );
}
