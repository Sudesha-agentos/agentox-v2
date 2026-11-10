import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { Agent, HeartbeatRun, Issue } from "@/api/types";
import { cents, roleLabel } from "@/lib/format";
import { Avatar, IconButton, StatusGlyph, cx } from "./ui";
import { agentStatusMeta, isActiveRun } from "./status";

/*
 * Top-down org chart: a tidy tree laid out in plain math, drawn with absolutely positioned
 * cards and an SVG layer for reporting lines. Pan by dragging, zoom with the controls or ⌘/ctrl + wheel.
 */

const W = 232; // card width
const H = 104; // card height
const GX = 28; // gap between siblings
const GY = 64; // gap between levels
const PAD = 48;

interface Node {
  agent: Agent;
  children: Node[];
  depth: number;
  x: number; // card left
  y: number; // card top
  span: number; // subtree width
}

function build(agents: Agent[], collapsed: Set<string>): { roots: Node[]; width: number; height: number; all: Node[] } {
  const ids = new Set(agents.map((a) => a.id));
  const kids = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const k = a.reportsTo && ids.has(a.reportsTo) ? a.reportsTo : null;
    kids.set(k, [...(kids.get(k) ?? []), a]);
  }
  const order = (list: Agent[]) => [...list].sort((a, b) => (a.role === "ceo" ? -1 : b.role === "ceo" ? 1 : a.name.localeCompare(b.name)));
  const all: Node[] = [];
  const make = (a: Agent, depth: number): Node => {
    const n: Node = { agent: a, children: [], depth, x: 0, y: depth * (H + GY), span: W };
    all.push(n);
    if (!collapsed.has(a.id)) n.children = order(kids.get(a.id) ?? []).map((c) => make(c, depth + 1));
    n.span = n.children.length ? Math.max(W, n.children.reduce((s, c) => s + c.span, 0) + GX * (n.children.length - 1)) : W;
    return n;
  };
  const roots = order(kids.get(null) ?? []).map((r) => make(r, 0));

  // Place each subtree in its slot, parent centred over its children.
  const place = (n: Node, left: number) => {
    if (!n.children.length) {
      n.x = left + (n.span - W) / 2;
      return;
    }
    const inner = n.children.reduce((s, c) => s + c.span, 0) + GX * (n.children.length - 1);
    let cursor = left + (n.span - inner) / 2;
    for (const c of n.children) {
      place(c, cursor);
      cursor += c.span + GX;
    }
    const first = n.children[0]!;
    const last = n.children[n.children.length - 1]!;
    n.x = (first.x + last.x) / 2;
  };
  let cursor = PAD;
  for (const r of roots) {
    place(r, cursor);
    cursor += r.span + GX * 2;
  }
  for (const n of all) n.y += PAD;
  const width = Math.max(cursor - GX * 2 + PAD, W + PAD * 2);
  const height = Math.max(...all.map((n) => n.y + H), H) + PAD + 24;
  return { roots, width, height, all };
}

/** Elbow connector with rounded corners from a parent's bottom to a child's top. */
function elbow(px: number, py: number, cx_: number, cy: number) {
  const mid = py + GY / 2;
  if (Math.abs(px - cx_) < 1) return `M${px},${py} L${cx_},${cy}`;
  const r = Math.min(8, Math.abs(px - cx_) / 2, GY / 4);
  const dir = cx_ > px ? 1 : -1;
  return `M${px},${py} L${px},${mid - r} Q${px},${mid} ${px + r * dir},${mid} L${cx_ - r * dir},${mid} Q${cx_},${mid} ${cx_},${mid + r} L${cx_},${cy}`;
}

export interface OrgChartProps {
  agents: Agent[];
  cid: string;
  openTasks: Map<string, number>;
  liveRuns: HeartbeatRun[];
  issues: Map<string, Issue>;
  totalReports: Map<string, number>;
}

