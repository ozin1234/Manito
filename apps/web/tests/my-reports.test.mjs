import test from "node:test";
import assert from "node:assert/strict";
import { readMyReports, rememberMyReport, myReportProgress, trackMyReports } from "../lib/my-reports.ts";
const report = { id: "11111111-1111-4111-8111-111111111111", title: "확인한 보행로 파손", topic: "road", category: "danger", createdAt: "2026-11-25T00:00:00+09:00" };
test("only a saved receipt enters my list and it survives serialization without duplicating", () => {
  assert.deepEqual(readMyReports(null), []);
  const once = rememberMyReport([], report), twice = rememberMyReport(once, report);
  assert.equal(twice.length, 1); assert.equal(readMyReports(JSON.stringify(twice))[0].id, report.id);
  assert.equal(readMyReports(JSON.stringify([{ ...report, id: "public-board-other-person" }])).length, 0);
  assert.deepEqual(readMyReports("broken JSON"), []);
});

test("private receipt refresh keeps only owned reports and never stores server-only hashes", async () => {
  const original = globalThis.fetch, receiptToken = "x".repeat(43);
  const owned = rememberMyReport([], { ...report, receiptToken, submission: { destination: "kroad_admin", method: "photo_ai", confirmation: "multiple_choice", reference: "KR-11111111" }, description: "사진에서 보행로 파손을 확인했습니다.", receiptHash: "not-a-client-field" });
  assert.ok(!("receiptHash" in owned[0]));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/reports/tracking"); assert.equal(JSON.parse(options.body).receipts[0].receiptToken, receiptToken);
    return Response.json({ reports: [{ report: { ...owned[0], title: "관리자에게 접수된 보행로 파손" }, progress: { caseId: report.id, status: "reviewing", message: "관리자가 내용을 검토합니다.", updatedAt: report.createdAt, department: "도로관리" } }, { report: { ...report, id: "22222222-2222-4222-8222-222222222222" }, progress: { caseId: "22222222-2222-4222-8222-222222222222" } }], unavailable: [] });
  };
  try { const tracked = await trackMyReports(owned); assert.equal(tracked.receipts.length, 1); assert.equal(tracked.receipts[0].title, "관리자에게 접수된 보행로 파손"); assert.equal(tracked.updates[0].status, "reviewing"); assert.equal(tracked.receipts[0].receiptToken, receiptToken); }
  finally { globalThis.fetch = original; }
});
test("resolution display follows public management status and closed does not imply resolution", () => {
  const update = { caseId: report.id, status: "in_progress", message: "담당 부서가 현장을 확인 중입니다.", department: "도로관리", updatedAt: report.createdAt };
  assert.equal(myReportProgress().step, 0);
  assert.equal(myReportProgress(update).step, 2);
  assert.equal(myReportProgress({ ...update, status: "resolved" }).tone, "resolved");
  assert.notEqual(myReportProgress({ ...update, status: "closed" }).tone, "resolved");
  assert.match(myReportProgress({ ...update, status: "closed" }).resolution, /별도 확인/);
});
