import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- brand */

export function Mark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={className} aria-hidden>
      <rect x="1" y="1" width="7" height="7" fill="currentColor" />
      <rect x="10.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" />
      <rect x="1.5" y="10.5" width="6" height="6" fill="none" stroke="currentColor" />
      <rect x="10" y="10" width="7" height="7" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-medium tracking-tight", className)}>
      <Mark />
      agentox
    </span>
  );
}

/* --------------------------------------------------------------- buttons */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md";

const buttonSize: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-xs gap-1 [&_svg]:size-3",
  sm: "h-7 px-2.5 text-sm gap-1.5 [&_svg]:size-3.5",
  md: "h-8 px-3 text-base gap-1.5 [&_svg]:size-3.5",
};

const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-inv text-inv-fg hover:opacity-85 font-medium",
  secondary: "border border-line-2 bg-panel text-fg hover:bg-hover hover:border-line-3",
  ghost: "text-fg-2 hover:text-fg hover:bg-hover",
  // Destructive stays monochrome: outlined, inverts on hover so the commit moment is unmistakable.
  danger: "border border-line-3 text-fg hover:bg-inv hover:text-inv-fg hover:border-inv",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode; kbd?: string }
>(function Button({ variant = "secondary", size = "sm", loading, icon, kbd, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-sm whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40",
        buttonSize[size],
        buttonVariant[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {kbd && <span className={cx("mono ml-1 text-2xs", variant === "primary" ? "opacity-60" : "text-fg-4")}>{kbd}</span>}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "xs" | "sm" }>(function IconButton(
  { label, size = "sm", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-sm text-fg-3 transition-colors hover:bg-hover hover:text-fg disabled:opacity-40",
        size === "xs" ? "size-6 [&_svg]:size-3.5" : "size-7 [&_svg]:size-4",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("spin inline-block size-3 shrink-0 rounded-full border border-current border-t-transparent", className)} aria-hidden />;
}

/* ---------------------------------------------------------------- fields */

const width = (className?: string) => (className && /(^|\s)w-/.test(className) ? "" : "w-full");
const fieldBase =
  "rounded-sm border border-line-2 bg-canvas px-2.5 text-base text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-fg-3 focus:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, width(className), "h-8", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, width(className), "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-flex", width(className), className?.match(/(^|\s)w-\S+/)?.[0])}>
      <select className={cx(fieldBase, "h-8 w-full cursor-pointer appearance-none pr-7", className?.replace(/(^|\s)w-\S+/g, ""))} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-3" />
    </span>
  );
}

export function Field({ label, hint, error, children, aside }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; aside?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs text-fg-2">
        {label}
        {aside}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-fg">↳ {error}</span> : hint ? <span className="mt-1.5 block text-xs text-fg-3">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-2 select-none hover:text-fg">
      <span className={cx("flex size-3.5 items-center justify-center rounded-xs border", checked ? "border-fg bg-fg" : "border-line-3")}>
        {checked && (
          <svg viewBox="0 0 10 10" className="size-2.5 text-inv-fg">
            <path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* --------------------------------------------------------------- surfaces */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-md border border-line bg-panel", className)}>{children}</section>;
}

export function PanelHeader({ title, meta, action, className }: { title: ReactNode; meta?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cx("flex h-10 items-center gap-3 border-b border-line px-3.5", className)}>
      <h2 className="text-sm font-medium">{title}</h2>
      {meta && <span className="mono text-xs text-fg-3">{meta}</span>}
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </header>
  );
}

/** Section label, Laminar style: numbered, small, muted. */
export function Eyebrow({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <div className="mono mb-2 flex items-center gap-2 text-2xs tracking-wider text-fg-3 uppercase">
      {n && <span className="text-fg-4">{n}</span>}
      {children}
    </div>
  );
}

/* ----------------------------------------------------- status + metadata */

export type Glyph = "live" | "ok" | "idle" | "paused" | "queued" | "error" | "off";

/** Status is encoded by shape, not color. */
export function StatusGlyph({ kind, className }: { kind: Glyph; className?: string }) {
  const base = cx("shrink-0", kind !== "paused" && "inline-block", className);
  switch (kind) {
    case "live":
      return <span className={cx(base, "blink size-2 rounded-full bg-fg ring-2 ring-fg/20")} aria-hidden />;
    case "ok":
      return <span className={cx(base, "size-2 rounded-full bg-fg-2")} aria-hidden />;
    case "idle":
      return <span className={cx(base, "size-2 rounded-full border border-fg-3")} aria-hidden />;
    case "queued":
      return <span className={cx(base, "size-2 rounded-full border border-dashed border-fg-3")} aria-hidden />;
    case "paused":
      return (
        <span className={cx(base, "inline-flex h-2 w-2 items-stretch justify-between")} aria-hidden>
          <span className="w-[2.5px] bg-fg-3" />
          <span className="w-[2.5px] bg-fg-3" />
        </span>
      );
    case "error":
      return <span className={cx(base, "size-2 rotate-45 bg-fg")} aria-hidden />;
    case "off":
      return <span className={cx(base, "h-px w-2 bg-fg-4")} aria-hidden />;
  }
}

export function Status({ kind, children, className }: { kind: Glyph; children: ReactNode; className?: string }) {
  if (kind === "error") {
    return (
      <span className={cx("inline-flex h-5 items-center gap-1.5 rounded-xs bg-inv px-1.5 text-xs font-medium whitespace-nowrap text-inv-fg", className)}>
        <span className="size-1.5 rotate-45 bg-inv-fg" />
        {children}
      </span>
    );
  }
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", kind === "live" ? "text-fg" : kind === "off" ? "text-fg-4" : "text-fg-2", className)}>
      <StatusGlyph kind={kind} />
      {children}
    </span>
  );
}

/** Monospace metric chip: duration, tokens, cost, ids. */
export function Chip({ icon, children, className, title }: { icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("mono inline-flex h-5 items-center gap-1 rounded-xs border border-line-2 bg-raised px-1.5 text-xs whitespace-nowrap text-fg-2 tnum [&_svg]:size-3 [&_svg]:text-fg-3", className)}>
      {icon}
      {children}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex h-5 items-center rounded-xs border border-line-2 px-1.5 text-xs whitespace-nowrap text-fg-2", className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mono inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-xs border border-line-2 px-1 text-2xs text-fg-3">{children}</kbd>;
}

/** Monochrome identity: initials in a bordered square. Agents square, humans round. */
export function Avatar({ name, size = 22, human, className }: { name: string; size?: number; human?: boolean; className?: string }) {
  const initials =
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cx("mono inline-flex shrink-0 items-center justify-center border border-line-3 bg-raised font-medium text-fg-2", human ? "rounded-full" : "rounded-xs", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Usage meter. Hatched once it crosses the warning threshold. */
export function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx("h-1 w-full overflow-hidden rounded-full bg-line-2", className)} role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full", pct >= 90 ? "hatch bg-fg" : "bg-fg-2")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------ navigation */

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={cx("flex gap-4 border-b border-line", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx("-mb-px flex h-9 items-center gap-1.5 border-b text-sm transition-colors", value === it.value ? "border-fg text-fg" : "border-transparent text-fg-3 hover:text-fg-2")}
        >
          {it.label}
          {it.count !== undefined && <span className="mono text-xs text-fg-4">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; icon?: ReactNode }> }) {
  return (
    <div className="inline-flex h-7 items-center rounded-sm border border-line-2 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          aria-pressed={value === it.value}
          className={cx("flex h-full items-center gap-1.5 rounded-xs px-2 text-xs transition-colors [&_svg]:size-3.5", value === it.value ? "bg-active text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- overlays */

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx("enter w-full rounded-md border border-line-2 bg-panel shadow-[0_24px_80px_-12px_rgba(0,0,0,0.6)]", size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-3">
          <div>
            <h2 className="text-md font-medium">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
          </div>
          <IconButton label="Close" size="xs" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <div className="space-y-4 px-4 pb-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Right-hand sheet for drilling into a row without losing the list. */
export function Sheet({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <aside
        className="enter absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-line-2 bg-panel shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.5)]"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export type MenuItem = { label: ReactNode; icon?: ReactNode; onSelect: () => void; destructive?: boolean; checked?: boolean; hint?: ReactNode } | "separator";

export function Menu({ trigger, items, align = "start", width = 200 }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean }) => ReactNode; items: MenuItem[]; align?: "start" | "end"; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {open && (
        <div role="menu" className={cx("enter absolute top-full z-50 mt-1 rounded-md border border-line-2 bg-raised p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]", align === "end" ? "right-0" : "left-0")} style={{ width }}>
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={i} className="my-1 h-px bg-line-2" />
            ) : (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cx("flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-active [&_svg]:size-3.5 [&_svg]:text-fg-3", it.destructive ? "text-fg" : "text-fg-2 hover:text-fg")}
              >
                {it.icon}
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="mono text-2xs text-fg-4">{it.hint}</span>}
                {it.checked && <span className="size-1.5 rounded-full bg-fg" />}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- tables */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" }) {
  return <th className={cx("h-8 border-b border-line px-3.5 text-xs font-normal whitespace-nowrap text-fg-3", align === "right" ? "text-right" : "text-left", className)}>{children}</th>;
}

export function Td({ children, className, align, mono }: { children?: ReactNode; className?: string; align?: "right"; mono?: boolean }) {
  return <td className={cx("h-9 px-3.5", align === "right" && "text-right", mono && "mono tnum text-xs text-fg-2", className)}>{children}</td>;
}

export function Tr({ children, onClick, className, flash }: { children: ReactNode; onClick?: () => void; className?: string; flash?: boolean }) {
  return (
    <tr onClick={onClick} className={cx("border-b border-line last:border-b-0", onClick && "cursor-pointer hover:bg-hover", flash && "row-flash", className)}>
      {children}
    </tr>
  );
}

/* ------------------------------------------------------------ feedback */

export function Empty({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("dot-grid flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex size-8 items-center justify-center rounded-sm border border-line-2 bg-panel">
        <span className="size-1.5 rounded-full bg-fg-4" />
      </div>
      <div className="text-base font-medium">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-fg-3">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, width }: { className?: string; width?: string }) {
  return <div className={cx("skeleton", className)} style={width ? { width } : undefined} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-3 px-3.5">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3" width={`${30 + ((i * 37) % 45)}%`} />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-center gap-3 rounded-sm border border-line-3 bg-raised px-3 py-2.5 text-sm">
      <span className="size-2 shrink-0 rotate-45 bg-fg" />
      <span className="min-w-0 flex-1 break-words">{msg}</span>
      {onRetry && (
        <Button size="xs" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- layout */

export function PageHeader({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-3">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mb-3 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function DL({ items, className }: { items: Array<[ReactNode, ReactNode] | null | false>; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 text-sm", className)}>
      {items.filter(Boolean).map((row, i) => {
        const [k, v] = row as [ReactNode, ReactNode];
        return (
          <div key={i} className="contents">
            <dt className="border-b border-line py-2 text-fg-3">{k}</dt>
            <dd className="min-w-0 truncate border-b border-line py-2 text-right">{v}</dd>
          </div>
        );
      })}
    </dl>
  );
}
