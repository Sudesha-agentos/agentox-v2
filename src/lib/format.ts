export function timeAgo(input: string | number | Date | null | undefined): string {
  if (!input) return "-";
  const d = new Date(input).getTime();
  if (Number.isNaN(d)) return "-";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateTime(input: string | null | undefined): string {
  if (!input) return "-";
  return new Date(input).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(start?: string | null, end?: string | null): string {
  if (!start) return "-";
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 0) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function cents(value: number | null | undefined): string {
  const v = (value ?? 0) / 100;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: 2 });
}

export function compact(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** 24h wall-clock time, e.g. 14:03:22. Today shows time only; older shows month/day. */
export function clock(input: string | null | undefined, seconds = false): string {
  if (!input) return "-";
  const d = new Date(input);
  const today = new Date().toDateString() === d.toDateString();
  if (!today) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: false });
}

export function usd(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export function roleLabel(role: string): string {
  return role.length <= 3 ? role.toUpperCase() : titleCase(role);
}
