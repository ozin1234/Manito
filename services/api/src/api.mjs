import { timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.mjs";
import { getStreetTile } from "./tiles.mjs";
import { getReportPhoto, listReports, getTrackedReport, updateReportLocation } from "./reports.mjs";
import { assistantStatus, assistantTurn, commitAssistant } from "./assistant.mjs";
import { adminConfigured, loginAdmin, logoutAdmin, requireAdmin } from "./admin-auth.mjs";
import { listCases, getCase, updateCase, publicProgress, reporterProgress } from "./management.mjs";
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

export async function handle(request, config) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", version: "1", service: "kroad" });
    if (request.method === "GET" && ["/", "/v1"].includes(url.pathname)) return json({ name: "K-ROAD API", version: "1", analysisMode: "photo_only", submissionMode: "direct_admin", adminSubmissionConnected: true, endpoints: ["GET /v1/reports", "GET /v1/reports/{id}/photo", "POST /v1/reports/tracking", "PATCH /v1/reports/{id}/location", "GET /v1/assistant/status", "POST /v1/assistant/chat", "POST /v1/assistant/commit", "GET /v1/case-progress", "GET /v1/tiles/{z}/{x}/{y}.png"], officialSubmissionConnected: false });
    if (!authorized(request, config.key)) return problem("UNAUTHORIZED", "유효한 K-ROAD API 키가 필요합니다.", 401);
    if (url.pathname === "/v1/admin/status" && request.method === "GET") return json({ configured: adminConfigured(config), officialSubmissionConnected: false });
    if (url.pathname === "/v1/admin/login" && request.method === "POST") return json(await loginAdmin(await bodyJson(request), config));
    if (url.pathname.startsWith("/v1/admin/")) {
      const actor = await requireAdmin(request, config);
      if (url.pathname === "/v1/admin/session" && request.method === "GET") return json({ user: actor.user, role: actor.role, expiresAt: actor.expiresAt });
      if (url.pathname === "/v1/admin/logout" && request.method === "POST") return json(await logoutAdmin(request, config));
      if (url.pathname === "/v1/admin/cases" && request.method === "GET") return json(await listCases(config, url));
      const adminPhoto = /^\/v1\/admin\/cases\/([0-9a-f-]{36})\/photo$/.exec(url.pathname);
      if (adminPhoto && request.method === "GET") {
        await getCase(config, adminPhoto[1]);
        const photo = await getReportPhoto(config, adminPhoto[1], { allowPrivate: true });
        return new Response(photo.bytes, { headers: { "content-type": photo.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
      }
      const caseMatch = /^\/v1\/admin\/cases\/([^/]+)$/.exec(url.pathname);
      if (caseMatch && request.method === "GET") return json({ case: await getCase(config, caseMatch[1]) });
      if (caseMatch && request.method === "PATCH") return json({ case: await updateCase(config, caseMatch[1], await bodyJson(request), actor) });
    }
    if (url.pathname === "/v1/case-progress" && request.method === "GET") return json({ updates: await publicProgress(config), officialSubmissionConnected: false });

    if (url.pathname === "/v1/assistant/status" && request.method === "GET") return json(assistantStatus(config));
    if (url.pathname === "/v1/assistant/chat" && request.method === "POST") return json(await assistantTurn(await bodyJson(request, 4_300_000), config));
    if (url.pathname === "/v1/assistant/commit" && request.method === "POST") return json(await commitAssistant(await bodyJson(request), config), 201);

    const locationUpdate = /^\/v1\/reports\/([0-9a-f-]{36})\/location$/.exec(url.pathname);
    if (locationUpdate && request.method === "PATCH") {
      const body = await bodyJson(request);
      return json({ report: await updateReportLocation(config, locationUpdate[1], body?.receiptToken, body?.location) });
    }
    if (url.pathname === "/v1/reports/tracking" && request.method === "POST") {
      const body = await bodyJson(request, 24_000);
      if (!Array.isArray(body?.receipts) || body.receipts.length > 100) return problem("INVALID_RECEIPTS", "조회할 접수증을 확인해 주세요.", 400);
      const results = await Promise.all(body.receipts.map(async (receipt) => {
        if (typeof receipt?.id !== "string" || typeof receipt?.receiptToken !== "string") return null;
        const report = await getTrackedReport(config, receipt.id, receipt.receiptToken);
        return report ? { report, progress: await reporterProgress(config, report) } : null;
      }));
      return json({ reports: results.filter(Boolean), unavailable: body.receipts.filter((_, index) => !results[index]).map((receipt) => typeof receipt?.id === "string" ? receipt.id : ""), destination: "kroad_admin" });
    }

    if (url.pathname === "/v1/reports" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const [reports, updates] = await Promise.all([listReports(config, limit), publicProgress(config)]);
      return json({ version: "1", reports: reports.map((report) => { const progress = updates.find((row) => row.caseId === report.id); return { ...report, ...(progress ? { managementProgress: progress } : {}) }; }) });
    }
    const photo = /^\/v1\/reports\/([0-9a-f-]{36})\/photo$/.exec(url.pathname);
    if (photo && request.method === "GET") {
      const result = await getReportPhoto(config, photo[1]);
      return new Response(result.bytes, { headers: { "content-type": result.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
    }

    const tile = /^\/v1\/tiles\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(url.pathname);
    if (tile && request.method === "GET") return await getStreetTile(...tile.slice(1).map(Number), config.publicOrigin);
    return problem("NOT_FOUND", "요청한 API가 없습니다.", 404);
  } catch (error) {
    return error instanceof ApiError ? problem(error.code, error.message, error.status) : problem("INTERNAL_ERROR", "요청을 처리하지 못했습니다.", 500);
  }
}
