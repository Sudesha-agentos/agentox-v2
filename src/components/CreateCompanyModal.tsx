import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api } from "@/api/client";
import { keys } from "@/api/hooks";
import type { Company } from "@/api/types";
import { toast, toastError } from "@/lib/toast";
import { Button, Field, Input, Modal, Textarea } from "./ui";

export function CompanyForm({ onDone, submitLabel = "Create workspace" }: { onDone?: (c: Company) => void; submitLabel?: string }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("500");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api.post<Company>("/companies", { name: name.trim(), description: goal.trim() || null, budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)) });
      await qc.invalidateQueries({ queryKey: keys.companies });
      toast(`Created ${c.name}`);
      onDone?.(c);
      navigate(`/${c.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Labs" className="h-9" />
      </Field>
      <Field label="Mission" hint="Every agent reads this as its north star.">
        <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="Build the #1 AI note-taking app to $1M MRR." />
      </Field>
      <Field label="Monthly budget · USD" hint="Agents pause when the workspace hits this. 0 means no cap.">
        <Input type="number" min={0} step={50} value={budget} onChange={(e) => setBudget(e.target.value)} className="mono h-9" />
      </Field>
      <Button type="submit" variant="primary" size="md" className="h-9 w-full" loading={busy} disabled={!name.trim()}>
        {submitLabel} <ArrowRight />
      </Button>
    </form>
  );
}

export function CreateCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New workspace" description="A separate company of agents with its own budget and team.">
      <CompanyForm onDone={onClose} />
    </Modal>
  );
}
