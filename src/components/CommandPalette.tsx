import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Activity, Bot, CircleDollarSign, Gauge, Plug, Plus, Radio, Search, Settings, ShieldCheck, SquareCheck, Users } from "lucide-react";
import { useAgents, useIssues } from "@/api/hooks";
import { useCompany } from "@/lib/company";
import { Avatar, Kbd, cx } from "./ui";
import { IssueStatusIcon } from "./status";

type Item = { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void };

export function CommandPalette({ open, onClose, onNewTask }: { open: boolean; onClose: () => void; onNewTask: () => void }) {
  const { id: cid } = useCompany();
  const navigate = useNavigate();
  const { data: issues = [] } = useIssues(cid);
  const { data: agents = [] } = useAgents(cid);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(`/${cid}${path}`);
    };
    const nav: Item[] = [
      { id: "new", group: "Actions", label: "Create task", hint: "C", icon: <Plus />, run: () => (onClose(), onNewTask()) },
      { id: "n-o", group: "Navigate", label: "Overview", icon: <Gauge />, run: go("") },
      { id: "n-l", group: "Navigate", label: "Live", icon: <Radio />, run: go("/live") },
      { id: "n-r", group: "Navigate", label: "Runs", icon: <Activity />, run: go("/runs") },
      { id: "n-t", group: "Navigate", label: "Tasks", icon: <SquareCheck />, run: go("/tasks") },
      { id: "n-ap", group: "Navigate", label: "Approvals", icon: <ShieldCheck />, run: go("/approvals") },
      { id: "n-a", group: "Navigate", label: "Agents", icon: <Bot />, run: go("/agents") },
      { id: "n-m", group: "Navigate", label: "Members", icon: <Users />, run: go("/members") },
      { id: "n-s", group: "Navigate", label: "Spend", icon: <CircleDollarSign />, run: go("/spend") },
      { id: "n-i", group: "Navigate", label: "Integrations", icon: <Plug />, run: go("/integrations") },
      { id: "n-st", group: "Navigate", label: "Settings", icon: <Settings />, run: go("/settings") },
    ];
    const ag: Item[] = agents.map((a) => ({ id: a.id, group: "Agents", label: a.name, hint: a.title ?? a.role, icon: <Avatar name={a.name} size={16} />, run: go(`/agents/${a.id}`) }));
    const is: Item[] = issues.map((i) => ({ id: i.id, group: "Tasks", label: i.title, hint: i.identifier ?? undefined, icon: <IssueStatusIcon status={i.status} />, run: go(`/tasks/${i.id}`) }));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...nav, ...ag.slice(0, 5), ...is.slice(0, 6)];
    const match = (it: Item) => it.label.toLowerCase().includes(needle) || it.hint?.toLowerCase().includes(needle);
    return [...nav.filter(match), ...ag.filter(match), ...is.filter(match).slice(0, 30)];
  }, [q, issues, agents, cid, navigate, onClose, onNewTask]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="enter w-full max-w-xl overflow-hidden rounded-md border border-line-2 bg-panel shadow-[0_24px_80px_-12px_rgba(0,0,0,0.6)]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command menu">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search className="size-4 text-fg-4" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") items[active]?.run();
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Type a command or search"
            className="h-11 flex-1 bg-transparent text-md outline-none placeholder:text-fg-4"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1">
          {items.length === 0 && <div className="px-3 py-8 text-center text-sm text-fg-3">No results for “{q}”</div>}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={`${it.group}-${it.id}`}>
                {header && <div className="mono px-2.5 pt-2.5 pb-1 text-2xs tracking-wider text-fg-4 uppercase">{header}</div>}
                <button
                  data-idx={idx}
                  onMouseMove={() => setActive(idx)}
                  onClick={it.run}
                  className={cx("flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm [&_svg]:size-3.5", idx === active ? "bg-active text-fg" : "text-fg-2")}
                >
                  <span className="flex w-4 justify-center text-fg-3">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="mono shrink-0 text-2xs text-fg-4">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
