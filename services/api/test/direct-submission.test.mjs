import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { handle } from "../src/api.mjs";
import { hashAdminPassword } from "../src/admin-auth.mjs";

const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
const key = "direct-submission-test-key-32-characters";
const ready = (changes = {}) => ({ intent: "road_report", suggestedTopic: "road", issueType: "pothole", reply: "사진에서 도로 파손을 확인했어요.", uncertainty: "clear", observations: ["도로 표면에 파인 부분이 보입니다."], category: "danger", title: "도로 파손 점검 요청", summary: "도로 표면 파손으로 점검이 필요합니다.", description: "사진에서 도로 표면이 움푹 파인 상태를 관찰했습니다.", reason: "사진의 노면 파손 단서를 근거로 분류했습니다.", question: "", options: [], sourceIds: ["manito-photo-uncertainty"], ready: true, ...changes });
const ambiguous = () => ready({ uncertainty: "ambiguous", ready: false, question: "실제로 패인 구멍인가요?", options: ["패인 구멍", "그림자", "확인 불가"], title: "", summary: "", description: "", category: null });
const provider = (value) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
const input = (changes = {}) => ({ requestId: randomUUID(), requestToken: randomBytes(32).toString("base64url"), topic: "road", photoDataUrl: photo, allowAiProcessing: true, submitToAdmin: true, allowAdminSubmission: true, ...changes });
async function fixture(run) {
  const reportsDir = await mkdtemp(path.join(os.tmpdir(), "kroad-direct-")), fetch = globalThis.fetch;
  const config = { reportsDir, key, geminiApiKey: "test-provider-key", adminUsername: "test-admin", adminPasswordHash: hashAdminPassword("test-password-only"), adminSessionSecret: "test-session-secret-with-at-least32chars" };
  try { await run(config); } finally { globalThis.fetch = fetch; if (reportsDir.startsWith(os.tmpdir() + path.sep)) await rm(reportsDir, { recursive: true, force: true }); }
}
async function call(config, route, body, session) {
  return handle(new Request("http://test.local/v1/" + route, { headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", ...(session ? { "X-KROAD-Admin-Session": session } : {}) }, ...(body === undefined ? {} : { method: route.startsWith("admin/cases/") ? "PATCH" : "POST", body: JSON.stringify(body) }) }), config);
}
async function admin(config) { return (await (await call(config, "admin/login", { username: "test-admin", password: "test-password-only" })).json()).token; }

test("a clear photo goes straight to a private admin inbox, including when location is unknown", async () => fixture(async (config) => {
  globalThis.fetch = async () => provider(ready());
  const result = await (await call(config, "assistant/chat", input())).json();
  assert.equal(result.phase, "submitted"); assert.equal(result.question, null); assert.equal(result.report.status, "received");
  assert.equal(result.report.lat, null); assert.equal(result.report.locationStatus, "pending"); assert.equal(result.report.submission.destination, "kroad_admin");
  assert.equal(result.report.submission.confirmation, "photo"); assert.match(result.report.receiptToken, /^[A-Za-z0-9_-]{43}$/); assert.ok(!("receiptHash" in result.report));
  assert.equal((await (await call(config, "reports")).json()).reports.length, 0);
  assert.equal((await call(config, `reports/${result.report.id}/photo`)).status, 404);
  assert.equal((await call(config, "admin/cases")).status, 401);
  const token = await admin(config), cases = (await (await call(config, "admin/cases", undefined, token)).json()).cases;
  const queued = cases.find((row) => row.id === result.report.id);
  assert.equal(queued.title, result.report.title); assert.equal(queued.issueType, "pothole"); assert.ok(!queued.location); assert.equal(queued.visibility, "private");
  assert.equal((await call(config, `admin/cases/${result.report.id}/photo`, undefined, token)).status, 200);
  const receipt = { id: result.report.id, receiptToken: result.report.receiptToken };
  const tracking = await (await call(config, "reports/tracking", { receipts: [receipt] })).json();
  assert.equal(tracking.reports[0].progress.status, "unassigned"); assert.equal(tracking.reports[0].report.description, result.report.description);
  const denied = await (await call(config, "reports/tracking", { receipts: [{ ...receipt, receiptToken: "x".repeat(43) }] })).json();
  assert.equal(denied.reports.length, 0);
  const stored = JSON.parse(await readFile(path.join(config.reportsDir, result.report.id + ".json"), "utf8"));
  assert.ok(stored.receiptHash); assert.ok(!("receiptToken" in stored));
}));

test("only ambiguous photos ask buttons, and the answer submits without a second confirmation", async () => fixture(async (config) => {
  let calls = 0; globalThis.fetch = async () => provider(calls++ ? ready() : ambiguous());
  const request = input(), first = await (await call(config, "assistant/chat", request)).json();
  assert.equal(first.phase, "needs_clarification"); assert.equal(first.question.kind, "clarify");
  assert.equal((await readdir(config.reportsDir)).filter((name) => name.endsWith(".json")).length, 0);
  const stale = await call(config, "assistant/chat", { ...request, sessionId: first.sessionId, selection: { questionId: randomUUID(), optionId: "1" } });
  assert.equal(stale.status, 409);
  const done = await (await call(config, "assistant/chat", { ...request, sessionId: first.sessionId, selection: { questionId: first.question.id, optionId: "1" } })).json();
  assert.equal(done.phase, "submitted"); assert.equal(done.report.submission.confirmation, "multiple_choice");
  assert.equal(done.report.assistant.answers[0].answer, "패인 구멍"); assert.equal(calls, 2);
}));

test("four clarification buttons are preserved and the fourth answer reaches private intake", async () => fixture(async (config) => {
  const choices = ["단순 젖은 노면", "얼어붙은 노면", "확인 불가", "실제로 패인 구멍"];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(Object.hasOwn(payload.generationConfig.responseJsonSchema.properties.options, "maxItems"), false);
    assert.equal(payload.generationConfig.responseJsonSchema.properties.observations.maxItems, 6);
    if (calls++) {
      const context = JSON.parse(payload.contents.at(-1).parts[0].text).context;
      assert.equal(context.selectedAnswers.at(-1).answer, choices[3]);
      return provider(ready());
    }
    return provider({ ...ambiguous(), options: choices });
  };
  const request = input(), response = await call(config, "assistant/chat", request);
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(calls, 1); assert.equal(first.phase, "needs_clarification");
  assert.deepEqual(first.question.options.map((item) => item.label), choices);
  assert.equal((await readdir(config.reportsDir)).filter((name) => name.endsWith(".json")).length, 0);
  const done = await (await call(config, "assistant/chat", { ...request, sessionId: first.sessionId, selection: { questionId: first.question.id, optionId: "4" } })).json();
  assert.equal(done.phase, "submitted"); assert.equal(done.report.assistant.answers[0].answer, choices[3]);
  assert.equal(done.report.submission.confirmation, "multiple_choice");
}));

test("clarification choices have no fixed cap and preserve the final answer", async () => fixture(async (config) => {
  for (const count of [5, 12, 40]) {
    const choices = Array.from({ length: count }, (_, index) => `현장 상태 ${index + 1}`);
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(Object.hasOwn(payload.generationConfig.responseJsonSchema.properties.options, "maxItems"), false);
      if (calls++) {
        assert.equal(JSON.parse(payload.contents.at(-1).parts[0].text).context.selectedAnswers.at(-1).answer, choices.at(-1));
        return provider(ready());
      }
      return provider({ ...ambiguous(), options: choices });
    };
    const request = input(), firstResponse = await call(config, "assistant/chat", request);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(calls, 1); assert.deepEqual(first.question.options.map((row) => row.label), choices);
    assert.equal(first.question.options.at(-1).id, String(count));
    const done = await (await call(config, "assistant/chat", { ...request, sessionId: first.sessionId, selection: { questionId: first.question.id, optionId: String(count) } })).json();
    assert.equal(done.phase, "submitted"); assert.equal(done.report.assistant.answers[0].answer, choices.at(-1));
  }
}));

test("known issue types use their canonical field without confirming an uncertain photo", async () => fixture(async (config) => {
  for (const [selectedTopic, issueType, canonicalTopic] of [["road", "flooding", "safety"], ["safety", "pothole", "road"], ["road", "trash_scattered", "living"]]) {
    let calls = 0;
    globalThis.fetch = async () => provider(calls++ ? ready({ suggestedTopic: selectedTopic, issueType }) : { ...ambiguous(), suggestedTopic: selectedTopic, issueType });
    const request = input({ topic: selectedTopic }), response = await call(config, "assistant/chat", request);
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.equal(calls, 1); assert.equal(first.analysis.suggestedTopic, canonicalTopic);
    assert.equal(first.topic, selectedTopic); assert.equal(first.phase, "needs_clarification");
    assert.equal(first.analysis.uncertainty, "ambiguous"); assert.equal(first.analysis.ready, false); assert.ok(!first.report);
    const done = await (await call(config, "assistant/chat", { ...request, sessionId: first.sessionId, selection: { questionId: first.question.id, optionId: "1" } })).json();
    assert.equal(done.phase, "submitted"); assert.equal(done.report.topic, canonicalTopic); assert.equal(done.report.issueType, issueType);
  }
}));

test("invalid observations and long text are repaired with feedback and cannot create an intake", async () => fixture(async (config) => {
  const originalWarn = console.warn, logs = [];
  console.warn = (...args) => logs.push(args);
  try {
    for (const [changes, issue] of [[{ observations: Array.from({ length: 7 }, () => "관찰한 단서") }, "list:observations"], [{ reason: "내".repeat(401) }, "text:reason"]]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        if (calls++) assert.ok(payload.systemInstruction.parts[0].text.includes(issue));
        return provider({ ...ambiguous(), ...changes });
      };
      const result = await call(config, "assistant/chat", input());
      assert.equal(result.status, 502); assert.equal((await result.json()).error.code, "AI_RESPONSE_INVALID");
      assert.equal(calls, 2);
    }
    assert.ok(logs.every((row) => !JSON.stringify(row).includes("내")));
    assert.equal((await readdir(config.reportsDir)).filter((name) => name.endsWith(".json")).length, 0);
  } finally { console.warn = originalWarn; }
}));

