import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { LiveEvent } from "@/api/types";

export type LiveStatus = "connecting" | "live" | "offline";

interface LiveApi {
  status: LiveStatus;
  connectedAt: number | null;
}
const LiveContext = createContext<LiveApi>({ status: "connecting", connectedAt: null });
export const useLive = () => useContext(LiveContext);

/* Ring buffer of recent events, shared by the Live page and activity tickers. */
const MAX_EVENTS = 500;
let buffer: LiveEvent[] = [];
const bufferListeners = new Set<() => void>();
function pushEvent(e: LiveEvent) {
  buffer = [e, ...buffer].slice(0, MAX_EVENTS);
  bufferListeners.forEach((l) => l());
}
export function clearLiveEvents() {
  buffer = [];
  bufferListeners.forEach((l) => l());
}
export function useLiveEvents(): LiveEvent[] {
  return useSyncExternalStore(
    (cb) => {
      bufferListeners.add(cb);
      return () => bufferListeners.delete(cb);
    },
    () => buffer,
  );
}

/** Maps a server live event to the queries it makes stale. */
function staleKeys(cid: string, e: LiveEvent): QueryKey[] {
  const p = e.payload as { runId?: string };
  const c = ["c", cid];
  if (e.type === "heartbeat.run.event" || e.type === "heartbeat.run.log" || e.type === "heartbeat.run.progress") {
    return p.runId ? [[...c, "run", p.runId, "events"]] : [];
  }
  if (e.type.startsWith("heartbeat.run.")) {
    return [[...c, "runs"], [...c, "live-runs"], [...c, "agents"], [...c, "agent"], [...c, "dashboard"], [...c, "issues"], [...c, "issue"], ...(p.runId ? [[...c, "run", p.runId]] : [])];
  }
  if (e.type.startsWith("agent.")) return [[...c, "agents"], [...c, "agent"], [...c, "dashboard"]];
  if (e.type === "activity.logged") return [[...c, "activity"], [...c, "issues"], [...c, "issue"], [...c, "approvals"], [...c, "dashboard"]];
  return [];
}

export function LiveUpdates({ companyId, children }: { companyId: string | null; children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const pending = useRef(new Map<string, QueryKey>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const cid = companyId;
    clearLiveEvents();

    // Coalesce bursts (a run emits many events per second) into one refetch per key.
    const handle = (e: LiveEvent) => {
      pushEvent(e);
      for (const k of staleKeys(cid, e)) pending.current.set(JSON.stringify(k), k);
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        pending.current.forEach((k) => qc.invalidateQueries({ queryKey: k }));
        pending.current.clear();
      }, 250);
    };

    let ws: WebSocket | null = null;
    let retry = 0;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/companies/${cid}/events/ws`);
      ws.onopen = () => {
        retry = 0;
        setStatus("live");
        setConnectedAt(Date.now());
        // Events aren't replayed, so catch up on anything missed while disconnected.
        qc.invalidateQueries({ queryKey: ["c", cid] });
      };
      ws.onmessage = (msg) => {
        try {
          const e = JSON.parse(msg.data as string) as LiveEvent;
          if (e && typeof e.type === "string" && !e.type.startsWith("live.")) handle(e);
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("offline");
        setConnectedAt(null);
        retry += 1;
        timer = setTimeout(connect, Math.min(15000, 500 * 2 ** retry));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [companyId, qc]);

  return <LiveContext.Provider value={{ status, connectedAt }}>{children}</LiveContext.Provider>;
}
