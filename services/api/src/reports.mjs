import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "./storage.mjs";
import path from "node:path";
import { validPoint } from "./geo.mjs";
import { ApiError } from "./errors.mjs";
import { validateTopic } from "./topics.mjs";

const CATEGORIES = new Set(["danger", "near_miss", "caution"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", { extension: "jpg", magic: (b) => b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b.at(-2) === 0xff && b.at(-1) === 0xd9 }],
  ["image/png", { extension: "png", magic: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/webp", { extension: "webp", magic: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }],
]);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_REPORTS = 200;

function cleanDescription(value) {
  if (typeof value !== "string") throw new ApiError("INVALID_REPORT", "제보 내용을 입력해 주세요.", 400);
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 10 || text.length > 2000) throw new ApiError("INVALID_REPORT", "제보 내용은 10~2000자로 입력해 주세요.", 400);
  return text;
}

export function parsePhoto(dataUrl) {
  if (dataUrl === undefined || dataUrl === null || dataUrl === "") return null;
  if (typeof dataUrl !== "string") throw new ApiError("INVALID_IMAGE", "사진 형식이 올바르지 않습니다.", 400);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || !IMAGE_TYPES.has(match[1])) throw new ApiError("INVALID_IMAGE", "JPG·PNG·WebP 사진만 올릴 수 있습니다.", 400);
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) throw new ApiError("IMAGE_TOO_LARGE", "사진은 3MB 이하로 줄여 주세요.", 413);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !IMAGE_TYPES.get(match[1]).magic(bytes))
    throw new ApiError("INVALID_IMAGE", "사진 데이터를 확인할 수 없습니다.", 400);
  return { bytes, mime: match[1], extension: IMAGE_TYPES.get(match[1]).extension };
}

function filePaths(directory, id, extension) {
  return { json: path.join(directory, `${id}.json`), photo: extension ? path.join(directory, `${id}.${extension}`) : null };
}

export const receiptDigest = (token) => createHash("sha256").update(token).digest("hex");
function reportView({ photoMime, photoExtension, receiptHash, ...report }) {
  return report.visibility === "private" ? { ...report, photoUrl: null } : report;
}

