import { createReport } from "../src/reports.mjs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handle } from "../src/api.mjs";
import { hashAdminPassword } from "../src/admin-auth.mjs";

const key = "0123456789abcdef0123456789abcdef", password = "Test-admin-password-2026";
const call = (config, endpoint, method = "GET", body, token) => handle(new Request(`http://kroad.test/v1/${endpoint}`, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(token ? { "X-KROAD-Admin-Session": token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), config);
async function environment(work) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kroad-admin-test-"));
  const config = { key, reportsDir: dir, adminUsername: "test-admin", adminPasswordHash: hashAdminPassword(password), adminSessionSecret: "test-session-secret-32-characters-long" };
  try { await work(config); } finally { if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) await rm(dir, { recursive: true, force: true }); }
}
async function login(config) {
  const result = await call(config, "admin/login", "POST", { username: "test-admin", password });
  assert.equal(result.status, 200); return (await result.json()).token;
}
test("admin management requires independent admin login and rejects forged sessions", async () => environment(async (config) => {
  assert.equal((await call(config, "admin/cases")).status, 401);
  assert.equal((await (await call({ ...config, adminPasswordHash: undefined }, "admin/status")).json()).configured, false);
  assert.equal((await call(config, "admin/login", "POST", { username: "test-admin", password: "wrong" })).status, 401);
  const token = await login(config);
  assert.equal((await call(config, "admin/session", "GET", undefined, token)).status, 200);
  const forged = token.slice(0, -1) + (token.endsWith("x") ? "y" : "x");
  assert.equal((await call(config, "admin/session", "GET", undefined, forged)).status, 401);
  assert.equal((await call({ ...config, adminPasswordHash: hashAdminPassword("Rotated-admin-password") }, "admin/session", "GET", undefined, token)).status, 401);
  assert.equal((await call(config, "admin/logout", "POST", {}, token)).status, 200);
  assert.equal((await call(config, "admin/session", "GET", undefined, token)).status, 401);
}));
test("case assignment, optimistic concurrency, audit history and publication stay separate from source status", async () => environment(async (config) => {
  const token = await login(config);
  const result = await (await call(config, "admin/cases", "GET", undefined, token)).json();
  assert.ok(result.cases.length >= 9);
  const row = result.cases[0], endpoint = `admin/cases/${row.id}`;
  const input = { revision: 0, status: "reviewing", department: "안전관리 부서", assignee: "담당자 A", note: "비공개 내부 검토 메모", publish: false, actor: "forged-user" };
  assert.equal((await call(config, endpoint, "PATCH", { ...input, status: "resolved" }, token)).status, 409);
  let updated = await (await call(config, endpoint, "PATCH", input, token)).json();
  assert.equal(updated.case.management.revision, 1); assert.equal(updated.case.management.history[0].actor, "test-admin");
  assert.equal(updated.case.sourceStatus, row.sourceStatus);
  assert.deepEqual((await (await call(config, "case-progress")).json()).updates, []);
  assert.equal((await call(config, endpoint, "PATCH", input, token)).status, 409);
  updated = await (await call(config, endpoint, "PATCH", { ...input, revision: 1, status: "assigned", note: "담당 부서를 지정했습니다.", publish: true, publicMessage: "담당 부서에서 현장 확인 일정을 검토하고 있습니다." }, token)).json();
  assert.equal(updated.case.management.revision, 2);
  const progress = await (await call(config, "case-progress")).json();
  assert.equal(progress.updates[0].caseId, row.id); assert.equal(progress.updates[0].status, "assigned");
  assert.deepEqual(Object.keys(progress.updates[0]).sort(), ["caseId", "department", "message", "status", "updatedAt"]);
  assert.ok(!JSON.stringify(progress).includes("비공개 내부 검토 메모"));
  assert.ok(!JSON.stringify(progress).includes("담당자 A"));
  const publicReports = await (await call(config, "reports")).json();
  assert.deepEqual(publicReports.reports, []);
  assert.equal((await call(config, "admin/cases/invalid", "PATCH", input, token)).status, 400);
  assert.equal((await readdir(path.join(config.reportsDir, "_management"))).filter((name) => name.endsWith(".json")).length, 1);
}));
test("community reports share management flow and expose only explicitly published progress", async () => environment(async (config) => {
  const created = { report: await createReport({ category: "danger", topic: "road", description: "현장 도로에 파인 구멍을 확인했습니다.", lat: 37.874, lng: 127.734, photoDataUrl: "data:image/jpeg;base64,/9j/2Q==" }, config, { reportId: randomUUID(), issueType: "pothole", title: "현장 사진", summary: "노면 구멍 확인", model: "test-only-model", sources: [], reason: "검사 사진", confirmedAt: new Date().toISOString() }) };
  const token = await login(config), id = created.report.id;
  const detail = await (await call(config, `admin/cases/${id}`, "GET", undefined, token)).json();
  assert.equal(detail.case.origin, "community"); assert.equal(detail.case.management.revision, 0);
  const update = await call(config, `admin/cases/${id}`, "PATCH", { revision: 0, status: "reviewing", department: "도로관리 부서", assignee: "내부 담당자", note: "외부에 노출하지 않는 메모", publish: true, publicMessage: "현장 위치를 확인하고 점검 필요 여부를 검토 중입니다." }, token);
  assert.equal(update.status, 200);
  const report = (await (await call(config, "reports")).json()).reports[0];
  assert.equal(report.managementProgress.status, "reviewing"); assert.equal(report.agencyStatus, "not_submitted");
  assert.ok(!JSON.stringify(report).includes("내부 담당자")); assert.ok(!JSON.stringify(report).includes("외부에 노출하지 않는 메모"));
}));

test("concurrent case changes cannot overwrite each other and repeated login failures are limited", async () => environment(async (config) => {
  const token = await login(config);
  const row = (await (await call(config, "admin/cases", "GET", undefined, token)).json()).cases[0];
  const body = { revision: 0, status: "reviewing", department: "검토 부서", assignee: "", note: "동시 요청 처리 확인", publish: false };
  const results = await Promise.all([call(config, `admin/cases/${row.id}`, "PATCH", body, token), call(config, `admin/cases/${row.id}`, "PATCH", body, token)]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  let blocked = false;
  for (let index = 0; index < 9; index++) {
    const result = await call(config, "admin/login", "POST", { username: "test-admin", password: "wrong" });
    if (result.status === 429) blocked = true;
    else assert.equal(result.status, 401);
  }
  assert.ok(blocked);
}));
