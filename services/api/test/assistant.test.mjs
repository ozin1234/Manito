import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handle } from "../src/api.mjs";
import { retrieveKnowledge } from "../src/rag.mjs";

const key = "0123456789abcdef0123456789abcdef";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
const location = () => ({ lat: 37.874, lng: 127.734, locationSource: "gps", locationAccuracyM: 12.4, locationCapturedAt: new Date().toISOString() });
const analysis = (changes = {}) => ({ intent: "road_report", reply: "사진의 어두운 부분이 무엇인지 확인이 필요해요.", uncertainty: "ambiguous", observations: ["도로에 어두운 영역이 보입니다."], category: null, title: "", summary: "", description: "", reason: "사진으로 깊이를 확인할 수 없습니다.", question: "실제로 움푹 팬 부분이었나요?", options: ["패인 구멍", "그림자나 물", "확인할 수 없음"], sourceIds: ["manito-photo-uncertainty"], ready: false, ...changes });
const ready = () => analysis({ reply: "말씀해 주신 파손 내용을 초안으로 정리했어요.", uncertainty: "clear", category: "danger", title: "도로 파손", summary: "도로에 파인 구멍이 있어 점검이 필요합니다.", description: "사용자가 도로에 파인 구멍을 관찰했다고 설명했습니다.", reason: "사진의 어두운 부분과 사용자의 현장 확인 설명을 함께 반영했습니다.", question: "", options: [], ready: true });
const response = (value) => Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(value) }] } }] });
async function environment(run) {
  const folder = await mkdtemp(path.join(os.tmpdir(), "manito-assistant-"));
  const original = globalThis.fetch;
  try { await run({ key, reportsDir: folder, geminiApiKey: "private-test-gemini-key", uwatModel: "gemini-3.8-flash" }, folder); }
  finally { globalThis.fetch = original; if (folder.startsWith(os.tmpdir() + path.sep)) await rm(folder, { recursive: true, force: true }); }
}
async function send(config, endpoint, body) {
  return handle(new Request(`http://manito.test/v1/assistant/${endpoint}`, { headers, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) }), config);
}
const body = (changes = {}) => ({ message: "사진 속 도로를 확인해 주세요.", photoDataUrl: photo, location: location(), allowAiProcessing: true, ...changes });

test("missing provider key and missing consent are explicit errors, never canned AI", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => assert.fail("Provider must not be called");
  const status = await send({ ...config, geminiApiKey: undefined }, "status");
  const provider = await status.json();
  assert.equal(provider.configured, false); assert.equal(provider.provider, "gemini");
  let reply = await send({ ...config, geminiApiKey: undefined }, "chat", body());
  assert.equal(reply.status, 503); assert.equal((await reply.json()).error.code, "AI_NOT_CONFIGURED");
  reply = await send(config, "chat", body({ allowAiProcessing: false }));
  assert.equal(reply.status, 400); assert.equal((await reply.json()).error.code, "AI_CONSENT_REQUIRED");
  assert.deepEqual(await readdir(folder), []);
}));

