#!/usr/bin/env node
// agentox server launcher.
//
//   npm run server                    start (first run sets up an embedded database)
//   npm run server -- doctor          diagnose the local install
//   npm run server -- auth bootstrap-ceo   print a first-admin invite (public servers)
//
// Configuration uses AGENTOX_* variables and keeps all data under ~/.agentox.
// The engine package is pinned below and installed on first use.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENGINE = "paperclipai@2026.1106.0";
const DATA_DIR = process.env.AGENTOX_DATA_DIR || join(homedir(), ".agentox", "server");
const PORT = process.env.AGENTOX_PORT || "3100";

const [major] = process.versions.node.split(".").map(Number);
if (major < 24) {
  console.error(`agentox server needs Node 24 or newer (found ${process.versions.node}).`);
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
const fresh = readdirSync(DATA_DIR).length === 0;
const passthrough = process.argv.slice(2);

// First run: non-interactive setup that starts the server straight away.
// Later runs: start the existing install. Extra arguments go to the engine as-is.
const args = passthrough.length ? passthrough : fresh ? ["onboard", "--yes", "--no-install-service"] : ["run"];
if (!args.includes("--data-dir") && !args.includes("-d")) args.push("--data-dir", DATA_DIR);

// Map agentox settings onto the engine's own variable names.
const env = { ...process.env, PORT };
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("AGENTOX_ENGINE_")) env[`PAPERCLIP_${key.slice("AGENTOX_ENGINE_".length)}`] = value;
}
if (process.env.AGENTOX_DATABASE_URL) env.DATABASE_URL = process.env.AGENTOX_DATABASE_URL;

console.log(`agentox server · data ${DATA_DIR} · port ${PORT}${fresh ? " · first run" : ""}`);
const child = spawn("npx", ["--yes", ENGINE, ...args], { stdio: "inherit", env, shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
