import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api } from "@/api/client";
import { useAction, useAdapters, useAgents } from "@/api/hooks";
import { AGENT_ROLES, type Agent, type Approval } from "@/api/types";
import { useCompany } from "@/lib/company";
import { titleCase } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button, Field, Input, Modal, Select, Textarea, cx } from "./ui";

const LOCAL_ADAPTERS = new Set(["claude_local", "codex_local", "gemini_local", "opencode_local", "cursor", "pi_local", "kimi_local", "grok_local", "hermes_local"]);

export function HireAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const company = useCompany();
  const cid = company.id;
  const navigate = useNavigate();
  const { data: adapters = [], isPending: adaptersLoading } = useAdapters(cid);
  const { data: agents = [] } = useAgents(cid);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("engineer");
  const [adapterType, setAdapterType] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [budget, setBudget] = useState("100");
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [extraJson, setExtraJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const usable = adapters.filter((a) => !a.disabled && a.loaded !== false);
  useEffect(() => {
    if (open && !adapterType && usable.length) setAdapterType(usable.find((a) => a.type === "claude_local")?.type ?? usable[0]!.type);
  }, [open, usable, adapterType]);
  useEffect(() => {
    if (open && !reportsTo) {
      const ceo = agents.find((a) => a.role === "ceo" && a.status !== "terminated");
      if (ceo) setReportsTo(ceo.id);
    }
  }, [open, agents, reportsTo]);

  const hire = useAction(
    () => {
      const adapterConfig: Record<string, unknown> = extraJson.trim() ? JSON.parse(extraJson) : {};
      if (cwd.trim()) adapterConfig.cwd = cwd.trim();
      if (model.trim()) adapterConfig.model = model.trim();
      return api.post<{ agent: Agent; approval: Approval | null }>(`/companies/${cid}/agent-hires`, {
        name: name.trim(),
        title: title.trim() || null,
        role,
        adapterType,
        reportsTo: reportsTo || null,
        capabilities: capabilities.trim() || null,
        budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)),
        adapterConfig,
      });
    },
    { cid },
  );

  const submit = async () => {
    if (extraJson.trim()) {
      try {
        const v = JSON.parse(extraJson);
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Must be a JSON object");
        setJsonError(null);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
        setAdvanced(true);
        return;
      }
    }
    const res = await hire.mutateAsync(undefined).catch(() => null);
    if (!res) return;
    toast(res.approval ? `${res.agent.name} is waiting for approval` : `Hired ${res.agent.name}`);
    setName("");
    setTitle("");
    setCapabilities("");
    onClose();
    navigate(`/${cid}/agents/${res.agent.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hire an agent"
      description="Pick a runtime, a manager and a budget. You can change all of it later."
      size="lg"
      footer={
        <>
          {company.requireBoardApprovalForNewAgents && <span className="mr-auto text-xs text-fg-3">New hires need operator approval in this workspace.</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={hire.isPending} disabled={!name.trim() || !adapterType}>
            Hire agent
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace" />
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Backend Engineer" />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {AGENT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.length <= 3 ? r.toUpperCase() : titleCase(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reports to">
            <Select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
              <option value="">No manager</option>
              {agents
                .filter((a) => a.status !== "terminated")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.title ? ` · ${a.title}` : ""}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-fg-2">Runtime</div>
          {adaptersLoading ? (
            <div className="skeleton h-20" />
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup">
              {usable.map((a) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={adapterType === a.type}
                  key={a.type}
                  onClick={() => setAdapterType(a.type)}
                  className={cx("rounded-sm border px-2.5 py-2 text-left transition-colors", adapterType === a.type ? "border-fg bg-active" : "border-line-2 hover:border-line-3")}
                >
                  <div className="flex items-center justify-between text-sm">
                    {a.label}
                    {adapterType === a.type && <span className="size-1.5 rounded-full bg-fg" />}
                  </div>
                  <div className="mono text-2xs text-fg-4">{a.type}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Capabilities" hint="Managers read this when deciding who to delegate to.">
          <Textarea rows={2} value={capabilities} onChange={(e) => setCapabilities(e.target.value)} placeholder="APIs, databases, writing tests" className="min-h-0" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Budget · USD / month">
            <Input type="number" min={0} step={10} value={budget} onChange={(e) => setBudget(e.target.value)} className="mono" />
          </Field>
          {LOCAL_ADAPTERS.has(adapterType) && (
            <>
              <Field label="Working directory">
                <Input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="~/code/app" className="mono text-xs" />
              </Field>
              <Field label="Model">
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="default" className="mono text-xs" />
              </Field>
            </>
          )}
        </div>

        <div>
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
            <ChevronRight className={cx("size-3 transition-transform", advanced && "rotate-90")} />
            Advanced adapter config
          </button>
          {advanced && (
            <div className="mt-2">
              <Textarea rows={4} value={extraJson} onChange={(e) => setExtraJson(e.target.value)} placeholder={'{\n  "timeoutSec": 900\n}'} className="mono text-xs" />
              <p className="mt-1.5 text-xs text-fg-3">{jsonError ? `↳ ${jsonError}` : "Merged into adapterConfig."}</p>
            </div>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
