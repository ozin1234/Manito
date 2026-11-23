import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2];
if (!["build", "dev"].includes(command)) throw new Error("Expected build or dev.");
const child = spawn(process.execPath, ["scripts/run-framework.mjs", command, ...process.argv.slice(3)], { cwd: path.join(root, "apps/web"), stdio: "inherit" });
child.on("error", () => { console.error("Cannot launch the web application."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
