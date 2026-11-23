import test from "node:test";
import assert from "node:assert/strict";
import { filterGps, offRouteDecision } from "../lib/navigation.ts";

test("weak GPS and impossible jumps do not move the position", () => {
  const first = { lat: 37.874, lng: 127.734, accuracy: 8, timestamp: 100_000, heading: null, speed: null };
  assert.equal(filterGps(null, first)?.lat, first.lat);
  assert.equal(filterGps(first, { ...first, lat: 38.2, timestamp: 101_000 }), null);
  assert.equal(filterGps(null, { ...first, accuracy: 129 })?.accuracy, 129);
  assert.equal(filterGps(first, { ...first, accuracy: 600, timestamp: 101_000 }), null);
});

test("reroute requires three off-route fixes, usable accuracy, and a cooldown", () => {
  const line = [[127.734, 37.874], [127.744, 37.874]];
  const fix = { lat: 37.876, lng: 127.735, accuracy: 8, timestamp: 100_000, heading: null, speed: null };
  assert.equal(offRouteDecision(fix, line, 1, 0, 100_000).replan, false);
  assert.equal(offRouteDecision(fix, line, 2, 0, 100_000).replan, true);
  assert.equal(offRouteDecision(fix, line, 2, 90_000, 100_000).replan, false);
  assert.equal(offRouteDecision({ ...fix, accuracy: 70 }, line, 2, 0, 100_000).replan, false);
});
