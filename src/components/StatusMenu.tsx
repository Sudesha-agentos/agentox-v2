import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ISSUE_STATUSES, type IssueStatus } from "@/api/types";
import { IssueStatusIcon, issueStatusMeta } from "./status";
import { cx } from "./ui";

export function StatusMenu({ value, onChange, compact }: { value: IssueStatus; onChange: (s: IssueStatus) => void; compact?: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - 180);
    const top = r.bottom + 4 + 240 > window.innerHeight ? r.top - 244 : r.bottom + 4;
    setPos({ top, left });
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
        className={cx("flex shrink-0 items-center gap-2 rounded-sm transition-colors hover:bg-active", compact ? "p-0.5" : "h-7 border border-line-2 px-2 text-sm")}
        aria-label={`Status: ${issueStatusMeta[value].label}`}
      >
        <IssueStatusIcon status={value} />
        {!compact && issueStatusMeta[value].label}
      </button>
      {pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
            <div role="menu" className="enter fixed z-50 w-44 rounded-md border border-line-2 bg-raised p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]" style={pos}>
              {ISSUE_STATUSES.map((s) => (
                <button
                  key={s}
                  role="menuitem"
                  onClick={() => {
                    setPos(null);
                    if (s !== value) onChange(s);
                  }}
                  className={cx("flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-active", s === value ? "text-fg" : "text-fg-2")}
                >
                  <IssueStatusIcon status={s} />
                  <span className="flex-1">{issueStatusMeta[s].label}</span>
                  {s === value && <span className="size-1.5 rounded-full bg-fg" />}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
