import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, isDemoMode } from "@/api/client";
import { keys, useAction, useToolConnections, useToolGallery } from "@/api/hooks";
import type { ToolConnection } from "@/api/types";
import { toast, toastError } from "@/lib/toast";
import { Avatar, Button, Empty, ErrorBox, Input, Panel, SkeletonRows, Status, cx, type Glyph } from "@/components/ui";

const health = (c: ToolConnection): { glyph: Glyph; label: string } =>
  c.requiresReauthorization
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
  const check = useAction((id: string) => api.post(`/tool-connections/${id}/health-check`, {}), { invalidate: () => [keys.toolConnections(cid)], success: "Connection is healthy" });
  const disconnect = useAction((id: string) => api.del(`/tool-connections/${id}`), { invalidate: () => [keys.toolConnections(cid)], success: "Disconnected" });
  const list = conns.data ?? [];
  const connectedSlugs = new Set(list.map((c) => c.applicationId));

  const categories = useMemo(() => ["All", ...new Set((gallery.data ?? []).flatMap((a) => a.categories ?? []))], [gallery.data]);
  const needle = q.trim().toLowerCase();
  const available = (gallery.data ?? []).filter(
    (a) => !connectedSlugs.has(a.slug) && (cat === "All" || a.categories?.includes(cat)) && (!needle || a.name.toLowerCase().includes(needle) || a.description?.toLowerCase().includes(needle)),
  );

  const connect = async (slug: string, name: string) => {
    setConnecting(slug);
    try {
      const res = await api.post<{ connection?: ToolConnection; id?: string; authorizeUrl?: string; url?: string }>(`/companies/${cid}/tools/apps/connect`, { galleryKey: slug, name });
      const direct = res.authorizeUrl ?? res.url;
      if (direct) return void (window.location.href = direct);
      const conn = res.connection ?? (res.id ? ({ id: res.id } as ToolConnection) : null);
      if (conn?.authKind === "oauth" && !isDemoMode()) {
        const start = await api.post<{ authorizeUrl?: string; url?: string; redirectUrl?: string }>(`/tools/oauth/${conn.id}/start`, {});
        const to = start.authorizeUrl ?? start.url ?? start.redirectUrl;
        if (to) return void (window.location.href = to);
      }
      toast(`${name} connected. Agents can use it on their next run`);
      qc.invalidateQueries({ queryKey: keys.toolConnections(cid) });
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
                {c}
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
                    <div className="mono truncate text-2xs text-fg-4">{app.categories?.[0] ?? app.slug}</div>
                  </div>
                </div>
                <p className="mt-2.5 line-clamp-2 min-h-8 flex-1 text-xs text-fg-3">{app.description}</p>
                <Button size="xs" className="mt-3 w-fit" loading={connecting === app.slug} onClick={() => connect(app.slug, app.name)}>
                  Connect
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
