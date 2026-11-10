import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAction, useAgentActions, useAgents, useProjects } from "@/api/hooks";
import { agentReadiness } from "@/lib/readiness";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, type Issue, type IssuePriority, type IssueStatus } from "@/api/types";
import { useCompany } from "@/lib/company";
import { Avatar, Button, Checkbox, Field, Kbd, Modal, Select, StatusGlyph } from "./ui";
import { issueStatusMeta, priorityMeta } from "./status";

export function NewIssueModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: { assigneeAgentId?: string; status?: IssueStatus } }) {
  const company = useCompany();
  const cid = company.id;
  const navigate = useNavigate();
  const { data: agents = [] } = useAgents(cid);
  const { data: projects = [] } = useProjects(cid);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [status, setStatus] = useState<IssueStatus | "">("");
  const [project, setProject] = useState("");
  const [another, setAnother] = useState(false);
  const [resumeToo, setResumeToo] = useState(true);
  const { resume, wake } = useAgentActions(cid);
  const chosen = agents.find((a) => a.id === assignee);
  const readiness = chosen ? agentReadiness(chosen) : null;
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setAssignee(defaults?.assigneeAgentId ?? "");
    setStatus(defaults?.status ?? "");
    setTimeout(() => titleRef.current?.focus(), 30);
  }, [open, defaults?.assigneeAgentId, defaults?.status]);

  const create = useAction(
    () =>
      api.post<Issue>(`/companies/${cid}/issues`, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeAgentId: assignee || null,
        projectId: project || null,
        ...(status ? { status } : {}),
      }),
    { cid, success: (i) => `Created ${i.identifier ?? "task"}` },
  );

  const submit = async () => {
    if (!title.trim() || create.isPending) return;
    const issue = await create.mutateAsync(undefined).catch(() => null);
    if (!issue) return;
    if (chosen && readiness?.fix === "resume" && resumeToo) resume.mutate(chosen.id, { onSuccess: () => wake.mutate({ id: chosen.id, reason: `Assigned ${issue.identifier ?? issue.title}` }) });
    setTitle("");
    setDescription("");
    if (another) titleRef.current?.focus();
    else {
      onClose();
      navigate(`/${cid}/tasks/${issue.id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="mono text-xs font-normal text-fg-3">{company.issuePrefix} · new task</span>}
      size="lg"
      footer={
        <>
          <span className="mr-auto">
            <Checkbox checked={another} onChange={setAnother} label="Create another" />
          </span>
          <span className="hidden items-center gap-1 text-2xs text-fg-4 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!title.trim()}>
            Create task
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="space-y-4"
      >
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full bg-transparent text-lg font-medium tracking-tight outline-none placeholder:text-fg-4"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Context, acceptance criteria, links. Markdown supported."
          rows={5}
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4"
        />
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Field label="Assignee">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-7 text-sm">
              <option value="">Unassigned</option>
              {agents
                .filter((a) => a.status !== "terminated")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)} className="h-7 text-sm">
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityMeta[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)} className="h-7 text-sm">
              <option value="">Auto</option>
              {ISSUE_STATUSES.filter((s) => s !== "cancelled").map((s) => (
                <option key={s} value={s}>
                  {issueStatusMeta[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select value={project} onChange={(e) => setProject(e.target.value)} className="h-7 text-sm">
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {chosen && readiness && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-sm border border-line-2 bg-raised px-3 py-2 text-xs">
            <Avatar name={chosen.name} size={18} />
            <StatusGlyph kind={readiness.kind === "ready" ? "ok" : readiness.kind === "busy" ? "queued" : readiness.kind === "waiting" ? "paused" : "error"} />
            <span className={readiness.kind === "blocked" ? "font-medium text-fg" : "text-fg-2"}>
              {chosen.name}: {readiness.label}
            </span>
            {readiness.detail && <span className="mono w-full truncate pl-7 text-2xs text-fg-4">{readiness.detail}</span>}
            {readiness.fix === "resume" && (
              <span className="ml-auto">
                <Checkbox checked={resumeToo} onChange={setResumeToo} label={`Resume ${chosen.name} too`} />
              </span>
            )}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