export function OrgChart({ agents, cid, openTasks, liveRuns, issues, totalReports }: OrgChartProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const layout = useMemo(() => build(agents, collapsed), [agents, collapsed]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const running = useMemo(() => new Map(liveRuns.filter((r) => isActiveRun(r.status)).map((r) => [r.agentId, r])), [liveRuns]);
  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of agents) if (a.reportsTo && byId.has(a.reportsTo)) m.set(a.reportsTo, (m.get(a.reportsTo) ?? 0) + 1);
    return m;
  }, [agents, byId]);

  // Chain of command for the hovered agent: itself, its managers up to the top, and everyone under it.
  const lit = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    let cur = byId.get(hover);
    while (cur?.reportsTo && byId.has(cur.reportsTo)) {
      s.add(cur.reportsTo);
      cur = byId.get(cur.reportsTo);
    }
    const down = (id: string) => agents.filter((a) => a.reportsTo === id).forEach((a) => (s.add(a.id), down(a.id)));
    down(hover);
    return s;
  }, [hover, byId, agents]);

  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const top = 44; // clear the overlay controls
    const fitK = Math.min(1, (el.clientWidth - 16) / layout.width, (el.clientHeight - top - 16) / layout.height);
    if (fitK >= 0.6) {
      setView({ k: fitK, x: (el.clientWidth - layout.width * fitK) / 2, y: top + Math.max(0, (el.clientHeight - top - layout.height * fitK) / 2) });
      return;
    }
    // Too big to fit legibly (small screens, large orgs): stay readable and start at the top of the chart.
    const k = 0.6;
    const root = layout.roots[0];
    const focusX = root ? root.x + W / 2 : layout.width / 2;
    setView({ k, x: el.clientWidth / 2 - focusX * k, y: top });
  }, [layout]);

  useLayoutEffect(fit, [fit]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    // Zoom toward the cursor with ⌘/ctrl + wheel (and trackpad pinch, which sends ctrlKey).
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(1.6, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0025)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [fit]);

  const zoom = (f: number) => {
    const el = viewport.current;
    if (!el) return;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    setView((v) => {
      const k = Math.min(1.6, Math.max(0.3, v.k * f));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  };

  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const edges = layout.all.flatMap((n) => n.children.map((c) => ({ from: n, to: c })));
  const levels = Math.max(0, ...layout.all.map((n) => n.depth)) + 1;
  const managers = [...childCount.values()];
  const span = managers.length ? (managers.reduce((a, b) => a + b, 0) / managers.length).toFixed(1) : "0";

  return (
    <div className="relative">
      <div
        ref={viewport}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cx("dot-grid relative h-[calc(100vh-280px)] min-h-[440px] touch-none overflow-hidden select-none", drag.current?.moved ? "cursor-grabbing" : "cursor-grab")}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
            {edges.map(({ from, to }) => {
              const on = lit ? lit.has(from.agent.id) && lit.has(to.agent.id) : true;
              return (
                <path
                  key={to.agent.id}
                  d={elbow(from.x + W / 2, from.y + H, to.x + W / 2, to.y)}
                  fill="none"
                  stroke={on && lit ? "var(--fg-2)" : "var(--line-3)"}
                  strokeWidth={on && lit ? 1.5 : 1}
                  opacity={lit && !on ? 0.35 : 1}
                  style={{ transition: "stroke 0.2s, opacity 0.2s" }}
                />
              );
            })}
          </svg>

          {layout.all.map((n) => {
            const a = n.agent;
            const run = running.get(a.id);
            const task = run?.issueId ? issues.get(run.issueId) : undefined;
            const reports = childCount.get(a.id) ?? 0;
            const dim = lit && !lit.has(a.id);
            const meta = agentStatusMeta[a.status];
            const pct = a.budgetMonthlyCents ? Math.min(100, (a.spentMonthlyCents / a.budgetMonthlyCents) * 100) : 0;
            return (
              <div key={a.id} className="absolute" style={{ left: n.x, top: n.y, width: W }}>
                <div
                  data-org-node
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHover(a.id)}
                  onMouseLeave={() => setHover((h) => (h === a.id ? null : h))}
                  onFocus={() => setHover(a.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => !drag.current?.moved && navigate(`/${cid}/agents/${a.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/${cid}/agents/${a.id}`)}
                  className={cx(
                    "flex flex-col rounded-md border bg-panel p-3 transition-all duration-200",
                    a.status === "error" && !dim ? "border-fg" : hover === a.id ? "border-fg-3 bg-raised" : "border-line-2",
                    a.status === "terminated" && "opacity-50",
                    dim && "opacity-35",
                  )}
                  style={{ height: H }}
                >
                  <div className="flex items-start gap-2.5">
                    <Avatar name={a.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{a.name}</span>
                        <span className="mono shrink-0 rounded-xs border border-line-2 px-1 text-[9.5px] leading-[14px] text-fg-3 uppercase">{roleLabel(a.role)}</span>
                      </div>
                      <div className="truncate text-xs text-fg-3">{a.title ?? roleLabel(a.role)}</div>
                    </div>
                    <span title={meta?.label} className="mt-1">
                      <StatusGlyph kind={meta?.glyph ?? "idle"} />
                    </span>
                  </div>
                  <div className="mt-auto">
                    {run ? (
                      <div className="mono truncate text-2xs text-fg-2">
                        <span className="text-fg-4">now </span>
                        {task ? `${task.identifier} ${task.title}` : "inbox"}
                      </div>
                    ) : a.status === "error" ? (
                      <div className="mono truncate text-2xs text-fg">↳ {a.errorReason ?? "halted"}</div>
                    ) : (
                      <div className="mono flex items-center gap-2 text-2xs text-fg-4">
                        <span className="truncate">{a.adapterType}</span>
                        <span>·</span>
                        <span className="shrink-0">{openTasks.get(a.id) ?? 0} open</span>
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-line-2">
                        <span className={cx("block h-full", pct >= 90 ? "bg-fg" : "bg-fg-3")} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="mono text-[9.5px] text-fg-4 tnum">{cents(a.spentMonthlyCents)}</span>
                    </div>
                  </div>
                </div>
                {reports > 0 && (
                  <button
                    onClick={() => toggle(a.id)}
                    className="mono absolute left-1/2 -translate-x-1/2 rounded-full border border-line-3 bg-canvas px-1.5 text-[10px] leading-4 text-fg-3 hover:border-fg-3 hover:text-fg"
                    style={{ top: H + 2 }}
                    aria-label={collapsed.has(a.id) ? `Show ${a.name}'s team` : `Hide ${a.name}'s team`}
                    title={collapsed.has(a.id) ? `Show team (${totalReports.get(a.id) ?? reports})` : "Collapse team"}
                  >
                    {collapsed.has(a.id) ? `+${totalReports.get(a.id) ?? reports}` : "−"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* chrome */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <div className="mono pointer-events-auto flex items-center gap-3 rounded-sm border border-line-2 bg-canvas/90 px-2.5 py-1.5 text-2xs whitespace-nowrap text-fg-3 backdrop-blur">
          <span>
            <span className="text-fg">{agents.length}</span> agents
          </span>
          <span>
            <span className="text-fg">{levels}</span> levels
          </span>
          <span className="max-sm:hidden">
            <span className="text-fg">{span}</span> avg reports
          </span>
          {running.size > 0 && (
            <span className="flex items-center gap-1.5">
              <StatusGlyph kind="live" /> <span className="text-fg">{running.size}</span> working
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center rounded-sm border border-line-2 bg-canvas/90 backdrop-blur">
          <IconButton label="Zoom out" size="xs" onClick={() => zoom(1 / 1.2)}>
            <Minus />
          </IconButton>
          <span className="mono w-10 text-center text-2xs text-fg-3 tnum">{Math.round(view.k * 100)}%</span>
          <IconButton label="Zoom in" size="xs" onClick={() => zoom(1.2)}>
            <Plus />
          </IconButton>
          <span className="h-4 w-px bg-line-2" />
          <IconButton label="Fit to screen" size="xs" onClick={fit}>
            <Maximize2 />
          </IconButton>
        </div>
      </div>
      <div className="mono pointer-events-none absolute bottom-3 left-3 text-2xs text-fg-4 max-sm:hidden">Drag to pan · ⌘ + scroll to zoom · hover to trace reporting lines</div>
    </div>
  );
}
