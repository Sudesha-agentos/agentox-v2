import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { keys, useAction } from "@/api/hooks";
import { AI_PROVIDERS, type AdapterDetail, type AiConnection, type EnvCheck, type EnvTestResult } from "@/api/types";
import { timeAgo } from "@/lib/format";
import { Avatar, Button, Empty, ErrorBox, Field, Input, Menu, Modal, Panel, PanelHeader, Segmented, Select, SkeletonRows, Spinner, Status, StatusGlyph, Tag, cx, type Glyph } from "@/components/ui";
import { envTestKey, providerFromText, providerLabel, useReadiness, type AgentRow } from "./model";

/* ------------------------------------------------------- providers */

export function AddProviderModal({ cid, open, onClose, provider: initial, replacing }: { cid: string; open: boolean; onClose: () => void; provider?: string; replacing?: AiConnection }) {
  const [provider, setProvider] = useState<string>(initial ?? replacing?.provider ?? "anthropic");
  const [name, setName] = useState(replacing?.name ?? "");
  const [apiKey, setApiKey] = useState("");
  const [ownership, setOwnership] = useState<"shared" | "personal">(replacing?.ownership ?? "shared");
  const qc = useQueryClient();
  const add = useAction(
    async () => {
      const res = await api.post(`/companies/${cid}/ai-connections`, { provider, method: "api_key", name: name.trim() || `${providerLabel(provider)} key`, ownership, apiKey: apiKey.trim(), allAgents: ownership === "shared" });
      if (replacing) await api.del(`/tool-connections/${replacing.id}/grants/${replacing.grantId}`).catch(() => {});
      return res;
    },
    {
      invalidate: () => [keys.aiConnections(cid)],
      success: replacing ? "Key replaced" : `${providerLabel(provider)} connected`,
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={replacing ? `Replace key · ${replacing.name}` : "Connect a model provider"}
      description="Agents use this key to call the model. It's encrypted at rest and never shown again."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={!apiKey.trim()}
            onClick={() =>
              add.mutateAsync(undefined).then(() => {
                setApiKey("");
                // Credentials changed, so environment checks are stale.
                qc.invalidateQueries({ queryKey: ["c", cid, "env-test"] });
                onClose();
              }, () => {})
            }
          >
            {replacing ? "Replace key" : "Connect"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Provider">
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={!!replacing}>
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {providerLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Label">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${providerLabel(provider)} · production`} />
        </Field>
      </div>
      <Field label="API key">
        <Input autoFocus type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" className="mono text-xs" />
      </Field>
      <Field label="Available to" hint={ownership === "shared" ? "Every agent in the workspace can use this key." : "Only agents you run personally can use this key."}>
        <Segmented value={ownership} onChange={setOwnership} items={[{ value: "shared", label: "Whole workspace" }, { value: "personal", label: "Just me" }]} />
      </Field>
    </Modal>
  );
}

const connStatus: Record<string, { glyph: Glyph; label: string }> = {
  connected: { glyph: "ok", label: "Connected" },
  needs_attention: { glyph: "error", label: "Needs attention" },
  expired: { glyph: "error", label: "Expired" },
  revoked: { glyph: "off", label: "Revoked" },
};

function ProviderCard({ c, cid, onReplace }: { c: AiConnection; cid: string; onReplace: () => void }) {
  const setDefault = useAction((grantId: string) => api.put(`/companies/${cid}/ai-connections/default`, { grantId }), { invalidate: () => [keys.aiConnections(cid)], success: "Default provider updated" });
  const revoke = useAction(() => api.del(`/tool-connections/${c.id}/grants/${c.grantId}`), { invalidate: () => [keys.aiConnections(cid), ["c", cid, "env-test"]], success: "Connection revoked" });
  const st = connStatus[c.status] ?? { glyph: "idle" as Glyph, label: c.status };
  const broken = c.status !== "connected";
  return (
    <div className={cx("flex flex-col rounded-md border bg-panel p-3.5", broken ? "border-line-3" : "border-line")}>
      <div className="flex items-start gap-2.5">
        <Avatar name={providerLabel(c.provider)} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate">{c.name}</span>
            {c.isDefault && <Tag className="h-4 px-1 text-2xs">default</Tag>}
          </div>
          <div className="mono truncate text-2xs text-fg-4">
            {providerLabel(c.provider)} · {c.method === "api_key" ? "API key" : "subscription"}
            {c.accountLabel ? ` · ${c.accountLabel}` : ""}
          </div>
        </div>
        <Menu
          align="end"
          width={170}
          trigger={(p) => (
            <Button size="xs" variant="ghost" aria-label={`Manage ${c.name}`} {...p}>
              <MoreHorizontal />
            </Button>
          )}
          items={[
            ...(!c.isDefault && !broken ? [{ label: "Make default", onSelect: () => setDefault.mutate(c.grantId) }] : []),
            ...(c.method === "api_key" ? [{ label: "Replace key", onSelect: onReplace }] : []),
            { label: "Revoke", icon: <Trash2 />, destructive: true, onSelect: () => confirm(`Revoke ${c.name}? Agents using it stop until it's reconnected.`) && revoke.mutate(undefined) },
          ]}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Status kind={st.glyph}>{st.label}</Status>
        <span className="text-2xs text-fg-4">{c.ownership === "shared" ? "Workspace" : `Personal${c.ownerName ? ` · ${c.ownerName}` : ""}`}</span>
      </div>
      {broken && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
          <span className="min-w-0 flex-1 truncate text-xs text-fg-2">{c.unavailableReason ?? "Reconnect to restore access"}</span>
          {c.method === "api_key" && (
            <Button size="xs" variant="primary" onClick={onReplace}>
              Replace key
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ProvidersSection({ cid }: { cid: string }) {
  const { providers } = useReadiness(cid);
  const [modal, setModal] = useState<{ provider?: string; replacing?: AiConnection } | null>(null);
  const list = [...(providers.data?.connections ?? [])].sort((a, b) => Number(a.status === "connected") - Number(b.status === "connected"));
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Model providers</h2>
          <p className="mt-0.5 text-xs text-fg-3">The accounts agents bill model calls to.</p>
        </div>
        <Button size="xs" variant="primary" icon={<Plus />} onClick={() => setModal({})}>
          Add provider
        </Button>
      </div>
      {providers.isError ? (
        <ErrorBox error={providers.error} onRetry={() => providers.refetch()} />
      ) : providers.isPending ? (
        <Panel>
          <SkeletonRows rows={2} />
        </Panel>
      ) : list.length === 0 ? (
        <Panel>
          <Empty title="No provider connected" body="Agents can't think without one. Add an API key, or sign in to a subscription on the server host." action={<Button variant="primary" icon={<Plus />} onClick={() => setModal({})}>Add API key</Button>} />
        </Panel>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <ProviderCard key={c.id} c={c} cid={cid} onReplace={() => setModal({ replacing: c })} />
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-fg-4">
        Using a Claude, ChatGPT or Gemini subscription instead? Sign in on the server host and it shows up here automatically.
      </p>
      {modal && <AddProviderModal key={JSON.stringify(modal)} cid={cid} open onClose={() => setModal(null)} provider={modal.provider} replacing={modal.replacing} />}
    </section>
  );
}

/* --------------------------------------------------------- runtimes */

const levelGlyph: Record<string, Glyph> = { info: "ok", warn: "paused", error: "error" };

export function CheckList({ checks, onFix }: { checks: EnvCheck[]; onFix?: (provider: string) => void }) {
  return (
    <ol className="divide-y divide-line">
      {checks.map((c, i) => {
        const provider = c.level !== "info" ? providerFromText(`${c.hint ?? ""} ${c.message}`) : null;
        return (
          <li key={i} className="flex gap-3 px-3.5 py-2">
            <span className="mt-1.5">
              <StatusGlyph kind={levelGlyph[c.level] ?? "idle"} />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cx("text-sm", c.level === "error" ? "font-medium text-fg" : c.level === "warn" ? "text-fg" : "text-fg-2")}>{c.message}</div>
              {c.detail && <div className="mono mt-0.5 text-2xs break-all text-fg-4">{c.detail}</div>}
              {c.hint && <div className="mt-1 text-xs text-fg-3">↳ {c.hint}</div>}
            </div>
            {provider && onFix && (
              <Button size="xs" variant={c.level === "error" ? "primary" : "secondary"} onClick={() => onFix(provider)}>
                Add {providerLabel(provider)} key
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function testGlyph(t?: EnvTestResult, checking?: boolean): { glyph: Glyph; label: string } {
  if (checking) return { glyph: "queued", label: "Checking…" };
  if (!t) return { glyph: "idle", label: "Not checked" };
  return t.status === "pass" ? { glyph: "ok", label: "Checks pass" } : t.status === "warn" ? { glyph: "paused", label: "Warnings" } : { glyph: "error", label: "Failing" };
}

function RuntimeCard({ adapter, rows, test, checking, onRecheck, onFix }: { adapter: AdapterDetail; rows: AgentRow[]; test?: EnvTestResult; checking: boolean; onRecheck: () => void; onFix: (p: string) => void }) {
  const [open, setOpen] = useState(test?.status !== "pass");
  const g = testGlyph(test, checking);
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <ChevronRight className={cx("size-3.5 shrink-0 text-fg-4 transition-transform", open && "rotate-90")} />
          <span className="min-w-0">
            <span className="block text-sm">{adapter.label}</span>
            <span className="mono block text-2xs text-fg-4">
              {adapter.type}
              {adapter.version ? ` · v${adapter.version}` : ""}
              {adapter.modelsCount ? ` · ${adapter.modelsCount} models` : ""}
            </span>
          </span>
        </button>
        <span className="flex items-center -space-x-1" title={rows.map((r) => r.agent.name).join(", ")}>
          {rows.slice(0, 5).map((r) => (
            <Avatar key={r.agent.id} name={r.agent.name} size={20} className="ring-2 ring-panel" />
          ))}
        </span>
        <span className="text-xs text-fg-3">
          {rows.length} agent{rows.length === 1 ? "" : "s"}
        </span>
        {g.glyph === "error" ? <Status kind="error">{g.label}</Status> : <Status kind={g.glyph}>{g.label}</Status>}
        <Button size="xs" variant="ghost" icon={checking ? <Spinner /> : <RefreshCw />} disabled={checking} onClick={onRecheck}>
          Re-check
        </Button>
      </div>
      {open && test && (
        <div className="border-t border-line">
          <CheckList checks={test.checks} onFix={onFix} />
          <div className="mono border-t border-line px-3.5 py-1.5 text-2xs text-fg-4">checked {timeAgo(test.testedAt)}</div>
        </div>
      )}
    </Panel>
  );
}

export function RuntimesSection({ cid }: { cid: string }) {
  const r = useReadiness(cid);
  const qc = useQueryClient();
  const [fix, setFix] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [adhoc, setAdhoc] = useState<Record<string, EnvTestResult | "running">>({});
  const inUse = (r.adapters.data ?? []).filter((a) => r.types.includes(a.type));
  const others = (r.adapters.data ?? []).filter((a) => !r.types.includes(a.type));
  const recheck = (t: string) => qc.invalidateQueries({ queryKey: envTestKey(cid, t) });
  const testOther = async (t: string) => {
    setAdhoc((s) => ({ ...s, [t]: "running" }));
    try {
      const res = await api.post<EnvTestResult>(`/companies/${cid}/adapters/${encodeURIComponent(t)}/test-environment`, { adapterConfig: {} });
      setAdhoc((s) => ({ ...s, [t]: res }));
    } catch {
      setAdhoc((s) => {
        const n = { ...s };
        delete n[t];
        return n;
      });
    }
  };

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-medium">Runtimes in use</h2>
        <p className="mt-0.5 text-xs text-fg-3">The agent harnesses your team runs on, checked on the server host.</p>
      </div>
      {r.error ? (
        <ErrorBox error={r.error} onRetry={() => r.adapters.refetch()} />
      ) : r.loading ? (
        <Panel>
          <SkeletonRows rows={3} />
        </Panel>
      ) : inUse.length === 0 ? (
        <Panel>
          <Empty title="No runtimes in use" body="Hire an agent and its runtime shows up here with a health check." />
        </Panel>
      ) : (
        <div className="space-y-2">
          {inUse.map((a) => {
            const q = r.tests.get(a.type);
            return (
              <RuntimeCard
                key={a.type + (q?.dataUpdatedAt ?? 0)}
                adapter={a}
                rows={r.rows.filter((x) => x.agent.adapterType === a.type)}
                test={q?.data}
                checking={!!q && q.fetchStatus === "fetching"}
                onRecheck={() => recheck(a.type)}
                onFix={setFix}
              />
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowOthers((s) => !s)} className="flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg">
            <ChevronRight className={cx("size-3 transition-transform", showOthers && "rotate-90")} />
            {others.length} other runtimes available
          </button>
          {showOthers && (
            <Panel className="mt-2 overflow-hidden">
              <PanelHeader title="Available runtimes" meta="not used by any agent" />
              <ul className="divide-y divide-line">
                {others.map((a) => {
                  const t = adhoc[a.type];
                  return (
                    <li key={a.type}>
                      <div className="flex items-center gap-3 px-3.5 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{a.label}</span>
                          <span className="mono block text-2xs text-fg-4">
                            {a.type} · {a.source}
                          </span>
                        </span>
                        {a.disabled ? (
                          <Status kind="off">Disabled</Status>
                        ) : t === "running" ? (
                          <Status kind="queued">Checking…</Status>
                        ) : t ? (
                          <Status kind={testGlyph(t).glyph}>{testGlyph(t).label}</Status>
                        ) : null}
                        <Button size="xs" variant="ghost" disabled={a.disabled || t === "running"} onClick={() => testOther(a.type)}>
                          Test
                        </Button>
                      </div>
                      {t && t !== "running" && t.status !== "pass" && (
                        <div className="border-t border-line bg-raised">
                          <CheckList checks={t.checks} onFix={setFix} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          <p className="mt-2 text-xs text-fg-4">Installing or disabling runtimes needs instance-admin rights.</p>
        </div>
      )}
      {fix && <AddProviderModal key={fix} cid={cid} open onClose={() => setFix(null)} provider={fix} />}
    </section>
  );
}
