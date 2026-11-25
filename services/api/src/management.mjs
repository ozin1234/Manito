import { mkdir, readFile, readdir, rename, writeFile } from "./storage.mjs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ApiError } from "./errors.mjs";
import { listReports } from "./reports.mjs";
import { validateTopic } from "./topics.mjs";

import feed from "./public-complaints.json" with { type: "json" };
const busy = new Set();
export const caseStatuses = ["unassigned", "reviewing", "assigned", "in_progress", "resolved", "closed"];
const nextStates = { unassigned: ["reviewing", "assigned"], reviewing: ["assigned", "in_progress", "closed"], assigned: ["reviewing", "in_progress"], in_progress: ["reviewing", "resolved"], resolved: ["in_progress", "closed"], closed: ["reviewing"] };
const folder = (config) => path.join(config.reportsDir, "_management");
const validId = (id) => /^(?:public-[a-z-]+-[a-f0-9]{16}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(id);
function fail(code, message, status = 400) { throw new ApiError(code, message, status); }
async function stored(config, id) {
  try { return JSON.parse(await readFile(path.join(folder(config), `${id}.json`), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function sources(config) {
  const community = (await listReports(config, 1000, { includePrivate: true })).map((report) => ({ id: report.id, topic: report.topic ?? "road", title: report.title, summary: report.summary, description: report.description, issueType: report.issueType, category: report.category, submission: report.submission, visibility: report.visibility, assistant: report.assistant, receivedAt: report.receivedAt, locationStatus: report.locationStatus, postedAt: report.createdAt, region: Number.isFinite(report.lat) && Number.isFinite(report.lng) ? "현장 위치 제공" : "위치 확인 필요", origin: "community", sourceName: report.submission ? "K-ROAD · 사진 AI 제보" : "K-ROAD · 이전 공개 기록", sourceUrl: null, sourceStatus: report.submission ? "관리자 접수함 접수" : "이전 공개 기록", ...(Number.isFinite(report.lat) && Number.isFinite(report.lng) ? { location: { lat: report.lat, lng: report.lng } } : {}), photoUrl: report.visibility === "private" && report.photoAttached ? `/api/admin/cases/${report.id}/photo` : report.photoUrl ?? null }));
  return [...feed.records.map((row) => ({ ...row, origin: "public_board" })), ...community];
}
function join(source, record) {
  return { ...source, management: record ?? { caseId: source.id, revision: 0, status: "unassigned", department: "", assignee: "", updatedAt: null, history: [], publicUpdate: null } };
}
export async function listCases(config, url) {
  const topic = url.searchParams.get("topic"), status = url.searchParams.get("status"), query = url.searchParams.get("q")?.trim() ?? "";
  if (topic) validateTopic(topic);
  if (status && !caseStatuses.includes(status)) fail("INVALID_STATUS", "처리 상태를 확인해 주세요.");
  if (query.length > 100) fail("INVALID_QUERY", "검색어는 100자 이내로 입력해 주세요.");
  const all = await sources(config);
  const rows = await Promise.all(all.map(async (source) => join(source, await stored(config, source.id))));
  const cases = rows.filter((row) => (!topic || row.topic === topic) && (!status || row.management.status === status) && (!query || `${row.title} ${row.region} ${row.management.department}`.toLowerCase().includes(query.toLowerCase())));
  return { cases, total: rows.length, matched: cases.length, counts: Object.fromEntries(caseStatuses.map((state) => [state, rows.filter((row) => row.management.status === state).length])), officialSubmissionConnected: false, collectedAt: feed.collectedAt };
}
export async function getCase(config, id) {
  if (!validId(id)) fail("INVALID_CASE", "관리 번호를 확인해 주세요.");
  const source = (await sources(config)).find((row) => row.id === id);
  if (!source) fail("CASE_NOT_FOUND", "관리할 민원을 찾지 못했습니다.", 404);
  return join(source, await stored(config, id));
}
function text(value, max, name) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("INVALID_CASE_UPDATE", `${name} 입력을 확인해 주세요.`);
  return value.trim();
}
export async function updateCase(config, id, body, actor) {
  if (!validId(id)) fail("INVALID_CASE", "관리 번호를 확인해 주세요.");
  if (busy.has(id)) fail("CASE_BUSY", "같은 민원을 처리 중입니다. 잠시 후 다시 시도해 주세요.", 409);
  busy.add(id);
  try {
    const current = await getCase(config, id), previous = current.management;
    if (!Number.isInteger(body?.revision) || body.revision !== previous.revision) fail("CASE_VERSION_CONFLICT", "다른 담당자가 변경했습니다. 최신 내용을 다시 불러와 주세요.", 409);
    if (!caseStatuses.includes(body.status)) fail("INVALID_STATUS", "처리 상태를 확인해 주세요.");
    if (body.status !== previous.status && !nextStates[previous.status].includes(body.status)) fail("INVALID_TRANSITION", "현재 상태에서 이동할 수 없는 처리 단계입니다.", 409);
    const department = text(body.department, 80, "담당 부서"), assignee = text(body.assignee, 80, "담당자"), note = text(body.note, 2000, "처리 메모");
    if (note.length < 2) fail("NOTE_REQUIRED", "변경 사유 또는 처리 내용을 남겨 주세요.");
    if (["assigned", "in_progress", "resolved"].includes(body.status) && !department) fail("DEPARTMENT_REQUIRED", "담당 부서를 지정해 주세요.");
    if (body.status === "resolved" && note.length < 10) fail("RESOLUTION_REQUIRED", "조치 내용을 10자 이상 기록해 주세요.");
    if (typeof body.publish !== "boolean") fail("INVALID_CASE_UPDATE", "진행 상황 공개 여부를 확인해 주세요.");
    const now = new Date().toISOString();
    let publicUpdate = previous.publicUpdate;
    if (body.publish) {
      const message = text(body.publicMessage, 500, "앱에 공개할 안내");
      if (message.length < 10) fail("PUBLIC_MESSAGE_REQUIRED", "공개할 안내를 10자 이상 입력해 주세요.");
      publicUpdate = { caseId: id, status: body.status, department, message, updatedAt: now };
    }
    if (previous.history.length >= 500) fail("CASE_HISTORY_LIMIT", "이력 보관 한도에 도달했습니다. 관리자가 보관 정책을 확인해 주세요.", 409);
    const record = { caseId: id, revision: previous.revision + 1, status: body.status, department, assignee, updatedAt: now, publicUpdate, history: [...previous.history, { id: randomUUID(), actor: actor.user, at: now, from: previous.status, to: body.status, department, assignee, note, published: body.publish, ...(body.publish ? { publicMessage: publicUpdate.message } : {}) }] };
    await mkdir(folder(config), { recursive: true, mode: 0o700 });
    const temporary = path.join(folder(config), `${id}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600 });
    await rename(temporary, path.join(folder(config), `${id}.json`));
    return join(current, record);
  } finally { busy.delete(id); }
}
export async function publicProgress(config) {
  let files;
  try { files = await readdir(folder(config)); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const rows = await Promise.all(files.filter((name) => name.endsWith(".json") && validId(name.slice(0, -5))).map((name) => stored(config, name.slice(0, -5))));
  const publicIds = new Set([...feed.records.map((row) => row.id), ...(await listReports(config, 200)).map((row) => row.id)]);
  return rows.filter((row) => row?.publicUpdate && publicIds.has(row.caseId)).map(({ publicUpdate: row }) => ({ caseId: row.caseId, status: row.status, department: row.department, message: row.message, updatedAt: row.updatedAt }));
}

export async function reporterProgress(config, report) {
  const record = await stored(config, report.id);
  const status = record?.status ?? "unassigned";
  const messages = { unassigned: "관리자 접수함에 접수됐습니다. 담당자 확인을 기다리고 있어요.", reviewing: "관리자가 사진과 제보 내용을 검토하고 있어요.", assigned: "담당 부서가 배정됐습니다.", in_progress: "담당 부서에서 처리 중입니다.", resolved: "관리자가 조치 완료를 기록했습니다.", closed: "관리자가 처리를 종료했습니다. 해결 여부는 안내 내용을 확인해 주세요." };
  return { caseId: report.id, status, department: record?.department ?? "", message: record?.publicUpdate?.status === status ? record.publicUpdate.message : messages[status], updatedAt: record?.updatedAt ?? report.receivedAt ?? report.createdAt };
}