test("multimodal RAG uses actual retrieved documents and asks without publishing", async () => environment(async (config, folder) => {
  let payload;
  globalThis.fetch = async (url, options) => { assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"); assert.equal(options.headers["x-goog-api-key"], config.geminiApiKey); assert.ok(!String(url).includes(config.geminiApiKey)); payload = JSON.parse(options.body); return response(analysis()); };
  const result = await send(config, "chat", body({ drivingMode: true }));
  assert.equal(result.status, 200);
  const value = await result.json();
  assert.equal(value.phase, "needs_clarification"); assert.equal(value.question.options.length, 3); assert.equal(value.confirmationToken, null);
  assert.equal(payload.generationConfig.responseMimeType, "application/json"); assert.equal(payload.generationConfig.responseJsonSchema.additionalProperties, false);
  assert.ok(payload.contents.at(-1).parts.some((item) => item.inlineData?.mimeType === "image/png" && item.inlineData.data === photo.split(",")[1]));
  assert.ok(payload.contents.at(-1).parts[0].text.includes('"drivingMode":true'));
  assert.ok(payload.contents.at(-1).parts[0].text.includes("manito-photo-uncertainty"));
  assert.ok(!JSON.stringify(payload).includes(config.geminiApiKey));
  assert.equal(value.sources[0].authority, "product");
  assert.deepEqual((await readdir(folder)).filter((name) => name.endsWith(".json")), []);
}));

test("a clarification selection carries the question and conversation context into the next LLM turn", async () => environment(async (config) => {
  const payloads = [];
  globalThis.fetch = async (_url, options) => { payloads.push(JSON.parse(options.body)); return response(payloads.length === 1 ? analysis() : ready()); };
  const first = await (await send(config, "chat", body())).json();
  const second = await send(config, "chat", body({ sessionId: first.sessionId, message: "", selection: { questionId: first.question.id, optionId: "1" } }));
  const value = await second.json();
  assert.equal(value.phase, "awaiting_confirmation");
  assert.ok(payloads[1].contents.some((item) => item.role === "model"));
  assert.ok(payloads[1].contents.at(-1).parts[0].text.includes("패인 구멍"));
  const stale = await send(config, "chat", body({ sessionId: first.sessionId, selection: { questionId: first.question.id, optionId: "1" } }));
  assert.equal(stale.status, 409);
}));

test("clear drafts require a location and explicit confirmation, and committed data is idempotent", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => response(ready());
  const withoutLocation = await (await send(config, "chat", body({ location: undefined }))).json();
  assert.equal(withoutLocation.phase, "needs_location"); assert.equal(withoutLocation.confirmationToken, null);
  const first = await (await send(config, "chat", body())).json();
  assert.equal(first.phase, "awaiting_confirmation");
  const absent = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmed: true });
  assert.equal(absent.status, 409);
  const confirmation = { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true };
  const committed = await send(config, "commit", confirmation);
  assert.equal(committed.status, 201);
  const saved = await committed.json();
  assert.equal(saved.report.summarySource, "llm_rag"); assert.equal(saved.report.agencyStatus, "not_submitted");
  assert.equal(saved.report.title, ready().title); assert.equal(saved.report.locationAccuracyM, 12.4);
  const again = await (await send(config, "commit", confirmation)).json();
  assert.equal(again.idempotent, true); assert.equal(again.report.id, saved.report.id);
  assert.equal((await readdir(folder)).filter((name) => name.endsWith(".json")).length, 1);
  const image = await handle(new Request(`http://manito.test/v1/reports/${saved.report.id}/photo`, { headers }), config);
  assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(photo.split(",")[1], "base64"));
}));

test("a changed description invalidates the previous confirmation token", async () => environment(async (config) => {
  globalThis.fetch = async () => response(ready());
  const first = await (await send(config, "chat", body())).json();
  const second = await (await send(config, "chat", body({ sessionId: first.sessionId, message: "현장 위치와 설명을 수정합니다." }))).json();
  assert.notEqual(first.confirmationToken, second.confirmationToken);
  const old = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
  assert.equal(old.status, 409);
}));

test("an unrelated question receives model scope handling and cannot create a report", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => response(analysis({ intent: "out_of_scope", reply: "우왓은 도로 안전과 이 서비스 이용을 도와드려요. 발견한 도로 상황이 있다면 같이 확인할 수 있어요.", uncertainty: "clear", observations: [], question: "", options: [], sourceIds: [] }));
  const result = await (await send(config, "chat", body({ message: "정치 이야기를 해 줘", photoDataUrl: "" }))).json();
  assert.equal(result.phase, "conversation"); assert.equal(result.confirmationToken, null);
  assert.equal(result.analysis.intent, "out_of_scope");
  assert.deepEqual((await readdir(folder)).filter((name) => name.endsWith(".json")), []);
}));

test("fabricated citations, incomplete output and invalid JSON never become decisions", async () => environment(async (config) => {
  const cases = [response(analysis({ sourceIds: ["fabricated-id"] })), Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] })];
  for (const value of cases) {
    globalThis.fetch = async () => value;
    const result = await send(config, "chat", body());
    assert.equal(result.status, 502);
  }
}));

test("permanent provider errors do not retry and transient server errors retry once", async () => environment(async (config) => {
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({ error: "invalid auth" }, { status: 401 }); };
  let result = await send(config, "chat", body());
  assert.equal(result.status, 503); assert.equal(count, 1);
  count = 0;
  globalThis.fetch = async () => ++count === 1 ? Response.json({}, { status: 503 }) : response(analysis());
  result = await send(config, "chat", body());
  assert.equal(result.status, 200); assert.equal(count, 2);
}));

