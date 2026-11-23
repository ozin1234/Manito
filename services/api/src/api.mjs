import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validPoint } from "./geo.mjs";
import { ApiError, matchTrace, planRoute, searchPlaces } from "./providers.mjs";
import { getTraffic } from "./traffic.mjs";
import { createReport, getReportPhoto, listReports } from "./reports.mjs";
import { assistantStatus, assistantTurn, commitAssistant } from "./assistant.mjs";
import { adminConfigured, loginAdmin, logoutAdmin, requireAdmin } from "./admin-auth.mjs";
import { listCases, getCase, updateCase, publicProgress } from "./management.mjs";

const riskFeed = JSON.parse(readFileSync(fileURLToPath(new URL("./risk-feed.json", import.meta.url)), "utf8"));
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const problem = (code, message, status) => json({ version: "1", error: { code, message } }, status);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

function authorized(request, key) {
  if (!key || key.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function bodyJson(request, limit = 8192) {
  const raw = await request.text();
  if (raw.length > limit) throw new ApiError("REQUEST_TOO_LARGE", "요청 본문이 너무 큽니다.", 413);
  try { return JSON.parse(raw); }
  catch { throw new ApiError("INVALID_JSON", "JSON 요청 본문이 필요합니다.", 400); }
}

function validateRoute(body) {
  if (!validPoint(body?.origin) || !validPoint(body?.destination))
    throw new ApiError("INVALID_COORDINATE", "국내 출발지와 목적지의 좌표가 필요합니다.", 400);
  if (body.option !== undefined && body.option !== "recommended")
    throw new ApiError("INVALID_OPTION", "현재 독립 엔진은 recommended 옵션만 지원합니다.", 400);
}

function risk(url) {
  const band = url.searchParams.get("band");
  const limit = Number(url.searchParams.get("limit") ?? "48");
  if (band && !["심각", "위험", "주의", "안전"].includes(band)) throw new ApiError("INVALID_BAND", "band 값이 올바르지 않습니다.", 400);
  if (!Number.isInteger(limit) || limit < 1 || limit > 48) throw new ApiError("INVALID_LIMIT", "limit은 1~48이어야 합니다.", 400);
  const bboxText = url.searchParams.get("bbox");
  const bbox = bboxText?.split(",").map(Number);
  if (bboxText && (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]))
    throw new ApiError("INVALID_BBOX", "bbox는 minLng,minLat,maxLng,maxLat 형식이어야 합니다.", 400);
  const segments = riskFeed.segments.filter((segment) =>
    (!band || segment.riskBand === band) &&
    (!bbox || (segment.lng >= bbox[0] && segment.lng <= bbox[2] && segment.lat >= bbox[1] && segment.lat <= bbox[3]))
  ).slice(0, limit);
  return { version: "1", dataMode: "validated_demo", samplePeriod: "2025", isLiveRisk: false, count: segments.length, segments };
}

function trace(body) {
  const points = body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 20 ||
      points.some((point) => !validPoint(point) || !Number.isFinite(point.accuracy) || point.accuracy < 1 || point.accuracy > 80 || !Number.isFinite(point.timestamp)) ||
      points.some((point, index) => index && point.timestamp <= points[index - 1].timestamp))
    throw new ApiError("INVALID_TRACE", "시간순 GPS 좌표 2~20개와 정확도가 필요합니다.", 400);
  return points;
}

