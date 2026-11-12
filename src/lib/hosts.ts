/**
 * One build serves two addresses in production:
 *   marketing (agentox.io, www)  →  the product page only
 *   app       (app.agentox.io)   →  sign-in and the app
 * In development neither origin is set, so everything runs on one host as before.
 */
const env = import.meta.env;

export const MARKETING_ORIGIN: string | undefined = env.VITE_MARKETING_ORIGIN || undefined;
export const APP_ORIGIN: string | undefined = env.VITE_APP_ORIGIN || undefined;

const marketingHosts = new Set(
  String(env.VITE_MARKETING_HOSTS ?? "")
    .split(",")
    .map((h: string) => h.trim().toLowerCase())
    .filter(Boolean),
);

/** True when this page is being served from the marketing address. */
export const isMarketingHost = typeof window !== "undefined" && marketingHosts.has(window.location.hostname.toLowerCase());

/** True when the product page lives on its own address, so the app should not show it. */
export const hasSeparateMarketing = !!MARKETING_ORIGIN && !isMarketingHost;

/** A link into the app: absolute from the marketing site, relative inside the app. */
export function appHref(path: string): string {
  return isMarketingHost && APP_ORIGIN ? `${APP_ORIGIN}${path}` : path;
}

/** A link to the product page: the marketing origin when it is separate. */
export function productHref(): string {
  return hasSeparateMarketing ? `${MARKETING_ORIGIN}/` : "/product";
}
