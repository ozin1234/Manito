import { ApiError } from "./providers.mjs";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const cache = new Map();
const ttlMs = 60_000;
const shapeIndexes = new Map();

function shapes(configuredPath) {
  const file = configuredPath ?? fileURLToPath(new URL("../data/its-link-shapes.json.gz", import.meta.url));
  if (shapeIndexes.has(file)) return shapeIndexes.get(file);
  let shapeIndex;
  try {
    const bytes = readFileSync(file);
    shapeIndex = JSON.parse((file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"));
  } catch { shapeIndex = {}; }
  shapeIndexes.set(file, shapeIndex);
  return shapeIndex;
}

export function parseTrafficDate(value) {
  if (!/^\d{14}$/.test(String(value))) return null;
  const text = String(value);
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function normalizeTraffic(payload, now = Date.now()) {
  const response = payload?.response ?? payload;
  const header = response?.header ?? {};
  const code = Number(header.resultCode ?? header.resultcode);
  if (code !== 0) throw new ApiError("TRAFFIC_SOURCE_ERROR", "실시간 교통정보 원본 응답을 확인할 수 없습니다.", 502);
  const raw = Array.isArray(response?.body?.items) ? response.body.items : response?.body?.items?.item ?? [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const segments = rows.map((row) => {
    const speedValue = row.speed ?? row.SPEED;
    const speedKph = speedValue == null || String(speedValue).trim() === "" ? NaN : Number(speedValue);
    const collectedAt = parseTrafficDate(row.createdDate ?? row.createddate);
    return {
      linkId: String(row.linkId ?? row.linkid ?? ""),
      roadName: String(row.roadName ?? row.roadname ?? ""),
      speedKph,
      collectedAt,
      isFresh: Boolean(collectedAt && now - Date.parse(collectedAt) >= -300_000 && now - Date.parse(collectedAt) <= 900_000),
    };
  }).filter((row) => row.linkId && row.roadName && Number.isFinite(row.speedKph) && row.speedKph >= 0 && row.speedKph <= 180);
  return { segments, source: "국가교통정보센터 ITS", retrievedAt: new Date(now).toISOString() };
}

export async function getTraffic(bbox, apiKey, shapesPath) {
  if (!apiKey) return { available: false, reason: "ITS_API_KEY_REQUIRED", source: "국가교통정보센터 ITS", isLive: false, segments: [] };
  const cacheKey = `${shapesPath ?? "default"}:${bbox.map((value) => value.toFixed(2)).join(",")}`;
  const stored = cache.get(cacheKey);
  if (stored && Date.now() - stored.cachedAt < ttlMs) return stored.data;
  const source = new URL("https://openapi.its.go.kr:9443/trafficInfo");
  source.search = new URLSearchParams({ apiKey, type: "all", drcType: "all", minX: String(bbox[0]), minY: String(bbox[1]), maxX: String(bbox[2]), maxY: String(bbox[3]), getType: "json" }).toString();
  let response;
  try { response = await fetch(source, { signal: AbortSignal.timeout(60_000) }); }
  catch { throw new ApiError("TRAFFIC_SOURCE_UNAVAILABLE", "ITS 교통정보 서버에 연결할 수 없습니다.", 503); }
  if (!response.ok) throw new ApiError("TRAFFIC_SOURCE_ERROR", "ITS 교통정보 인증 또는 응답을 확인해 주세요.", 502);
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError("TRAFFIC_SOURCE_ERROR", "ITS 교통정보 응답 형식이 올바르지 않습니다.", 502); }
  const normalized = normalizeTraffic(payload);
  const fresh = normalized.segments.filter((row) => row.isFresh);
  const slowest = [...fresh].sort((a, b) => a.speedKph - b.speedKph).slice(0, 8);
  const index = shapes(shapesPath);
  const matched = fresh.filter((row) => index[row.linkId]);
  matched.sort((a, b) => a.speedKph - b.speedKph);
  const stride = Math.max(1, Math.ceil(matched.length / 600));
  const segments = matched.filter((_, position) => position % stride === 0).map((row) => ({ ...row, geometry: index[row.linkId] }));
  const data = { available: true, isLive: fresh.length > 0, ...normalized, count: normalized.segments.length, freshCount: fresh.length, matchedCount: matched.length, geometrySource: "국토교통부 표준 노드·링크 2025", slowest, segments };
  if (cache.size >= 16) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { cachedAt: Date.now(), data });
  return data;
}
