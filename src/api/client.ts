import { ApiError } from "./errors";

export { ApiError };

const BASE = "/api";
function messageFor(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown; details?: Array<{ path?: unknown[]; message?: string }> };
    if (Array.isArray(b.details) && b.details.length) {
      const d = b.details[0]!;
      return `${d.path?.join(".") ?? "field"}: ${d.message ?? "invalid"}`;
    }
    if (typeof b.error === "string") return b.error;
    if (typeof b.message === "string") return b.message;
  }
  if (status === 401) return "You are signed out. Sign in again to continue.";
  if (status === 403) return "You don't have permission to do that";
  if (status === 404) return "Not found";
  if (status >= 500) return `agentox server error (${status})`;
  return `Request failed (${status})`;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the agentox server", null);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, messageFor(res.status, parsed), parsed);
  // A proxy with no backend behind it answers with HTML
  if (typeof parsed === "string" && parsed.trimStart().startsWith("<")) {
    throw new ApiError(0, "Can't reach the agentox server", null);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
