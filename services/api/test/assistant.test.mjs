import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handle } from "../src/api.mjs";
import { retrieveKnowledge, retrievePhotoTaxonomy, retrieveRegulatoryGuidance, retrieveRegulatoryContext } from "../src/rag.mjs";
import { generateGeminiJson } from "../src/gemini.mjs";

const key = "0123456789abcdef0123456789abcdef";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
const location = () => ({ lat: 37.874, lng: 127.734, locationSource: "gps", locationAccuracyM: 12.4, locationCapturedAt: new Date().toISOString() });
const analysis = (changes = {}) => ({ intent: "road_report", suggestedTopic: "road", issueType: "pothole", reply: "사진의 어두운 부분이 무엇인지 확인이 필요해요.", uncertainty: "ambiguous", observations: ["도로에 어두운 영역이 보입니다."], category: null, title: "", summary: "", description: "", reason: "사진으로 깊이를 확인할 수 없습니다.", question: "실제로 움푹 팬 부분이었나요?", options: ["패인 구멍", "그림자나 물", "확인할 수 없음"], sourceIds: ["manito-photo-uncertainty"], ready: false, ...changes });
const ready = () => analysis({ reply: "사진에서 확인한 파손을 초안으로 정리했어요.", uncertainty: "clear", category: "danger", title: "도로 파손", summary: "도로에 파인 구멍이 있어 점검이 필요합니다.", description: "사진에서 도로 표면에 파인 부분이 관찰됩니다.", reason: "사진에서 보이는 도로 표면의 파손 단서를 반영했습니다.", question: "", options: [], ready: true });
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
const body = (changes = {}) => ({ photoDataUrl: photo, location: location(), allowAiProcessing: true, ...changes });

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

test("photo assistant defaults to the live-tested lightweight model", async () => environment(async (config) => {
  const status = await (await send({ ...config, uwatModel: undefined }, "status")).json();
  assert.equal(status.model, "gemini-3.5-flash-lite");
}));

test("multimodal RAG uses actual retrieved documents and asks without publishing", async () => environment(async (config, folder) => {
  let payload;
  globalThis.fetch = async (url, options) => { assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"); assert.equal(options.headers["x-goog-api-key"], config.geminiApiKey); assert.ok(!String(url).includes(config.geminiApiKey)); payload = JSON.parse(options.body); return response(analysis()); };
  const result = await send(config, "chat", body());
  assert.equal(result.status, 200);
  const value = await result.json();
  assert.equal(value.phase, "needs_clarification"); assert.equal(value.question.options.length, 3); assert.equal(value.confirmationToken, null);
  assert.equal(payload.generationConfig.responseMimeType, "application/json"); assert.equal(payload.generationConfig.responseJsonSchema.additionalProperties, false);
  assert.ok(payload.contents.at(-1).parts.some((item) => item.inlineData?.mimeType === "image/png" && item.inlineData.data === photo.split(",")[1]));
  assert.ok(payload.contents.at(-1).parts[0].text.includes('"analysisMode":"photo_only"'));
  assert.ok(payload.contents.at(-1).parts[0].text.includes("manito-photo-uncertainty"));
  assert.ok(payload.contents.at(-1).parts[0].text.includes("photo-pothole"));
  assert.ok(payload.contents.at(-1).parts[0].text.includes("photo-none"));
  assert.ok(payload.contents.at(-1).parts[0].text.includes("도로법 제76조"));
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
  assert.equal(saved.report.issueType, "pothole");
  const again = await (await send(config, "commit", confirmation)).json();
  assert.equal(again.idempotent, true); assert.equal(again.report.id, saved.report.id);
  assert.equal((await readdir(folder)).filter((name) => name.endsWith(".json")).length, 1);
  const image = await handle(new Request(`http://manito.test/v1/reports/${saved.report.id}/photo`, { headers }), config);
  assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(photo.split(",")[1], "base64"));
}));

test("a changed location invalidates the previous confirmation token", async () => environment(async (config) => {
  globalThis.fetch = async () => response(ready());
  const first = await (await send(config, "chat", body())).json();
  const second = await (await send(config, "chat", body({ sessionId: first.sessionId, location: { ...location(), lat: 37.875 } }))).json();
  assert.notEqual(first.confirmationToken, second.confirmationToken);
  const old = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
  assert.equal(old.status, 409);
}));

