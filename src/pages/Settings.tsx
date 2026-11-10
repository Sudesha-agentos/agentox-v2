import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { keys, useAction } from "@/api/hooks";
import type { Company } from "@/api/types";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { toast, toastError } from "@/lib/toast";
import { Button, Checkbox, DL, Field, Input, PageHeader, Panel, PanelHeader, Segmented, Textarea } from "@/components/ui";
import { useTheme } from "@/components/Layout";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-8 first:pt-0 last:border-b-0 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function WorkspaceForm({ company }: { company: Company }) {
  const qc = useQueryClient();
  const [name, setName] = useState(company.name);
  const [mission, setMission] = useState(company.description ?? "");
  const [budget, setBudget] = useState(String(company.budgetMonthlyCents / 100));
  const [approve, setApprove] = useState(!!company.requireBoardApprovalForNewAgents);
  const [busy, setBusy] = useState(false);
  const dirty = name !== company.name || mission !== (company.description ?? "") || Number(budget) * 100 !== company.budgetMonthlyCents || approve !== !!company.requireBoardApprovalForNewAgents;
  return (
    <Panel className="p-4">
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mission">
          <Textarea rows={3} value={mission} onChange={(e) => setMission(e.target.value)} />
        </Field>
        <Field label="Monthly budget · USD" hint="0 means no cap.">
          <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} className="mono w-40" />
        </Field>
        <Checkbox checked={approve} onChange={setApprove} label="Require operator approval for every new agent hire" />
      </div>
      <div className="mt-5 flex justify-end border-t border-line pt-3">
        <Button
          variant="primary"
          disabled={!dirty || !name.trim()}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.patch(`/companies/${company.id}`, { name: name.trim(), description: mission.trim() || null, budgetMonthlyCents: Math.max(0, Math.round(Number(budget || 0) * 100)), requireBoardApprovalForNewAgents: approve });
              await qc.invalidateQueries({ queryKey: keys.companies });
              toast("Workspace saved");
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save changes
        </Button>
      </div>
    </Panel>
  );
}

function ProfileForm() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.name ?? "");
  const save = useAction(() => api.patch("/auth/profile", { name: name.trim() }), { invalidate: () => [["session"]], success: "Profile updated" });
  if (auth.mode === "local_trusted") {
    return <Panel className="p-4 text-sm text-fg-3">Local trusted mode has no user accounts. Everyone on this machine acts as the operator.</Panel>;
  }
  return (
    <Panel className="p-4">
      <div className="space-y-4">
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" hint="Email changes aren't supported yet.">
          <Input value={auth.user?.email ?? ""} disabled className="mono text-xs" />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
        <Button variant="ghost" onClick={() => auth.signOut()}>
          Sign out
        </Button>
        <Button variant="primary" disabled={!name.trim() || name === auth.user?.name} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </Button>
      </div>
    </Panel>
  );
}

export function SettingsPage() {
  const company = useCompany();
  const auth = useAuth();
  const [theme, toggle] = useTheme();
  useCrumbs([{ label: "Settings" }], "settings");
  const h = auth.health;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <Section title="Workspace" description="Identity, mission and spending limits for this company of agents.">
        <WorkspaceForm key={company.updatedAt} company={company} />
      </Section>
      <Section title="Account" description="How you appear to teammates and in agent activity.">
        <ProfileForm />
      </Section>
      <Section title="Appearance" description="Monochrome either way.">
        <Segmented
          value={theme as "dark" | "light"}
          onChange={(v) => v !== theme && toggle()}
          items={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </Section>
      <Section title="Server" description="The agentox server this interface is connected to.">
        <Panel>
          <PanelHeader title="agentox server" meta={auth.mode === "demo" ? "demo" : location.host} />
          <div className="px-3.5 pb-1">
            <DL
              items={[
                ["Status", <span className="mono text-xs">{h?.status ?? "-"}</span>],
                ["Version", <span className="mono text-xs">{h?.version ?? "-"}</span>],
                ["Auth mode", <span className="mono text-xs">{h?.deploymentMode ?? "-"}</span>],
                ["Exposure", <span className="mono text-xs">{h?.deploymentExposure ?? "-"}</span>],
                ["Workspace ID", <span className="mono text-xs">{company.id}</span>],
              ]}
            />
          </div>
        </Panel>
      </Section>
    </div>
  );
}