test("duplicate or lost-response retries reuse the same receipt and do not submit a different photo", async () => fixture(async (config) => {
  let calls = 0; globalThis.fetch = async () => { calls++; return provider(ready()); };
  const request = input(), first = await (await call(config, "assistant/chat", request)).json();
  const again = await (await call(config, "assistant/chat", request)).json();
  assert.equal((await call(config, "assistant/chat", { ...request, requestToken: "x".repeat(43) })).status, 403);
  assert.equal((await call(config, "assistant/commit", { sessionId: first.report.id })).status, 409);
  assert.equal(again.report.id, first.report.id); assert.equal(again.report.receiptToken, first.report.receiptToken); assert.equal(calls, 1);
  const changed = await call(config, "assistant/chat", { ...request, photoDataUrl: "data:image/jpeg;base64,/9j/2Q==" });
  assert.equal(changed.status, 409);
}));

test("consent, provider errors and no-issue results never produce a report", async () => fixture(async (config) => {
  globalThis.fetch = async () => assert.fail("Provider must not run without submission consent");
  assert.equal((await call(config, "assistant/chat", input({ allowAdminSubmission: false }))).status, 400);
  globalThis.fetch = async () => provider(ready({ intent: "no_issue", issueType: "none", suggestedTopic: "unknown", ready: false, title: "", summary: "", description: "", category: "unknown" }));
  const noIssue = await (await call(config, "assistant/chat", input())).json();
  assert.equal(noIssue.phase, "conversation"); assert.ok(!noIssue.report);
  globalThis.fetch = async () => new Response("denied", { status: 403 });
  assert.equal((await call(config, "assistant/chat", input())).status, 503);
  assert.equal((await readdir(config.reportsDir)).filter((name) => name.endsWith(".json")).length, 0);
}));

