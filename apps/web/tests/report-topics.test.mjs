import test from "node:test";
import assert from "node:assert/strict";
import { reportsForTopic, sameConversationTopic } from "../lib/report-topics.ts";

test("topic filtering keeps old road records and separates topics from severity", () => {
  const records = [
    { id: "legacy", category: "danger" },
    { id: "road", topic: "road", category: "caution" },
    { id: "living", topic: "living", category: "caution" },
    { id: "safety", topic: "safety", category: "danger" },
  ];
  assert.deepEqual(reportsForTopic(records, "road").map((row) => row.id), ["legacy", "road"]);
  assert.deepEqual(reportsForTopic(records, "living").map((row) => row.id), ["living"]);
  assert.deepEqual(reportsForTopic(records, "safety").map((row) => row.id), ["safety"]);
  assert.equal(reportsForTopic(records, "road").filter((row) => row.category === "danger").length, 1);
});

test("a conversation from another topic cannot be reused for confirmation", () => {
  assert.equal(sameConversationTopic(null, "living"), false);
  assert.equal(sameConversationTopic({ topic: "road" }, "living"), false);
  assert.equal(sameConversationTopic({ topic: "living" }, "living"), true);
});
