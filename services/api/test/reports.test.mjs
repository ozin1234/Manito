import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handle } from "../src/api.mjs";

const apiKey = "0123456789abcdef0123456789abcdef";
const auth = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
const jpeg = "data:image/jpeg;base64,/9j/2Q==";
const request = (pathname, options = {}) => new Request(`http://groad.test${pathname}`, { headers: auth, ...options });

test("reports persist a photo, retain original text, and never claim agency submission", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "groad-reports-test-"));
  try {
    const config = { key: apiKey, reportsDir: dir };
    const body = { category: "danger", description: "강릉역 앞 도로에 큰 포트홀이 있습니다. 차량이 급정거합니다.", lat: 37.764, lng: 128.9, locationSource: "gps", locationAccuracyM: 12.4, locationCapturedAt: "2026-11-16T11:30:00.000Z", photoDataUrl: jpeg, allowAiProcessing: false };
    const created = await handle(request("/v1/reports", { method: "POST", body: JSON.stringify(body) }), config);
    assert.equal(created.status, 201);
    const report = (await created.json()).report;
    assert.equal(report.status, "draft");
    assert.equal(report.agencyStatus, "not_submitted");
    assert.equal(report.topic, "road");
    assert.equal(report.summarySource, "rule_based");
    assert.equal(report.title, "도로 파손");
    assert.equal(report.description, body.description);
    assert.equal(report.locationSource, "gps");
    assert.equal(report.locationAccuracyM, 12.4);
    assert.equal(report.locationCapturedAt, body.locationCapturedAt);
    assert.match(report.photoUrl, /^\/api\/v1\/reports\/[0-9a-f-]{36}\/photo$/);

    const listed = await handle(request("/v1/reports"), config);
    assert.equal(listed.status, 200);
    const results = (await listed.json()).reports;
    assert.equal(results.length, 1);
    assert.equal(results[0].id, report.id);
    assert.equal(results[0].locationSource, "gps");
    const photo = await handle(request(`/v1/reports/${report.id}/photo`), config);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  } finally { if (dir.startsWith(os.tmpdir())) await rm(dir, { recursive: true, force: true }); }
});

test("reports reject invalid coordinates, image type, and oversized text", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "groad-reports-test-"));
  try {
    const config = { key: apiKey, reportsDir: dir };
    for (const body of [
      { category: "danger", description: "도로에 큰 포트홀이 있습니다", lat: 91, lng: 128.9 },
      { category: "danger", description: "도로에 큰 포트홀이 있습니다", lat: 37.7, lng: 128.9, photoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
      { category: "caution", description: "a".repeat(2001), lat: 37.7, lng: 128.9 },
      { category: "caution", topic: "invalid", description: "생활 시설물의 불편을 확인했습니다.", lat: 37.7, lng: 128.9 },
      { category: "danger", description: "도로에 큰 포트홀이 있습니다", lat: 37.7, lng: 128.9, locationSource: "gps", locationAccuracyM: -1, locationCapturedAt: new Date().toISOString() },
    ]) {
      const response = await handle(request("/v1/reports", { method: "POST", body: JSON.stringify(body) }), config);
      assert.equal(response.status, 400);
    }
    assert.deepEqual((await (await handle(request("/v1/reports"), config)).json()).reports, []);
  } finally { if (dir.startsWith(os.tmpdir())) await rm(dir, { recursive: true, force: true }); }
});

test("AI summarization requires explicit consent and sends text only", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "groad-reports-test-"));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ title: "도로 파손", summary: "포트홀로 차량 급정거가 발생합니다." }) }] } }] });
  };
  try {
    const config = { key: apiKey, reportsDir: dir, geminiApiKey: "test-only-key" };
    const body = { category: "danger", description: "강릉역 앞 도로에 포트홀이 있어 차량이 급정거합니다.", lat: 37.764, lng: 128.9, photoDataUrl: jpeg };
    const noConsent = await handle(request("/v1/reports", { method: "POST", body: JSON.stringify(body) }), config);
    assert.equal((await noConsent.json()).report.summarySource, "rule_based");
    assert.equal(calls.length, 0);
    const withConsent = await handle(request("/v1/reports", { method: "POST", body: JSON.stringify({ ...body, allowAiProcessing: true }) }), config);
    assert.equal((await withConsent.json()).report.summarySource, "ai");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].generationConfig.responseMimeType, "application/json");
    assert.ok(!JSON.stringify(calls[0]).includes("base64"));
  } finally {
    globalThis.fetch = originalFetch;
    if (dir.startsWith(os.tmpdir())) await rm(dir, { recursive: true, force: true });
  }
});
