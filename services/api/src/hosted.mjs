import { randomUUID } from "node:crypto";
import { handle } from "./api.mjs";
import { cloudStorage } from "./cloud-storage.mjs";
import { withStorage } from "./storage.mjs";
import { DEFAULT_UWAT_MODEL } from "./assistant.mjs";
const problem = (code, message, status) => Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
async function limited(db, kind, maximum) {
  const now = Date.now(), key = kind + ":" + Math.floor(now / 60_000);
  const row = await db.prepare("INSERT INTO kroad_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key, now + 600_000).first();
  await db.prepare("DELETE FROM kroad_limits WHERE expires_at<?").bind(now).run();
  return row.count > maximum;
}
export async function hostedRequest(request, env) {
  const url = new URL(request.url);
  if (!env.DB || !env.BUCKET || (env.GROAD_API_KEY?.length ?? 0) < 32) return problem("CLOUD_NOT_CONFIGURED", "K-ROAD 운영 저장소 설정을 확인해 주세요.", 503);
  const origin = request.headers.get("origin");
  const write = !["GET", "HEAD"].includes(request.method);
  if (write && origin && origin !== new URL(env.KROAD_PUBLIC_ORIGIN || request.url).origin) return problem("INVALID_ORIGIN", "같은 사이트에서 다시 요청해 주세요.", 403);
  const tile = /^\/v1\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(url.pathname);
  if (tile && request.method === "GET") {
    const [z,x,y] = tile.slice(1).map(Number);
    if (z > 19 || x >= 2 ** z || y >= 2 ** z) return problem("INVALID_TILE", "지도 좌표를 확인해 주세요.", 400);
    try {
      const response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
        headers: { "User-Agent": "K-ROAD/1.0 (+https://github.com/ozin1234/Manito)", Referer: env.KROAD_PUBLIC_ORIGIN || url.origin },
        signal: AbortSignal.timeout(20_000), cf: { cacheEverything: true, cacheTtl: 604800 },
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error();
      const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=604800"); headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: 200, headers });
    } catch { return problem("TILE_UNAVAILABLE", "지도 원본 서버에 연결할 수 없습니다.", 503); }
  }
  let lease;
  try {
    if (write) {
      const kind = url.pathname === "/v1/admin/login" ? "login" : url.pathname === "/v1/assistant/chat" ? "analysis" : "write";
      if (await limited(env.DB, kind, kind === "login" ? 8 : kind === "analysis" ? 30 : 120)) return problem("REQUEST_LIMIT", "요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
      lease = randomUUID();
      const now = Date.now();
      const lock = await env.DB.prepare("INSERT INTO kroad_leases(name,owner,expires_at) VALUES('writer',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<? RETURNING owner").bind(lease, now + 120_000, now).first();
      if (lock?.owner !== lease) return problem("REQUEST_BUSY", "이전 저장 또는 사진 분석을 처리 중입니다. 잠시 후 다시 요청해 주세요.", 409);
    }
    const headers = new Headers(request.headers); headers.set("Authorization", `Bearer ${env.GROAD_API_KEY}`);
    return await withStorage(cloudStorage(env.DB, env.BUCKET, lease), () => handle(new Request(request, { headers }), {
      key: env.GROAD_API_KEY, reportsDir: "/kroad", geminiApiKey: env.GEMINI_API_KEY,
      uwatModel: env.UWAT_MODEL || DEFAULT_UWAT_MODEL,
      adminUsername: env.KROAD_ADMIN_USERNAME, adminPasswordHash: env.KROAD_ADMIN_PASSWORD_HASH, adminSessionSecret: env.KROAD_ADMIN_SESSION_SECRET,
      osrmUrl: env.OSRM_URL, nominatimUrl: env.NOMINATIM_URL, tilesUrl: env.TILES_URL,
    }));
  } catch { return problem("CLOUD_STORAGE_UNAVAILABLE", "운영 저장소 요청을 완료하지 못했습니다. 입력은 유지됩니다.", 503); }
  finally { if (lease) await env.DB.prepare("DELETE FROM kroad_leases WHERE name='writer' AND owner=?").bind(lease).run().catch(() => {}); }
}