test("an unrelated photo receives model scope handling and cannot create a report", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => response(analysis({ intent: "out_of_scope", reply: "우왓은 도로 안전과 이 서비스 이용을 도와드려요. 발견한 도로 상황이 있다면 같이 확인할 수 있어요.", uncertainty: "clear", observations: [], question: "", options: [], sourceIds: [] }));
  const result = await (await send(config, "chat", body())).json();
  assert.equal(result.phase, "conversation"); assert.equal(result.confirmationToken, null);
  assert.equal(result.analysis.intent, "out_of_scope");
  assert.deepEqual((await readdir(folder)).filter((name) => name.endsWith(".json")), []);
}));

test("an invalid citation gets one fresh verified answer; persistent malformed output never becomes a decision", async () => environment(async (config, folder) => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? response(analysis({ sourceIds: ["fabricated-id"] })) : response(analysis());
  const repaired = await send(config, "chat", body());
  assert.equal(repaired.status, 200); assert.equal(calls, 2);
  assert.equal((await repaired.json()).phase, "needs_clarification");
  const cases = [Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] })];
  for (const value of cases) {
    globalThis.fetch = async () => value;
    const result = await send(config, "chat", body());
    assert.equal(result.status, 502);
  }
  assert.deepEqual((await readdir(folder)).filter((name) => name.endsWith(".json")), []);
}));

test("permanent provider errors do not retry and transient overload recovers after backoff", async () => environment(async (config) => {
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({ error: "invalid auth" }, { status: 401 }); };
  let result = await send(config, "chat", body());
  assert.equal(result.status, 503); assert.equal(count, 1);
  count = 0;
  globalThis.fetch = async () => ++count < 3 ? Response.json({}, { status: 503 }) : response(analysis());
  result = await send(config, "chat", body());
  assert.equal(result.status, 200); assert.equal(count, 3);
}));

test("Gemini request timeout response retries without another assistant request", async () => environment(async (config) => {
  let count = 0;
  globalThis.fetch = async () => ++count === 1 ? Response.json({}, { status: 408 }) : response(analysis());
  const result = await generateGeminiJson({ key: config.geminiApiKey, contents: [], systemInstruction: "test", schema: { type: "object" } });
  assert.equal(result.reply, analysis().reply); assert.equal(count, 2);
}));

