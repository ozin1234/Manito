import test from "node:test";
import assert from "node:assert/strict";
import { readMyReports, rememberMyReport, myReportProgress } from "../lib/my-reports.ts";
const report = { id: "11111111-1111-4111-8111-111111111111", title: "확인한 보행로 파손", topic: "road", category: "danger", createdAt: "2026-11-25T00:00:00+09:00" };
test("only a saved receipt enters my list and it survives serialization without duplicating", () => {
  assert.deepEqual(readMyReports(null), []);
  const once = rememberMyReport([], report), twice = rememberMyReport(once, report);
  assert.equal(twice.length, 1); assert.equal(readMyReports(JSON.stringify(twice))[0].id, report.id);
  assert.equal(readMyReports(JSON.stringify([{ ...report, id: "public-board-other-person" }])).length, 0);
  assert.deepEqual(readMyReports("broken JSON"), []);
});
test("resolution display follows public management status and closed does not imply resolution", () => {
  const update = { caseId: report.id, status: "in_progress", message: "담당 부서가 현장을 확인 중입니다.", department: "도로관리", updatedAt: report.createdAt };
  assert.equal(myReportProgress().step, 0);
  assert.equal(myReportProgress(update).step, 2);
  assert.equal(myReportProgress({ ...update, status: "resolved" }).tone, "resolved");
  assert.notEqual(myReportProgress({ ...update, status: "closed" }).tone, "resolved");
  assert.match(myReportProgress({ ...update, status: "closed" }).resolution, /별도 확인/);
});
