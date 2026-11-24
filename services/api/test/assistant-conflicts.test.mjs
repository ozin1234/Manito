import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handle } from "../src/api.mjs";

const key = "0123456789abcdef0123456789abcdef";
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
const replacement = "data:image/jpeg;base64,/9j/2Q==";
const location = { lat: 37.874, lng: 127.734, locationSource: "map" };
const nextLocation = { lat: 37.875, lng: 127.735, locationSource: "map" };
const ready = { intent: "road_report", suggestedTopic: "road", reply: "사진에서 확인한 내용을 정리했어요.", uncertainty: "clear", observations: ["도로 표면에 파인 부분이 보입니다."], category: "danger", title: "도로 표면 파손", summary: "사진에서 도로 표면 파손이 관찰됩니다.", description: "사진에 보이는 도로 표면의 파손 상태에 대한 현장 확인이 필요합니다.", reason: "사진에서 관찰한 표면 상태를 반영했습니다.", question: "", options: [], sourceIds: ["manito-photo-uncertainty"], ready: true };
const provider = () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(ready) }] } }] });
const send = (config, action, body) => handle(new Request(`http://kroad.test/v1/assistant/${action}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }), config);

for (const scenario of ["photo-provider-error", "location-provider-error", "location-rag-error", "location-invalid-output"]) {
  test(`accepted updates revoke earlier publication consent even after ${scenario}`, async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "kroad-consent-conflict-"));
    const original = globalThis.fetch;
    const config = { key, geminiApiKey: "private-test-key", uwatModel: "gemini-3.8-flash", reportsDir: folder };
    try {
      globalThis.fetch = async () => provider();
      const first = await (await send(config, "chat", { photoDataUrl: photo, location, allowAiProcessing: true })).json();
      assert.equal(first.phase, "awaiting_confirmation");
      const changedPhoto = scenario.startsWith("photo-");
      const update = { sessionId: first.sessionId, allowAiProcessing: true, ...(changedPhoto ? { photoDataUrl: replacement } : { location: nextLocation }) };
      globalThis.fetch = async () => {
        if (scenario === "location-rag-error") assert.fail("Missing RAG must not contact Gemini");
        if (scenario === "location-invalid-output") return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "invalid JSON" }] } }] });
        throw new Error("Provider offline");
      };
      const failed = await send(scenario === "location-rag-error" ? { ...config, knowledgePath: path.join(folder, "missing.json") } : config, "chat", update);
      assert.equal(failed.status, scenario === "location-invalid-output" ? 502 : 503);
      const stale = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
      assert.equal(stale.status, 409, "An old token must not publish after the accepted update failed");
      const stored = JSON.parse(await readFile(path.join(folder, "_assistant", `${first.sessionId}.json`), "utf8"));
      assert.equal(stored.confirmationToken, null); assert.equal(stored.question, null);
      assert.ok(stored.revision > first.revision); assert.equal(stored.analysis?.ready ?? false, false);
      assert.equal(stored.photoDataUrl, changedPhoto ? replacement : photo);
      assert.deepEqual(stored.location, changedPhoto ? null : { ...nextLocation, locationAccuracyM: null, locationCapturedAt: null });
      globalThis.fetch = async () => provider();
      const retried = await send(config, "chat", { sessionId: first.sessionId, allowAiProcessing: true });
      assert.equal(retried.status, 200);
      const latest = await retried.json();
      assert.equal(latest.phase, changedPhoto ? "needs_location" : "awaiting_confirmation");
      if (!changedPhoto) {
        const saved = await send(config, "commit", { sessionId: latest.sessionId, revision: latest.revision, confirmationToken: latest.confirmationToken, confirmed: true });
        assert.equal(saved.status, 201); assert.equal((await saved.json()).report.lat, nextLocation.lat);
      }
    } finally {
      globalThis.fetch = original;
      if (path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)) await rm(folder, { recursive: true, force: true });
    }
  });
}

test("an invalid update leaves the last accepted draft intact", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "kroad-invalid-update-"));
  const original = globalThis.fetch;
  const config = { key, geminiApiKey: "private-test-key", reportsDir: folder };
  try {
    globalThis.fetch = async () => provider();
    const first = await (await send(config, "chat", { photoDataUrl: photo, location, allowAiProcessing: true })).json();
    globalThis.fetch = async () => assert.fail("Invalid coordinates must not contact Gemini");
    const invalid = await send(config, "chat", { sessionId: first.sessionId, allowAiProcessing: true, location: { ...location, lat: 91 } });
    assert.equal(invalid.status, 400);
    const saved = await send(config, "commit", { sessionId: first.sessionId, revision: first.revision, confirmationToken: first.confirmationToken, confirmed: true });
    assert.equal(saved.status, 201); assert.equal((await saved.json()).report.lat, location.lat);
  } finally {
    globalThis.fetch = original;
    if (path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)) await rm(folder, { recursive: true, force: true });
  }
});
