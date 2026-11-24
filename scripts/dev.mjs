import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!existsSync(path.join(root, ".env"))) throw new Error("Run node scripts/setup.mjs first.");
process.loadEnvFile(path.join(root, ".env"));
const webPort = Number(process.env.MANITO_WEB_PORT || "5174");
const apiPort = Number(process.env.MANITO_API_PORT || "8790");
if (![webPort, apiPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535) || webPort === apiPort) throw new Error("Invalid or duplicate Manito ports.");
if (!process.env.KROAD_API_KEY || process.env.KROAD_API_KEY.length < 32) throw new Error("Missing internal API key; run setup first.");
for (const port of [webPort, apiPort]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is already in use; no existing service was stopped.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(args, options) {
  const child = spawn(process.execPath, args, { stdio: "inherit", ...options });
  children.push(child);
  child.on("error", () => { console.error("A Manito development process could not start."); stop(1); });
  child.on("exit", (code) => { if (!stopping) stop(code || 1); });
  return child;
}
start(["src/server.mjs"], { cwd: path.join(root, "services/api"), env: { ...process.env, HOST: "127.0.0.1", PORT: String(apiPort), KROAD_REPORTS_DIR: path.join(root, ".local/reports") } });
for (let attempt = 0; attempt < 30; attempt++) {
  if (stopping) break;
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) break;
  } catch {}
  if (attempt === 29) { stop(1); throw new Error("Manito API did not become ready."); }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!stopping) {
  start(["scripts/run-framework.mjs", "dev", "--port", String(webPort), "--hostname", "127.0.0.1"], { cwd: path.join(root, "apps/web"), env: { ...process.env, KROAD_API_URL: `http://127.0.0.1:${apiPort}`, KROAD_API_KEY: process.env.KROAD_API_KEY } });
  console.log(`Manito web: http://127.0.0.1:${webPort}/`);
  console.log("Reports use Manito storage. Phone GPS still requires a separately configured HTTPS address.");
}
