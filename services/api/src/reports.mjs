import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { validPoint } from "./geo.mjs";
import { ApiError } from "./providers.mjs";

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

function automaticDraft(description, category) {
  const first = description.split(/(?<=[.!?。])\s+/)[0] ?? description;
  const summary = first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
  const subject = /포트홀|도로 파손|구멍|패임/.test(description) ? "도로 파손" :
    /낙석|돌.*떨어|토사/.test(description) ? "낙석·토사" :
    /침수|물.*잠|빗물/.test(description) ? "침수" :
    /결빙|빙판|블랙아이스/.test(description) ? "결빙" :
    /신호등|표지판|가드레일/.test(description) ? "시설물 이상" :
    category === "near_miss" ? "아차 사고 위험" : category === "danger" ? "도로 위험" : "도로 주의";
  return { title: subject, summary, summarySource: "rule_based" };
}

function parsePhoto(dataUrl) {
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

async function aiSummary(description, category, config) {
  const key = config.openaiApiKey;
  if (!key || typeof key !== "string") return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.summaryModel || "gpt-6-luna",
        store: false,
        max_output_tokens: 140,
        instructions: "도로 위험 시민 제보의 내용을 한국어로 정리한다. 입력에 없는 위치, 사고, 긴급성, 기관 접수 여부를 만들어내지 마라. 한 줄 제목과 한 문장 요약을 JSON 객체 {\"title\":\"...\",\"summary\":\"...\"}로만 답한다. 제목 30자 이내, 요약 120자 이내.",
        input: `분류: ${category}\n제보 내용: ${description}`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    const text = result.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text).join("\n") ?? "";
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const title = typeof parsed.title === "string" ? parsed.title.replace(/\s+/g, " ").trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.replace(/\s+/g, " ").trim() : "";
    if (!title || !summary || title.length > 30 || summary.length > 120) return null;
    return { title, summary, summarySource: "ai" };
  } catch { return null; }
}

function filePaths(directory, id, extension) {
  return { json: path.join(directory, `${id}.json`), photo: extension ? path.join(directory, `${id}.${extension}`) : null };
}

export async function createReport(body, config) {
  if (!body || !CATEGORIES.has(body.category) || !validPoint({ lat: body.lat, lng: body.lng }))
    throw new ApiError("INVALID_REPORT", "위험 분류와 국내 위치 좌표를 확인해 주세요.", 400);
  const locationSource = body.locationSource === "gps" ? "gps" : "map";
  if (body.locationSource !== undefined && !["gps", "map"].includes(body.locationSource))
    throw new ApiError("INVALID_LOCATION", "위치 출처가 올바르지 않습니다.", 400);
  const locationAccuracyM = locationSource === "gps" ? body.locationAccuracyM : null;
  const locationCapturedAt = locationSource === "gps" ? body.locationCapturedAt : null;
  if (locationSource === "gps" && (!Number.isFinite(locationAccuracyM) || locationAccuracyM < 0 || locationAccuracyM > 10_000 ||
      typeof locationCapturedAt !== "string" || !Number.isFinite(Date.parse(locationCapturedAt))))
    throw new ApiError("INVALID_LOCATION", "GPS 정확도와 측정 시각을 확인해 주세요.", 400);
  const description = cleanDescription(body.description);
  const photo = parsePhoto(body.photoDataUrl);
  const draft = body.allowAiProcessing === true ? await aiSummary(description, body.category, config) : null;
  const summary = draft ?? automaticDraft(description, body.category);
  const id = randomUUID();
  const report = {
    id, category: body.category, ...summary, description,
    lat: body.lat, lng: body.lng, locationSource, locationAccuracyM, locationCapturedAt,
    photoUrl: photo ? `/api/v1/reports/${id}/photo` : null,
    createdAt: new Date().toISOString(), status: "draft", agencyStatus: "not_submitted",
  };
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  await mkdir(directory, { recursive: true });
  const files = filePaths(directory, id, photo?.extension);
  if (photo) await writeFile(files.photo, photo.bytes, { flag: "wx", mode: 0o600 });
  const temp = `${files.json}.tmp`;
  await writeFile(temp, JSON.stringify({ ...report, photoMime: photo?.mime ?? null, photoExtension: photo?.extension ?? null }), { flag: "wx", mode: 0o600 });
  await rename(temp, files.json);
  return report;
}

export async function listReports(config, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REPORTS) throw new ApiError("INVALID_LIMIT", "limit은 1~200이어야 합니다.", 400);
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name));
  const reports = await Promise.all(files.map(async (name) => {
    try { return JSON.parse(await readFile(path.join(directory, name), "utf8")); }
    catch { return null; }
  }));
  return reports.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(({ photoMime, photoExtension, ...report }) => report);
}

export async function getReportPhoto(config, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("INVALID_REPORT_ID", "제보 ID가 올바르지 않습니다.", 400);
  const directory = config.reportsDir;
  if (!directory) throw new ApiError("REPORT_STORE_UNAVAILABLE", "제보 저장 공간이 설정되지 않았습니다.", 503);
  let report;
  try { report = JSON.parse(await readFile(filePaths(directory, id).json, "utf8")); }
  catch { throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404); }
  if (!report.photoExtension || !IMAGE_TYPES.has(report.photoMime)) throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404);
  try { return { bytes: await readFile(filePaths(directory, id, report.photoExtension).photo), mime: report.photoMime }; }
  catch { throw new ApiError("REPORT_NOT_FOUND", "제보 사진을 찾을 수 없습니다.", 404); }
}
