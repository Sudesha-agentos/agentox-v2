import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { HeartbeatRunEvent } from "@/api/types";
import { cx } from "./ui";

type Kind = "system" | "command" | "pass" | "error" | "out";

function classify(e: HeartbeatRunEvent): Kind {
  const m = e.message ?? "";
  if (e.stream === "stderr" || e.level === "error") return "error";
  if (e.stream === "system") return "system";
  if (m.startsWith("$ ")) return "command";
  if (/^(✓|✔|PASS\b)/.test(m)) return "pass";
  return "out";
}

function Marker({ kind }: { kind: Kind }) {
  const base = "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-xs";
  switch (kind) {
    case "system":
      return <span className={cx(base, "bg-fg-3")} />;
    case "command":
      return <span className={cx(base, "mono border border-line-3 text-[9px] text-fg-2")}>›</span>;
    case "pass":
      return <span className={cx(base, "mono border border-line-3 text-[9px] text-fg-2")}>✓</span>;
    case "error":
      return <span className={cx(base, "bg-fg")}><span className="size-1.5 rotate-45 bg-inv-fg" /></span>;
    default:
      return <span className={cx(base, "border border-line-2")} />;
  }
}

/** Run output as a readable transcript. Follows the tail until the user scrolls up. */
export function Transcript({ events, active, empty, className }: { events: HeartbeatRunEvent[]; active: boolean; empty?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const n = events.length;
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [n, follow]);

  return (
    <div className={cx("relative min-h-0", className)}>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 32);
        }}
        className="h-full overflow-y-auto py-1.5"
      >
        {n === 0 ? (
          <div className="mono px-3.5 py-3 text-xs text-fg-4">{empty ?? (active ? "waiting for output…" : "no output recorded")}</div>
        ) : (
          events.map((e, i) => {
            const kind = classify(e);
            const t = new Date(e.createdAt);
            return (
              <div key={`${e.seq}-${i}`} className={cx("flex gap-3 px-3.5 py-[3px] hover:bg-hover", kind === "error" && "bg-raised")}>
                <span className="mono shrink-0 pt-px text-2xs text-fg-4 tnum select-none">
                  {t.toLocaleTimeString(undefined, { hour12: false })}
                  <span className="text-line-3">.{String(t.getMilliseconds()).padStart(3, "0")}</span>
                </span>
                <Marker kind={kind} />
                <span
                  className={cx(
                    "mono min-w-0 flex-1 text-xs leading-5 break-words whitespace-pre-wrap",
                    kind === "system" ? "text-fg-3" : kind === "command" ? "text-fg" : kind === "error" ? "font-medium text-fg" : "text-fg-2",
                  )}
                >
                  {e.message}
                </span>
              </div>
            );
          })
        )}
        {active && n > 0 && (
          <div className="flex gap-3 px-3.5 py-1">
            <span className="mono w-[86px] text-2xs text-fg-4" />
            <span className="blink mt-1 h-3 w-1.5 bg-fg-2" />
          </div>
        )}
      </div>
      {!follow && active && (
        <button onClick={() => setFollow(true)} className="enter absolute right-3 bottom-3 flex h-7 items-center gap-1.5 rounded-sm bg-inv px-2.5 text-xs text-inv-fg shadow-lg">
          <ArrowDown className="size-3" /> Follow tail
        </button>
      )}
    </div>
  );
}