test("Gemini quota, refusal and transport failures stay explicit and never save a report", async () => environment(async (config, folder) => {
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({}, { status: 429 }); };
  let result = await send(config, "chat", body());
  assert.equal((await result.json()).error.code, "AI_RATE_LIMIT"); assert.equal(count, 2);
  globalThis.fetch = async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } });
  result = await send(config, "chat", body());
  assert.equal(result.status, 422); assert.equal((await result.json()).error.code, "AI_REFUSED");
  globalThis.fetch = async (_url, options) => { assert.ok(options.signal instanceof AbortSignal); throw new DOMException("Timed out", "TimeoutError"); };
  result = await send(config, "chat", body());
  assert.equal(result.status, 503); assert.equal((await result.json()).error.code, "AI_UNAVAILABLE");
  assert.deepEqual(await readdir(folder), []);
}));

test("Gemini overload is a temporary outage and an unavailable model is a configuration error", async () => environment(async (config) => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: { message: "high demand" } }, { status: 503 }); };
  let result = await send(config, "chat", body());
  assert.equal(result.status, 503); assert.equal((await result.json()).error.code, "AI_UNAVAILABLE"); assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 404 }); };
  result = await send(config, "chat", body());
  assert.equal(result.status, 503); assert.equal((await result.json()).error.code, "AI_MODEL_ERROR"); assert.equal(calls, 1);
}));

test("Gemini thought parts are not returned as the user's answer", async () => environment(async (config) => {
  globalThis.fetch = async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "private internal reasoning", thought: true }, { text: JSON.stringify(analysis()) }] } }] });
  const result = await send(config, "chat", body());
  assert.equal(result.status, 200);
  const value = await result.json();
  assert.equal(value.reply, analysis().reply); assert.ok(!JSON.stringify(value).includes("private internal reasoning"));
}));

test("request validation prevents malformed pictures, unknown sessions and coordinates from reaching AI", async () => environment(async (config) => {
  globalThis.fetch = async () => assert.fail("Provider must not be called");
  for (const value of [body({ photoDataUrl: "https://private.invalid/image" }), body({ sessionId: "../../secrets" }), body({ location: { lat: 91, lng: 127, locationSource: "map" } })]) {
    assert.equal((await send(config, "chat", value)).status, 400);
  }
}));

test("selected topics reach Gemini, confirmation and stored reports without changing severity", async () => environment(async (config, folder) => {
  let modelContext;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    modelContext = JSON.parse(payload.contents.at(-1).parts[0].text).context;
    return response(ready());
  };
  for (const topic of ["living", "road", "safety"]) {
    const first = await (await send(config, "chat", body({ topic }))).json();
    assert.equal(first.topic, topic);
    assert.equal(modelContext.selectedTopic.id, topic);
    assert.ok(modelContext.references.some((reference) => reference.id === "manito-topics"));
    const result = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
    assert.equal(result.status, 201);
    const saved = (await result.json()).report;
    assert.equal(saved.topic, topic); assert.equal(saved.category, "danger");
    assert.equal(saved.agencyStatus, "not_submitted");
    assert.equal(JSON.parse(await readFile(path.join(folder, `${saved.id}.json`), "utf8")).topic, topic);
  }
}));

test("invalid topics and cross-topic session reuse are rejected before an AI call", async () => environment(async (config) => {
  globalThis.fetch = async () => response(ready());
  const first = await (await send(config, "chat", body({ topic: "living" }))).json();
  globalThis.fetch = async () => assert.fail("Topic validation must happen before calling Gemini");
  for (const topic of ["politics", null, {}, "__proto__"]) {
    const result = await send(config, "chat", body({ topic }));
    assert.equal(result.status, 400); assert.equal((await result.json()).error.code, "INVALID_TOPIC");
  }
  const mismatch = await send(config, "chat", body({ topic: "safety", sessionId: first.sessionId }));
  assert.equal(mismatch.status, 409); assert.equal((await mismatch.json()).error.code, "SESSION_TOPIC_MISMATCH");
}));

test("RAG retrieves from the corpus and notices a reviewed corpus update", async () => environment(async (_config, folder) => {
  const file = path.join(folder, "knowledge.json");
  const document = (id, text) => ({ id, title: id, text, authority: "product", url: null, checkedAt: "2026-11-23" });
  await writeFile(file, JSON.stringify([document("pothole", "도로 포트홀 파손 구멍"), document("ice", "도로 결빙 빙판")]), "utf8");
  let results = await retrieveKnowledge("포트홀 구멍", file);
  assert.equal(results[0].id, "pothole");
  await writeFile(file, JSON.stringify([document("new-water", "침수 물웅덩이 도로 사진 확인 신규자료")]), "utf8");
  results = await retrieveKnowledge("침수", file);
  assert.equal(results[0].id, "new-water"); assert.ok(!results.some((row) => row.id === "pothole"));
}));
