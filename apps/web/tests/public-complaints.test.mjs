import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterPublicComplaints } from "../lib/public-complaints.ts";
const feed = JSON.parse(readFileSync(new URL("../data/public-complaints.json", import.meta.url), "utf8"));
test("public index has traceable metadata, valid dates and no invented locations or author fields", () => {
  const duplicate = JSON.parse(readFileSync(new URL("../../../services/api/src/public-complaints.json", import.meta.url), "utf8"));
  assert.deepEqual(duplicate, feed);
  const ids = new Set(), urls = new Set();
  for (const row of feed.records) {
    assert.ok(!ids.has(row.id)); ids.add(row.id); assert.ok(!urls.has(row.sourceUrl)); urls.add(row.sourceUrl);
    assert.ok(["living", "road", "safety"].includes(row.topic));
    assert.ok(row.title && row.title.length <= 150 && row.sourceName && row.sourceStatus);
    assert.ok(["www.chuncheon.go.kr", "www.gncl.go.kr"].includes(new URL(row.sourceUrl).hostname));
    assert.equal(new URL(row.sourceUrl).protocol, "https:");
    assert.match(row.postedAt, /^\d{4}-\d{2}-\d{2}$/); assert.ok(row.postedAt <= feed.collectedAt.slice(0, 10));
    for (const name of ["author", "writer", "phone", "email", "lat", "lng", "body", "photoUrl"]) assert.ok(!(name in row));
    assert.equal(row.classificationMethod, "title_keyword");
  }
  for (const topic of ["living", "road", "safety"]) assert.ok(filterPublicComplaints(feed.records, topic).length >= 3);
});
test("region and keyword filtering operate within the selected category", () => {
  const row = feed.records.find((item) => item.topic === "road");
  const found = filterPublicComplaints(feed.records, "road", row.region, row.title);
  assert.ok(found.some((item) => item.id === row.id));
  assert.equal(filterPublicComplaints(feed.records, "living", "all", row.title).length, 0);
  assert.equal(filterPublicComplaints(feed.records, "road", "수집하지 않은 지역").length, 0);
});