export async function createReport(body, config, approvedAssistant = null) {
  const privateSubmission = approvedAssistant?.submissionTarget === "kroad_admin";
  const missingLocation = privateSubmission && body?.lat == null && body?.lng == null;
  if (!body || !CATEGORIES.has(body.category) || (!missingLocation && !validPoint({ lat: body.lat, lng: body.lng })))
    throw new ApiError("INVALID_REPORT", "위험 분류와 국내 위치 좌표를 확인해 주세요.", 400);
  const topic = validateTopic(body.topic);
  const locationSource = missingLocation ? "unknown" : body.locationSource === "gps" ? "gps" : "map";
  if (body.locationSource !== undefined && !["gps", "map", ...(privateSubmission ? ["unknown"] : [])].includes(body.locationSource))
    throw new ApiError("INVALID_LOCATION", "위치 출처가 올바르지 않습니다.", 400);
  const locationAccuracyM = locationSource === "gps" ? body.locationAccuracyM : null;
  const locationCapturedAt = locationSource === "gps" ? body.locationCapturedAt : null;
  if (locationSource === "gps" && (!Number.isFinite(locationAccuracyM) || locationAccuracyM < 0 || locationAccuracyM > 10_000 ||
      typeof locationCapturedAt !== "string" || !Number.isFinite(Date.parse(locationCapturedAt))))
    throw new ApiError("INVALID_LOCATION", "GPS 정확도와 측정 시각을 확인해 주세요.", 400);
  const description = cleanDescription(body.description);
  const photo = parsePhoto(body.photoDataUrl);
  if (!approvedAssistant?.reportId || !photo) throw new ApiError("CONFIRMATION_REQUIRED", "우왓에서 사진·초안·위치를 확인한 뒤 공개 저장해 주세요.", 409);
  const summary = { title: approvedAssistant.title, summary: approvedAssistant.summary, summarySource: "llm_rag" };
  const id = approvedAssistant.reportId;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("INVALID_REPORT_ID", "저장 번호를 확인할 수 없습니다.", 400);
  if (privateSubmission && !/^[a-f0-9]{64}$/.test(approvedAssistant.receiptHash ?? "")) throw new ApiError("RECEIPT_REQUIRED", "접수 조회 정보를 준비하지 못했습니다.", 500);
  const now = new Date().toISOString();
  const report = {
    id, topic, category: body.category, ...(approvedAssistant?.issueType ? { issueType: approvedAssistant.issueType } : {}), ...summary, description,
    lat: missingLocation ? null : body.lat, lng: missingLocation ? null : body.lng, locationSource, locationAccuracyM, locationCapturedAt,
    photoUrl: photo ? `/api/v1/reports/${id}/photo` : null,
    createdAt: now, status: privateSubmission ? "received" : "draft", agencyStatus: privateSubmission ? "received_in_platform" : "not_submitted",
    ...(privateSubmission ? { visibility: "private", photoAttached: true, receivedAt: now, receiptHash: approvedAssistant.receiptHash, submission: { destination: "kroad_admin", method: "photo_ai", confirmation: approvedAssistant.clarified ? "multiple_choice" : "photo", reference: `KR-${id.slice(0, 8).toUpperCase()}` }, locationStatus: missingLocation ? "pending" : "provided" } : {}),
    ...(approvedAssistant ? { assistant: { sessionId: id, model: approvedAssistant.model, sources: approvedAssistant.sources, reason: approvedAssistant.reason, confirmedAt: approvedAssistant.confirmedAt, ...(privateSubmission ? { answers: approvedAssistant.answers ?? [] } : {}) } } : {}),
  };
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  await mkdir(directory, { recursive: true });
  const files = filePaths(directory, id, photo?.extension);
  if (approvedAssistant) {
    try {
      const existing = JSON.parse(await readFile(files.json, "utf8"));
      if (existing.assistant?.sessionId !== id) throw new ApiError("REPORT_CONFLICT", "저장 번호가 이미 사용 중입니다.", 409);
      if (privateSubmission && existing.receiptHash !== approvedAssistant.receiptHash) throw new ApiError("REPORT_CONFLICT", "접수 조회 정보가 일치하지 않습니다.", 409);
      return reportView(existing);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (photo) {
    try { await writeFile(files.photo, photo.bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if (!approvedAssistant || error.code !== "EEXIST" || !(await readFile(files.photo)).equals(photo.bytes)) throw error;
    }
  }
  const temp = `${files.json}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify({ ...report, photoMime: photo?.mime ?? null, photoExtension: photo?.extension ?? null }), { flag: "wx", mode: 0o600 });
  await rename(temp, files.json);
  return reportView(report);
}

export async function listReports(config, limit = 100, { includePrivate = false } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > (includePrivate ? 1000 : MAX_REPORTS)) throw new ApiError("INVALID_LIMIT", "조회 개수를 확인해 주세요.", 400);
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name));
  const reports = await Promise.all(files.map(async (name) => {
    try { return JSON.parse(await readFile(path.join(directory, name), "utf8")); }
    catch { return null; }
  }));
  return reports.filter((report) => report && (includePrivate || report.visibility !== "private")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(reportView);
}

async function privateReport(config, id, receiptToken) {
  if (!/^[0-9a-f-]{36}$/.test(id ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(receiptToken ?? "")) return null;
  let report;
  try { report = JSON.parse(await readFile(filePaths(config.reportsDir, id).json, "utf8")); } catch { return null; }
  const expected = Buffer.from(report.receiptHash ?? ""), actual = Buffer.from(receiptDigest(receiptToken));
  if (report.visibility !== "private" || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return report;
}

export async function getTrackedReport(config, id, receiptToken) {
  const report = await privateReport(config, id, receiptToken);
  return report ? reportView(report) : null;
}

export async function updateReportLocation(config, id, receiptToken, location) {
  const report = await privateReport(config, id, receiptToken);
  if (!report) throw new ApiError("REPORT_NOT_FOUND", "접수증으로 해당 제보를 확인할 수 없습니다.", 404);
  if (!validPoint(location) || !["map", "gps"].includes(location.locationSource)) throw new ApiError("INVALID_LOCATION", "국내 현장 위치와 위치 출처를 확인해 주세요.", 400);
  if (location.locationSource === "gps" && (!Number.isFinite(location.locationAccuracyM) || location.locationAccuracyM < 0 || location.locationAccuracyM > 10_000 || typeof location.locationCapturedAt !== "string" || !Number.isFinite(Date.parse(location.locationCapturedAt)) || Math.abs(Date.now() - Date.parse(location.locationCapturedAt)) > 300_000)) throw new ApiError("INVALID_LOCATION", "최근 5분 이내의 GPS 위치와 정확도를 확인해 주세요.", 400);
  const updated = { ...report, lat: location.lat, lng: location.lng, locationSource: location.locationSource, locationAccuracyM: location.locationSource === "gps" ? location.locationAccuracyM : null, locationCapturedAt: location.locationSource === "gps" ? location.locationCapturedAt : null, locationStatus: "provided", locationUpdatedAt: new Date().toISOString() };
  const filename = filePaths(config.reportsDir, id).json, temporary = `${filename}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(updated), { flag: "wx", mode: 0o600 });
  await rename(temporary, filename);
  return reportView(updated);
}

export async function getReportPhoto(config, id, { allowPrivate = false } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("INVALID_REPORT_ID", "제보 ID가 올바르지 않습니다.", 400);
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  let report;
  try { report = JSON.parse(await readFile(filePaths(directory, id).json, "utf8")); }
  catch { throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404); }
  if (report.visibility === "private" && !allowPrivate) throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404);
  if (!report.photoExtension || !IMAGE_TYPES.has(report.photoMime)) throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404);
  try { return { bytes: await readFile(filePaths(directory, id, report.photoExtension).photo), mime: report.photoMime }; }
  catch { throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404); }
}
