import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapComplaints, neighborhoodView } from "../lib/complaint-map.ts";
const feed = JSON.parse(readFileSync(new URL("../data/public-complaints.json", import.meta.url), "utf8"));
const data = JSON.parse(readFileSync(new URL("../data/complaint-locations.json", import.meta.url), "utf8"));
test("public map uses only traceable title-place references, without assigning severity or accident status", () => {
  const rows = ["living", "road", "safety"].flatMap((topic) => mapComplaints(feed.records, data.locations, topic));
  assert.equal(rows.length, data.locations.length); assert.ok(rows.length > 0);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  for (const row of rows) {
    assert.ok(row.title.includes(row.location.matchedText));
    assert.match(row.location.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    assert.ok(!("category" in row)); assert.ok(!("accidentConfirmed" in row));
  }
});
test("unlocated, mismatched and invalid place references never become pins", () => {
  const row = feed.records.find((item) => item.id === data.locations[0].complaintId), point = data.locations[0];
  for (const bad of [{ ...point, lat: NaN }, { ...point, lng: 20 }, { ...point, matchedText: "not in title" }, { ...point, sourceUrl: "javascript:alert(1)" }]) assert.equal(mapComplaints([row], [bad], row.topic).length, 0);
  assert.equal(mapComplaints(feed.records, [], "road").length, 0);
});
test("region/search filtering and neighborhood scale preserve the chosen scope", () => {
  const point = data.locations[0], row = feed.records.find((item) => item.id === point.complaintId);
  const found = mapComplaints(feed.records, data.locations, row.topic, row.region, row.title);
  assert.equal(found.length, 1); assert.equal(neighborhoodView(row.region, found).zoom, 14);
  assert.equal(mapComplaints(feed.records, data.locations, row.topic, "없는 지역").length, 0);
});
