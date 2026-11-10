import { useSyncExternalStore } from "react";

type Toast = { id: number; kind: "ok" | "error"; text: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Toast["kind"] = "ok") {
  const t = { id: nextId++, kind, text };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, kind === "error" ? 6000 : 2800);
}

export function toastError(err: unknown) {
  toast(err instanceof Error ? err.message : String(err), "error");
}

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-1.5" aria-live="polite">
      {list.map((t) =>
        t.kind === "error" ? (
          <div key={t.id} role="alert" className="enter pointer-events-auto flex items-start gap-2.5 rounded-sm bg-inv px-3 py-2.5 text-sm text-inv-fg shadow-lg">
            <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-inv-fg" />
            <span className="min-w-0 break-words">{t.text}</span>
          </div>
        ) : (
          <div key={t.id} className="enter pointer-events-auto flex items-start gap-2.5 rounded-sm border border-line-2 bg-raised px-3 py-2.5 text-sm shadow-lg">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-2" />
            <span className="min-w-0 break-words">{t.text}</span>
          </div>
        ),
      )}
    </div>
  );
}
