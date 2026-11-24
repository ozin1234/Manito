import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "./storage.mjs";
import path from "node:path";
import { ApiError } from "./providers.mjs";

const attempts = [];
const TOKEN = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
const equal = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function hashAdminPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("Admin password must be 12–256 characters");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export function adminConfigured(config) {
  return /^[A-Za-z0-9_.@-]{3,80}$/.test(config.adminUsername ?? "") && /^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(config.adminPasswordHash ?? "") && (config.adminSessionSecret?.length ?? 0) >= 32 && Boolean(config.reportsDir);
}
const tag = (config) => createHash("sha256").update(config.adminPasswordHash).digest("hex");
const digest = (token, config) => createHmac("sha256", config.adminSessionSecret).update(token).digest("hex");
const folder = (config) => path.join(config.reportsDir, "_admin_sessions");
function ensure(config) { if (!adminConfigured(config)) throw new ApiError("ADMIN_NOT_CONFIGURED", "기관 관리자 계정을 먼저 설정해 주세요.", 503); }
export async function loginAdmin(body, config) {
  ensure(config);
  const now = Date.now();
  while (attempts.length && now - attempts[0] > 60_000) attempts.shift();
  if (attempts.length >= 8) throw new ApiError("ADMIN_LOGIN_LIMIT", "로그인 시도가 많습니다. 1분 후 다시 시도해 주세요.", 429);
  attempts.push(now);
  if (typeof body?.username !== "string" || typeof body?.password !== "string" || body.username.length > 80 || body.password.length > 256) throw new ApiError("INVALID_LOGIN", "아이디와 비밀번호를 확인해 주세요.", 400);
  const [, salt, expected] = config.adminPasswordHash.split(":");
  const actual = scryptSync(body.password, salt, 32).toString("hex");
  if (!equal(actual, expected) || !equal(body.username, config.adminUsername)) throw new ApiError("INVALID_LOGIN", "아이디 또는 비밀번호가 올바르지 않습니다.", 401);
  const id = randomUUID(), token = `${id}.${randomBytes(32).toString("base64url")}`;
  const session = { id, user: config.adminUsername, role: "agency_admin", tokenDigest: digest(token, config), credentialTag: tag(config), expiresAt: new Date(now + 8 * 3600_000).toISOString() };
  await mkdir(folder(config), { recursive: true, mode: 0o700 });
  await writeFile(path.join(folder(config), `${id}.json`), JSON.stringify(session), { flag: "wx", mode: 0o600 });
  return { token, user: session.user, role: session.role, expiresAt: session.expiresAt };
}
export async function requireAdmin(request, config) {
  ensure(config);
  const token = request.headers.get("x-kroad-admin-session") ?? "";
  const match = TOKEN.exec(token);
  let session;
  if (match) { try { session = JSON.parse(await readFile(path.join(folder(config), `${match[1]}.json`), "utf8")); } catch { /* Invalid or revoked session. */ } }
  if (!session || session.role !== "agency_admin" || session.user !== config.adminUsername || session.credentialTag !== tag(config) || Date.parse(session.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(session.expiresAt)) || !equal(session.tokenDigest, digest(token, config))) throw new ApiError("ADMIN_UNAUTHORIZED", "기관 관리자 로그인이 필요합니다.", 401);
  return { id: session.id, user: session.user, role: session.role, expiresAt: session.expiresAt };
}
export async function logoutAdmin(request, config) {
  const actor = await requireAdmin(request, config);
  await unlink(path.join(folder(config), `${actor.id}.json`));
  return { loggedOut: true };
}