test("Gemini quota, refusal and transport failures stay explicit and never save a report", async () => environment(async (config, folder) => {
  let count = 0;
  globalThis.fetch = async () => { count++; return Response.json({}, { status: 429 }); };
  let result = await send(config, "chat", body());
  assert.equal((await result.json()).error.code, "AI_RATE_LIMIT"); assert.equal(count, 4);
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
  assert.equal(result.status, 503); assert.equal((await result.json()).error.code, "AI_UNAVAILABLE"); assert.equal(calls, 4);
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
    return response({ ...ready(), suggestedTopic: modelContext.selectedTopic.id, issueType: { living: "trash_scattered", road: "pothole", safety: "flooding" }[modelContext.selectedTopic.id] });
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
  globalThis.fetch = async () => response({ ...ready(), suggestedTopic: "living", issueType: "trash_scattered" });
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

test("photo taxonomy retrieval keeps no-issue rules and the selected field's complete decision cards", async () => {
  const expected = {
    living: ["photo-trash-scattered", "photo-streetlight", "photo-facility"],
    road: ["photo-pothole", "photo-road-damage", "photo-obstruction"],
    safety: ["photo-flooding", "photo-ice", "photo-rockfall", "photo-safety-facility"],
  };
  for (const [topic, ids] of Object.entries(expected)) {
    const rows = await retrievePhotoTaxonomy("사진 위험 위치", topic);
    const got = new Set(rows.map((row) => row.id));
    assert.equal(rows.length, 13);
    assert.equal(got.size, rows.length);
    for (const id of ["photo-taxonomy-overview", "photo-none", "photo-uncertain-other", ...ids]) assert.ok(got.has(id), `${topic} is missing ${id}`);
    assert.ok(rows.every((row) => row.authority === "product" && !row.url));
  }
});

test("all concrete photo types have conditional official law context before classification", async () => environment(async (config) => {
  const types = ["trash_scattered", "trash_pile", "streetlight_fault", "facility_damage", "pothole", "road_damage", "road_obstruction", "vehicle_incident", "flooding", "ice_risk", "rockfall", "safety_facility"];
  const context = await retrieveRegulatoryContext();
  assert.equal(context.length, 10);
  assert.ok(context.every((row) => !Object.hasOwn(row, "id")));
  for (const type of types) {
    const matches = await retrieveRegulatoryGuidance(type);
    assert.ok(matches.length > 0, `${type} needs at least one relevant law`);
    assert.ok(matches.every((row) => row.authority === "official" && row.url.startsWith("https://") && row.appliesWhen));
  }
  assert.deepEqual((await retrieveRegulatoryGuidance("trash_pile")).map((row) => row.id), ["law-waste-disposal-place", "law-waste-local-discharge"]);
  assert.deepEqual((await retrieveRegulatoryGuidance("streetlight_fault")).map((row) => row.id), ["law-road-maintenance", "law-road-accessories"]);
  assert.deepEqual(await retrieveRegulatoryGuidance("none"), []);
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return response(analysis({ suggestedTopic: "living", issueType: "trash_pile", question: "지정된 수거 장소인가요?", options: ["맞아요", "아니에요", "모르겠어요"] }));
  };
  const reply = await (await send(config, "chat", body({ topic: "road" }))).json();
  assert.equal(reply.analysis.issueType, "trash_pile");
  assert.equal(reply.legalReferences.length, 2);
  assert.ok(reply.legalReferences.every((row) => row.authority === "official" && row.url.startsWith("https://")));
  assert.ok(JSON.stringify(payload).includes("폐기물관리법 제8조"));
  assert.ok(!JSON.stringify(payload).includes("law-waste-disposal-place"));
  assert.deepEqual(reply.sources.map((row) => row.id), ["manito-photo-uncertainty"]);
  assert.equal(reply.confirmationToken, null);
}));

test("known law titles never become photo evidence citations", async () => environment(async (config) => {
  globalThis.fetch = async () => response(analysis({ sourceIds: ["photo-pothole", "도로법 제31조 · 도로의 유지·관리 등"] }));
  const result = await (await send(config, "chat", body())).json();
  assert.deepEqual(result.analysis.sourceIds, ["photo-pothole"]);
  assert.deepEqual(result.sources.map((row) => row.id), ["photo-pothole"]);
}));

test("photo taxonomy references are accepted only when retrieved", async () => environment(async (config) => {
  globalThis.fetch = async () => response(analysis({ sourceIds: ["photo-pothole"] }));
  const result = await (await send(config, "chat", body())).json();
  assert.deepEqual(result.sources.map((source) => source.id), ["photo-pothole"]);
  globalThis.fetch = async () => response(analysis({ sourceIds: ["photo-made-up"] }));
  const invalid = await send(config, "chat", body());
  assert.equal(invalid.status, 502);
  assert.equal((await invalid.json()).error.code, "AI_GROUNDING_INVALID");
}));

test("photo-only mode rejects missing photos and user descriptions before contacting Gemini", async () => environment(async (config) => {
  globalThis.fetch = async () => assert.fail("Invalid input must never reach Gemini");
  const status = await (await send(config, "status")).json();
  assert.equal(status.analysisMode, "photo_only"); assert.equal(status.audio, "notification_only");
  for (const [request, code] of [[body({ photoDataUrl: "" }), "PHOTO_REQUIRED"], [body({ photoDataUrl: undefined }), "PHOTO_REQUIRED"], [body({ message: "도로에 구멍이 있어요" }), "TEXT_INPUT_DISABLED"]]) {
    const result = await send(config, "chat", request);
    assert.equal(result.status, 400); assert.equal((await result.json()).error.code, code);
  }
}));

test("unknown photo judgments stay unclassified and unsupported AI fields cannot become decisions", async () => environment(async (config) => {
  globalThis.fetch = async () => response(analysis({ suggestedTopic: "unknown", issueType: "unknown", category: "unknown" }));
  const value = await (await send(config, "chat", body())).json();
  assert.equal(value.analysis.suggestedTopic, null); assert.equal(value.analysis.category, null);
  assert.equal(value.confirmationToken, null);
  globalThis.fetch = async () => response(analysis({ suggestedTopic: "politics" }));
  const invalid = await send(config, "chat", body());
  assert.equal(invalid.status, 502); assert.equal((await invalid.json()).error.code, "AI_RESPONSE_INVALID");
}));

test("normal bins and uncertain waste piles cannot become confirmed reports", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => response(analysis({ intent: "no_issue", issueType: "none", reply: "정상 수거함만 보이고 불편 사항은 확인되지 않습니다.", uncertainty: "clear", category: "unknown", question: "", options: [], sourceIds: [], ready: false }));
  const normal = await (await send(config, "chat", body({ topic: "living" }))).json();
  assert.equal(normal.analysis.intent, "no_issue"); assert.equal(normal.analysis.ready, false);
  assert.equal(normal.phase, "conversation"); assert.equal(normal.confirmationToken, null);
  const rejected = await send(config, "commit", { sessionId: normal.sessionId, revision: normal.revision, confirmed: true });
  assert.equal(rejected.status, 409);
  globalThis.fetch = async () => response(analysis({ suggestedTopic: "living", issueType: "trash_pile", reply: "수거 대기인지 확인이 필요합니다.", question: "정해진 수거 장소와 시간에 놓인 봉투인가요?", options: ["정해진 수거 대기", "수거 장소가 아님", "확인할 수 없음"] }));
  const ambiguous = await (await send(config, "chat", body({ topic: "living" }))).json();
  assert.equal(ambiguous.phase, "needs_clarification"); assert.equal(ambiguous.analysis.issueType, "trash_pile");
  assert.equal(ambiguous.confirmationToken, null);
  globalThis.fetch = async () => response({ ...ready(), intent: "no_issue", suggestedTopic: "living", issueType: "none" });
  const invalid = await send(config, "chat", body({ topic: "living" }));
  assert.equal(invalid.status, 502);
  assert.deepEqual((await readdir(folder)).filter((name) => name.endsWith(".json")), []);
}));

