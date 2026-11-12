import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";

/**
 * /api proxy to the agentox server, shared by `vite` and `vite preview`.
 *
 * The browser's Host is kept (no changeOrigin) and also sent as X-Forwarded-Host/Proto.
 * The server trusts a change request only when the browser's Origin matches the host it
 * was addressed to, and it builds OAuth return URLs from that same address. Rewriting the
 * Host to the server's own port would make every mutation fail with "Board mutation requires
 * trusted browser origin" in authenticated mode.
 */
function apiProxy(target: string): Record<string, ProxyOptions> {
  const forward = (proxyReq: { setHeader: (k: string, v: string) => void }, req: IncomingMessage) => {
    const host = req.headers.host;
    if (!host) return;
    proxyReq.setHeader("x-forwarded-host", host);
    const upstream = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(upstream) ? upstream[0] : upstream;
    const tls = (req.socket as { encrypted?: boolean }).encrypted === true;
    proxyReq.setHeader("x-forwarded-proto", proto ?? (tls ? "https" : "http"));
  };
  return {
    "/api": {
      target,
      ws: true,
      configure: (proxy) => {
        proxy.on("proxyReq", forward);
        proxy.on("proxyReqWs", forward);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.AGENTOX_SERVER_URL || "http://localhost:3100";
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { port: 5180, proxy: apiProxy(target) },
    preview: { port: 5181, proxy: apiProxy(target) },
  };
});