export async function handle(request, config) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health")
      return json({ status: "ok", version: "1", engine: "groad-osrm" });
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/v1"))
      return json({ name: "G-ROAD Independent API", version: "1", authentication: "Bearer key", roadSource: "OpenStreetMap", satelliteSource: "ESA WorldCover 2021 / Copernicus Sentinel-2", endpoints: ["GET /v1/places", "POST /v1/routes/driving", "POST /v1/navigation/replan", "POST /v1/navigation/match", "GET /v1/risk/segments", "GET /v1/traffic/segments", "GET /v1/reports", "POST /v1/reports", "GET /v1/reports/{id}/photo", "GET /v1/tiles/{z}/{x}/{y}.png", "GET /v1/tiles/satellite/{z}/{x}/{y}.png"] });
    if (!authorized(request, config.key)) return problem("UNAUTHORIZED", "유효한 G-ROAD API 키가 필요합니다.", 401);

    if (url.pathname === "/v1/admin/status" && request.method === "GET") return json({ configured: adminConfigured(config), officialSubmissionConnected: false });
    if (url.pathname === "/v1/admin/login" && request.method === "POST") return json(await loginAdmin(await bodyJson(request), config));
    if (url.pathname.startsWith("/v1/admin/")) {
      const actor = await requireAdmin(request, config);
      if (url.pathname === "/v1/admin/session" && request.method === "GET") return json({ user: actor.user, role: actor.role, expiresAt: actor.expiresAt });
      if (url.pathname === "/v1/admin/logout" && request.method === "POST") return json(await logoutAdmin(request, config));
      if (url.pathname === "/v1/admin/cases" && request.method === "GET") return json(await listCases(config, url));
      const caseMatch = /^\/v1\/admin\/cases\/([^/]+)$/.exec(url.pathname);
      if (caseMatch && request.method === "GET") return json({ case: await getCase(config, caseMatch[1]) });
      if (caseMatch && request.method === "PATCH") return json({ case: await updateCase(config, caseMatch[1], await bodyJson(request), actor) });
    }
    if (url.pathname === "/v1/case-progress" && request.method === "GET") return json({ updates: await publicProgress(config), officialSubmissionConnected: false });

    if (url.pathname === "/v1/assistant/status" && request.method === "GET") return json(assistantStatus(config));
    if (url.pathname === "/v1/assistant/chat" && request.method === "POST") return json(await assistantTurn(await bodyJson(request, 4_300_000), config));
    if (url.pathname === "/v1/assistant/commit" && request.method === "POST") return json(await commitAssistant(await bodyJson(request), config), 201);

    if (url.pathname === "/v1/reports" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const [reports, updates] = await Promise.all([listReports(config, limit), publicProgress(config)]);
      return json({ version: "1", reports: reports.map((report) => { const progress = updates.find((row) => row.caseId === report.id); return { ...report, ...(progress ? { managementProgress: progress } : {}) }; }) });
    }
    if (url.pathname === "/v1/reports" && request.method === "POST") {
      const body = await bodyJson(request, 4_300_000);
      return json({ version: "1", report: await createReport(body, config) }, 201);
    }
    const photo = /^\/v1\/reports\/([0-9a-f-]{36})\/photo$/.exec(url.pathname);
    if (photo && request.method === "GET") {
      const result = await getReportPhoto(config, photo[1]);
      return new Response(result.bytes, { headers: { "content-type": result.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
    }

    if (url.pathname === "/v1/places" && request.method === "GET") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const limit = Number(url.searchParams.get("limit") ?? "8");
      if (query.length < 2 || query.length > 80 || !Number.isInteger(limit) || limit < 1 || limit > 10)
        throw new ApiError("INVALID_QUERY", "검색어는 2~80자, limit은 1~10이어야 합니다.", 400);
      return json({ version: "1", provider: "groad-nominatim", query, places: await searchPlaces(query, limit, config.nominatimUrl) });
    }
    if (request.method === "POST" && ["/v1/routes/driving", "/v1/navigation/replan"].includes(url.pathname)) {
      const body = await bodyJson(request);
      validateRoute(body);
      const route = await planRoute(body.origin, body.destination, config.osrmUrl);
      return json({ version: "1", route, ...(url.pathname.endsWith("replan") ? { replanned: true } : {}) });
    }
    if (url.pathname === "/v1/navigation/match" && request.method === "POST") {
      const body = await bodyJson(request);
      return json({ version: "1", match: await matchTrace(trace(body), config.osrmUrl) });
    }
    if (url.pathname === "/v1/risk/segments" && request.method === "GET") return json(risk(url));
    if (url.pathname === "/v1/traffic/segments" && request.method === "GET") {
      const bbox = (url.searchParams.get("bbox") ?? "127.4,37.0,129.4,38.6").split(",").map(Number);
      if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value)) || bbox[0] < 124 || bbox[2] > 132 || bbox[1] < 33 || bbox[3] > 39 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[2] - bbox[0] > 2 || bbox[3] - bbox[1] > 2)
        throw new ApiError("INVALID_BBOX", "교통정보 bbox는 국내의 2도 이내 영역이어야 합니다.", 400);
      return json({ version: "1", ...(await getTraffic(bbox, config.itsApiKey, config.itsShapesPath)) });
    }

    const tile = /^\/v1\/tiles\/(satellite\/)?(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(url.pathname);
    if (tile && request.method === "GET") {
      const [, satellite, zText, xText, yText] = tile;
      const [z, x, y] = [zText, xText, yText].map(Number);
      if (z > (satellite ? 14 : 19) || (satellite && z < 8) || x >= 2 ** z || y >= 2 ** z)
        throw new ApiError("INVALID_TILE", "지도 타일 좌표가 올바르지 않습니다.", 400);
      let response;
      if (satellite) {
        const source = new URL("https://wmts.terrascope.be/");
        source.search = new URLSearchParams({ SERVICE: "WMTS", REQUEST: "GetTile", VERSION: "1.0.0", LAYER: "esa-worldcover-s2rgbnir-10m-2021-v2_tcc", STYLE: "default", FORMAT: "image/png", TILEMATRIXSET: "EPSG:3857", TILEMATRIX: String(z), TILECOL: String(x), TILEROW: String(y), TIME: "2021-01-01" }).toString();
        try { response = await fetch(source, { signal: AbortSignal.timeout(20_000) }); }
        catch { throw new ApiError("SATELLITE_UNAVAILABLE", "위성사진 원본 서버에 연결할 수 없습니다.", 503); }
      } else {
        try { response = await fetch(new URL(`/tile/${z}/${x}/${y}.png`, config.tilesUrl), { signal: AbortSignal.timeout(120_000) }); }
        catch { throw new ApiError("ENGINE_UNAVAILABLE", "지도 타일 서버에 연결할 수 없습니다.", 503); }
      }
      if (!response.ok) throw new ApiError("TILE_UNAVAILABLE", "지도 타일을 불러오지 못했습니다.", 502);
      if (!response.headers.get("content-type")?.startsWith("image/png")) throw new ApiError("TILE_UNAVAILABLE", "지도 타일 응답 형식이 올바르지 않습니다.", 502);
      return new Response(response.body, { status: 200, headers: { "content-type": "image/png", "cache-control": satellite ? "private, max-age=604800" : "private, max-age=86400", "x-content-type-options": "nosniff" } });
    }
    return problem("NOT_FOUND", "요청한 API가 없습니다.", 404);
  } catch (error) {
    return error instanceof ApiError
      ? problem(error.code, error.message, error.status)
      : problem("INTERNAL_ERROR", "요청을 처리하지 못했습니다.", 500);
  }
}