test("reporters see current processing status while internal notes and private updates stay out of public feeds", async () => fixture(async (config) => {
  globalThis.fetch = async () => provider(ready());
  const result = await (await call(config, "assistant/chat", input())).json(), token = await admin(config);
  await call(config, `admin/cases/${result.report.id}`, { revision: 0, status: "reviewing", department: "도로관리", assignee: "내부 담당자", note: "외부에 표시하지 않는 내부 검토 메모", publish: false }, token);
  const receipt = { id: result.report.id, receiptToken: result.report.receiptToken };
  const tracking = await (await call(config, "reports/tracking", { receipts: [receipt] })).json();
  assert.equal(tracking.reports[0].progress.status, "reviewing"); assert.ok(!JSON.stringify(tracking).includes("외부에 표시하지 않는")); assert.ok(!JSON.stringify(tracking).includes("내부 담당자"));
  await call(config, `admin/cases/${result.report.id}`, { revision: 1, status: "in_progress", department: "도로관리", assignee: "담당자", note: "현장 점검 처리 시작", publish: true, publicMessage: "제보하신 사진을 확인하고 현장 점검을 진행합니다." }, token);
  const updates = await (await call(config, "case-progress")).json(); assert.ok(!updates.updates.some((row) => row.caseId === result.report.id));
  assert.equal((await (await call(config, "reports/tracking", { receipts: [receipt] })).json()).reports[0].progress.status, "in_progress");
}));
