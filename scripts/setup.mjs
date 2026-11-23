import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashAdminPassword } from "../services/api/src/admin-auth.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env");
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const configured = Object.fromEntries(current.split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
const additions = {};
for (const [key, value] of Object.entries({ MANITO_WEB_PORT: "5174", MANITO_API_PORT: "8790" })) {
  if (!configured[key]) additions[key] = value;
}
if (!configured.GROAD_API_KEY) additions.GROAD_API_KEY = randomBytes(32).toString("hex");
if (!Object.hasOwn(configured, "GEMINI_API_KEY")) additions.GEMINI_API_KEY = "";
if (!configured.UWAT_MODEL) additions.UWAT_MODEL = "gemini-3.8-flash";
if (process.argv.includes("--admin")) {
  if (!configured.KROAD_ADMIN_SESSION_SECRET) additions.KROAD_ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  if (!configured.KROAD_ADMIN_USERNAME) additions.KROAD_ADMIN_USERNAME = "agency-admin";
  if (!configured.KROAD_ADMIN_PASSWORD_HASH) {
    const password = randomBytes(20).toString("base64url");
    additions.KROAD_ADMIN_PASSWORD_HASH = hashAdminPassword(password);
    mkdirSync(path.join(root, ".local"), { recursive: true });
    writeFileSync(path.join(root, ".local/kroad-admin-access.txt"), `K-ROAD local agency management\nURL: http://127.0.0.1:${configured.MANITO_WEB_PORT || additions.MANITO_WEB_PORT || "5174"}/admin\nUsername: ${configured.KROAD_ADMIN_USERNAME || additions.KROAD_ADMIN_USERNAME}\nPassword: ${password}\nPrivate local credentials; never commit or share publicly.\n`, { mode: 0o600 });
  }
}
const networkIndex = process.argv.indexOf("--maps-network");
if (networkIndex !== -1) {
  const network = process.argv[networkIndex + 1];
  if (!network || !/^[A-Za-z0-9_.-]+$/.test(network)) throw new Error("Invalid map-service network name.");
  if (configured.MANITO_MAPS_NETWORK && configured.MANITO_MAPS_NETWORK !== network) throw new Error("A different map-service network is already configured; edit .env explicitly.");
  if (!configured.MANITO_MAPS_NETWORK) additions.MANITO_MAPS_NETWORK = network;
}
if (Object.keys(additions).length) {
  const lines = current.split(/\r?\n/).filter((line) => !Object.hasOwn(additions, line.split("=", 1)[0].trim()));
  const prefix = lines.join("\n").replace(/\n*$/, "");
  writeFileSync(envPath, `${prefix ? prefix + "\n" : ""}${Object.entries(additions).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
}
process.loadEnvFile(envPath);
const port = Number(process.env.MANITO_API_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9_-]{32,}$/.test(process.env.GROAD_API_KEY ?? "")) throw new Error("Invalid API port or internal API key in .env.");
const webRoot = path.join(root, "apps/web");
mkdirSync(webRoot, { recursive: true });
writeFileSync(path.join(webRoot, ".env.local"), `GROAD_INDEPENDENT_API_URL=http://127.0.0.1:${port}\nGROAD_INDEPENDENT_API_KEY=${process.env.GROAD_API_KEY}\n`, { mode: 0o600 });
mkdirSync(path.join(root, ".local/reports"), { recursive: true });
console.log("Manito local settings are ready. Credentials were kept in ignored environment files.");
if (process.argv.includes("--admin")) console.log("K-ROAD admin setup checked. Newly generated local access details are in .local/kroad-admin-access.txt (ignored by Git).");