test("open-ended other types cannot be auto-confirmed from a photo", async () => environment(async (config) => {
  for (const [topic, issueType] of [["living", "other_living"], ["road", "other_road"], ["safety", "other_safety"]]) {
    globalThis.fetch = async () => response({ ...ready(), suggestedTopic: topic, issueType });
    const result = await send(config, "chat", body({ topic }));
    assert.equal(result.status, 502);
    assert.equal((await result.json()).error.code, "AI_RESPONSE_INVALID");
  }
}));

test("a report cannot claim that its issue type is none", async () => environment(async (config) => {
  globalThis.fetch = async () => response(analysis({ intent: "road_report", issueType: "none" }));
  const result = await send(config, "chat", body({ topic: "road" }));
  assert.equal(result.status, 502);
  assert.equal((await result.json()).error.code, "AI_RESPONSE_INVALID");
}));

test("AI can propose a different field from the browsing tab and stores only the confirmed proposal", async () => environment(async (config) => {
  globalThis.fetch = async () => response({ ...ready(), suggestedTopic: "living", issueType: "trash_scattered", title: "쓰레기 방치", summary: "사진에서 주변에 쌓인 쓰레기가 관찰됩니다." });
  const draft = await (await send(config, "chat", body({ topic: "road" }))).json();
  assert.equal(draft.topic, "road"); assert.equal(draft.analysis.suggestedTopic, "living");
  assert.ok(draft.question.text.includes("생활불편"));
  const result = await send(config, "commit", { sessionId: draft.sessionId, revision: draft.revision, confirmationToken: draft.confirmationToken, confirmed: true });
  assert.equal(result.status, 201); assert.equal((await result.json()).report.topic, "living");
}));

test("replacing a photo drops previous observations and location and invalidates old consent", async () => environment(async (config) => {
  let lastPayload;
  globalThis.fetch = async (_url, options) => { lastPayload = JSON.parse(options.body); return response(ready()); };
  const first = await (await send(config, "chat", body())).json();
  const second = await (await send(config, "chat", body({ sessionId: first.sessionId, photoDataUrl: "data:image/jpeg;base64,/9j/2Q==", location: undefined }))).json();
  assert.equal(second.phase, "needs_location"); assert.equal(second.hasPhoto, true);
  assert.equal(JSON.parse(lastPayload.contents.at(-1).parts[0].text).context.previousDraft, null);
  assert.equal(lastPayload.contents.length, 1);
  assert.equal(lastPayload.contents.at(-1).parts[1].inlineData.mimeType, "image/jpeg");
  const stale = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
  assert.equal(stale.status, 409);
}));

test("legacy description-based drafts cannot be resumed or published after the mode change", async () => environment(async (config, folder) => {
  globalThis.fetch = async () => response(ready());
  const firstResponse = await send(config, "chat", body());
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200, JSON.stringify(first));
  const file = path.join(folder, "_assistant", `${first.sessionId}.json`);
  const session = JSON.parse(await readFile(file, "utf8")); delete session.analysisMode;
  await writeFile(file, JSON.stringify(session));
  globalThis.fetch = async () => assert.fail("A legacy draft must start fresh");
  const turn = await send(config, "chat", body({ sessionId: first.sessionId }));
  assert.equal(turn.status, 409); assert.equal((await turn.json()).error.code, "SESSION_MODE_CHANGED");
  const commit = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
  assert.equal(commit.status, 409); assert.equal((await commit.json()).error.code, "PHOTO_REQUIRED");
}));
