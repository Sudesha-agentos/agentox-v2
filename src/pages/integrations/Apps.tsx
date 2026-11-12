import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/api/client";
import { keys, useAction, useToolConnections, useToolGallery } from "@/api/hooks";
import type { AppField, AppMethod, ConnectAppResult, ToolApp, ToolConnection } from "@/api/types";
import { toast, toastError } from "@/lib/toast";
import { titleCase } from "@/lib/format";
import { Avatar, Button, Checkbox, Empty, ErrorBox, Field, Input, Modal, Panel, SkeletonRows, Status, Textarea, cx, type Glyph } from "@/components/ui";

const health = (c: ToolConnection): { glyph: Glyph; label: string } =>
  c.status === "draft"
    ? { glyph: "queued", label: "Setup incomplete" }
    : c.requiresReauthorization
    ? { glyph: "error", label: "Reauthorize" }
    : c.healthStatus === "healthy"
      ? { glyph: "ok", label: "Healthy" }
      : c.healthStatus === "degraded"
        ? { glyph: "paused", label: "Degraded" }
        : c.healthStatus
          ? { glyph: "error", label: c.healthStatus }
          : { glyph: "idle", label: "Not checked" };

export function AppsTab({ cid }: { cid: string }) {
  const gallery = useToolGallery(cid);
  const conns = useToolConnections(cid);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [form, setForm] = useState<ToolApp | null>(null);
  const check = useAction((id: string) => api.post(`/tool-connections/${id}/health-check`, {}), { invalidate: () => [keys.toolConnections(cid)], success: "Connection is healthy" });
  const disconnect = useAction((id: string) => api.del(`/tool-connections/${id}`), { invalidate: () => [keys.toolConnections(cid)], success: "Disconnected" });
  const list = conns.data ?? [];
  const connectedSlugs = new Set(list.map((c) => c.applicationId));

  const categories = useMemo(() => ["All", ...new Set((gallery.data ?? []).flatMap((a) => a.categories ?? []))], [gallery.data]);
  const needle = q.trim().toLowerCase();
  const available = (gallery.data ?? []).filter(
    (a) => !connectedSlugs.has(a.slug) && (cat === "All" || a.categories?.includes(cat)) && (!needle || a.name.toLowerCase().includes(needle) || a.description?.toLowerCase().includes(needle)),
  );

  const needsForm = (app: ToolApp) => {
    const methods = app.methods ?? [];
    if (methods.length > 1) return true;
    const m = methods[0];
    return !!m && [...(m.credentialFields ?? []), ...(m.tenantFields ?? [])].some((f) => !f.hidden);
  };

  const quickConnect = async (app: ToolApp) => {
    setConnecting(app.slug);
    try {
      const done = await connectApp(cid, app, app.methods?.[0], {}, {});
      if (done === "connected") {
        toast(`${app.name} connected. Agents can use it on their next run`);
        qc.invalidateQueries({ queryKey: keys.toolConnections(cid) });
      }
    } catch (e) {
      toastError(e);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-fg-3">Apps give agents tools: open pull requests, post to Slack, update Linear. Connect once and every agent in the workspace can use them.</p>

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Connected <span className="mono text-xs font-normal text-fg-4">{list.length}</span>
        </h2>
        {conns.isError ? (
          <ErrorBox error={conns.error} onRetry={() => conns.refetch()} />
        ) : conns.isPending ? (
          <Panel>
            <SkeletonRows rows={2} />
          </Panel>
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-3 px-4 py-5 text-sm text-fg-3">Nothing connected yet. Pick an app below.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => {
              const h = health(c);
              return (
                <div key={c.id} className={cx("flex flex-col rounded-md border bg-panel p-3.5", h.glyph === "error" ? "border-line-3" : "border-line")}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.applicationId ?? c.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      <div className="mono truncate text-2xs text-fg-4">
                        {c.connectionPurpose === "channel" ? "chat channel" : "tool"} · {c.authKind.replace("_", " ")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Status kind={h.glyph}>{h.label}</Status>
                    <span className="ml-auto flex gap-0.5">
                      <Button size="xs" variant="ghost" loading={check.isPending && check.variables === c.id} onClick={() => check.mutate(c.id)}>
                        Check
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => confirm(`Disconnect ${c.name}? Agents lose access immediately.`) && disconnect.mutate(c.id)}>
                        Disconnect
                      </Button>
                    </span>
                  </div>
                  {c.healthMessage && <div className="mt-1.5 truncate text-xs text-fg-3">↳ {c.healthMessage}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-medium">Add an app</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" className="h-7 w-48 pl-8 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cx("h-6 rounded-xs border px-2 text-xs transition-colors", cat === c ? "border-fg bg-active text-fg" : "border-line-2 text-fg-3 hover:text-fg")}>
                {titleCase(c)}
              </button>
            ))}
          </div>
        </div>
        {gallery.isError ? (
          <ErrorBox error={gallery.error} onRetry={() => gallery.refetch()} />
        ) : gallery.isPending ? (
          <Panel>
            <SkeletonRows rows={3} />
          </Panel>
        ) : available.length === 0 ? (
          <Panel>
            <Empty title={needle || cat !== "All" ? "No apps match" : "Everything's connected"} />
          </Panel>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {available.map((app) => (
              <div key={app.slug} className="flex flex-col rounded-md border border-line bg-panel p-3.5 transition-colors hover:border-line-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={app.name} size={26} />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{app.name}</div>
                    <div className="mono truncate text-2xs text-fg-4">{titleCase(app.categories?.[0] ?? app.slug)}</div>
                  </div>
                </div>
                <p className="mt-2.5 line-clamp-2 min-h-8 flex-1 text-xs text-fg-3">{app.description}</p>
                {unavailable(app) ? (
                  <span className="mt-3 text-xs text-fg-4">{unavailable(app)}</span>
                ) : (
                  <Button size="xs" className="mt-3 w-fit" loading={connecting === app.slug} onClick={() => (needsForm(app) ? setForm(app) : quickConnect(app))}>
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {form && <ConnectAppModal key={form.slug} app={form} cid={cid} onClose={() => setForm(null)} />}
    </div>
  );
}

const unavailable = (app: ToolApp): string | null => {
  const a = app.availability;
  if (a && typeof a === "object" && a.available === false) return a.reason ?? "Not available on this server";
  return null;
};

/**
 * Connect, then finish setup for the whole workspace. OAuth apps leave for the provider's
 * consent page; the server finishes the connection when the provider redirects back.
 * Read-only actions are allowed; anything that makes changes asks an operator first.
 */
async function connectApp(cid: string, app: ToolApp, method: AppMethod | undefined, credentialValues: Record<string, string>, configValues: Record<string, unknown>): Promise<"connected" | "redirecting"> {
  const res = await api.post<ConnectAppResult>(`/companies/${cid}/tools/apps/connect`, {
    galleryKey: app.slug,
    ...(method ? { connectionMethodKey: method.key } : {}),
    name: app.name,
    ...(Object.keys(credentialValues).length ? { credentialValues } : {}),
    ...(Object.keys(configValues).length ? { configValues } : {}),
  });
  if (res.auth?.kind === "oauth") {
    if (res.auth.startUrl) {
      window.location.href = res.auth.startUrl;
      return "redirecting";
    }
    if (res.auth.manualClientRequired) throw new Error(`${app.name} needs a manually registered OAuth client. Set it up from the server's admin tools, then connect again.`);
  }
  await api.post(`/companies/${cid}/tools/apps/${res.connectionId}/finish`, {
    access: "all_agents",
    enabledCatalogEntryIds: (res.actions?.readOnly ?? []).map((a) => a.catalogEntryId),
    askFirstCatalogEntryIds: (res.actions?.canMakeChanges ?? []).map((a) => a.catalogEntryId),
  });
  return "connected";
}

function ConnectAppModal({ app, cid, onClose }: { app: ToolApp; cid: string; onClose: () => void }) {
  const qc = useQueryClient();
  const methods = app.methods ?? [];
  const [methodKey, setMethodKey] = useState(methods[0]?.key ?? "");
  const method = methods.find((m) => m.key === methodKey);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tenant = (method?.tenantFields ?? []).filter((f) => !f.hidden);
  const creds = (method?.credentialFields ?? []).filter((f) => !f.hidden);
  const fields = [...tenant, ...creds];
  const visible = fields.filter((f) => !f.advanced || showAdvanced);
  const missing = fields.filter((f) => f.required && (values[f.key] === undefined || values[f.key] === ""));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const pick = (list: AppField[]) => Object.fromEntries(list.filter((f) => values[f.key] !== undefined && values[f.key] !== "").map((f) => [f.key, values[f.key]]));
      const result = await connectApp(cid, app, method, pick(creds) as Record<string, string>, pick(tenant));
      if (result === "connected") {
        toast(`${app.name} connected. Agents can use it on their next run`);
        qc.invalidateQueries({ queryKey: keys.toolConnections(cid) });
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Connect ${app.name}`}
      description={method?.auth === "oauth" ? "You'll sign in with the provider, then return here." : "Credentials are encrypted and never shown again."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={missing.length > 0} onClick={submit}>
            {method?.auth === "oauth" ? `Continue to ${app.name}` : "Connect"}
          </Button>
        </>
      }
    >
      {app.setupPrerequisite && (
        <div className="rounded-sm border border-line-2 bg-raised px-3 py-2.5 text-sm">
          <div className="font-medium">{app.setupPrerequisite.title}</div>
          <p className="mt-0.5 text-xs text-fg-3">{app.setupPrerequisite.description}</p>
          <a href={app.setupPrerequisite.actionUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs text-fg underline underline-offset-4">
            {app.setupPrerequisite.actionLabel}
          </a>
        </div>
      )}
      {methods.length > 1 && (
        <Field label="Connect with">
          <div className="space-y-1.5" role="radiogroup">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={m.key === methodKey}
                onClick={() => setMethodKey(m.key)}
                className={cx("w-full rounded-sm border px-3 py-2 text-left", m.key === methodKey ? "border-fg bg-active" : "border-line-2 hover:border-line-3")}
              >
                <div className="text-sm">{m.label ?? (m.auth === "oauth" ? "Sign in with OAuth" : m.auth === "api_key" ? "API key" : "No authentication")}</div>
                {m.whenToUse && <div className="mt-0.5 text-xs text-fg-3">{m.whenToUse}</div>}
              </button>
            ))}
          </div>
        </Field>
      )}
      {visible.map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? "" : " (optional)"}`} hint={f.helperMd?.replace(/[*_`]/g, "")}>
          {f.type === "textarea" ? (
            <Textarea rows={3} value={String(values[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={f.secret ? "mono text-xs" : undefined} />
          ) : f.type === "checkbox" ? (
            <Checkbox checked={Boolean(values[f.key] ?? f.defaultValue)} onChange={(c) => setValues((v) => ({ ...v, [f.key]: c }))} label={f.label} />
          ) : (
            <Input
              type={f.type === "password" || f.secret ? "password" : "text"}
              autoComplete="off"
              value={String(values[f.key] ?? "")}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className={f.secret || f.type === "password" ? "mono text-xs" : undefined}
            />
          )}
        </Field>
      ))}
      {fields.some((f) => f.advanced) && (
        <button type="button" onClick={() => setShowAdvanced((a) => !a)} className="text-xs text-fg-3 hover:text-fg">
          {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
        </button>
      )}
      {method?.consoleLinks?.keys && (
        <a href={method.consoleLinks.keys} target="_blank" rel="noreferrer" className="block text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
          Where do I find this key?
        </a>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-sm border border-line-3 bg-raised px-3 py-2.5 text-sm">
          <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-fg" />
          {error}
        </div>
      )}
    </Modal>
  );
}
