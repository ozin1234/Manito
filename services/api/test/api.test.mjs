import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/api.mjs";
import { distanceToLineMeters, shouldReplan } from "../src/geo.mjs";
import { filterGps } from "../src/gps.mjs";
import { normalizeTraffic } from "../src/traffic.mjs";

const origin = "http://groad.test";
const config = { key: "0123456789abcdef0123456789abcdef", osrmUrl: "http://osrm:5000", nominatimUrl: "http://nominatim:8080", tilesUrl: "http://tiles:80" };
const auth = { Authorization: `Bearer ${config.key}` };
const request = (path, init = {}) => new Request(origin + path, init);

test("API key rejects missing and incorrect credentials before contacting engines", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("must not call provider"); };
  try {
    assert.equal((await handle(request("/v1/places?q=강릉역"), config)).status, 401);
    assert.equal((await handle(request("/v1/places?q=강릉역", { headers: { Authorization: "Bearer wrong" } }), config)).status, 401);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("places, independent route, GPS matching and map tiles use local services", async () => {
  const original = globalThis.fetch;
  const visited = [];
  globalThis.fetch = async (url) => {
    visited.push(String(url));
    if (String(url).includes("/search")) return Response.json([{ osm_type: "N", osm_id: 12, name: "강릉역", display_name: "강릉역, 강릉시, 대한민국", lat: "37.765", lon: "128.901" }]);
    if (String(url).includes("/route/v1/")) return Response.json({ code: "Ok", routes: [{ distance: 12000.2, duration: 910.8, geometry: { coordinates: [[127.734, 37.874], [128.901, 37.765]] }, legs: [{ steps: [{ name: "강릉대로", maneuver: { location: [128.901, 37.765], type: "turn", modifier: "right" } }] }] }] });
    if (String(url).includes("/match/v1/")) return Response.json({ code: "Ok", tracepoints: [{ location: [127.734, 37.874], distance: 4, matchings_index: 0 }, { location: [127.735, 37.875], distance: 6, matchings_index: 0 }], matchings: [{ confidence: 0.87 }] });
    if (String(url).includes("/tile/")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    throw Error("unexpected provider URL");
  };
  try {
    const placeResponse = await handle(request("/v1/places?q=강릉역", { headers: auth }), config);
    assert.equal(placeResponse.status, 200);
    const places = await placeResponse.json();
    assert.equal(places.provider, "groad-nominatim");
    assert.equal(places.places[0].name, "강릉역");
    const body = { origin: { lat: 37.874, lng: 127.734 }, destination: { lat: 37.765, lng: 128.901 } };
    const routeResponse = await handle(request("/v1/routes/driving", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) }), config);
    assert.equal(routeResponse.status, 200);
    const route = (await routeResponse.json()).route;
    assert.equal(route.provider, "groad-osrm");
    assert.equal(route.trafficAware, false);
    assert.equal(route.steps[0].instruction, "강릉대로에서 우회전");
    assert.equal(JSON.stringify(route).includes(config.key), false);
    const replan = await handle(request("/v1/navigation/replan", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) }), config);
    assert.equal((await replan.json()).replanned, true);
    const match = await handle(request("/v1/navigation/match", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ points: [
      { lat: 37.874, lng: 127.734, accuracy: 8, timestamp: 100_000 },
      { lat: 37.875, lng: 127.735, accuracy: 9, timestamp: 102_000 },
    ] }) }), config);
    assert.equal((await match.json()).match.isEstimated, true);
    const tile = await handle(request("/v1/tiles/8/222/100.png", { headers: auth }), config);
    assert.equal(tile.status, 200);
    assert.equal(tile.headers.get("content-type"), "image/png");
    assert.equal(visited.length, 5);
    assert.ok(visited.every((url) => /^(http:\/\/(osrm|nominatim|tiles))/.test(url)));
  } finally { globalThis.fetch = original; }
});

test("historical risk and validation remain explicit", async () => {
  const risk = await handle(request("/v1/risk/segments?band=위험&limit=3", { headers: auth }), config);
  const result = await risk.json();
  assert.equal(result.count, 3);
  assert.equal(result.isLiveRisk, false);
  assert.ok(result.segments.every((segment) => segment.riskBand === "위험"));
  assert.equal((await handle(request("/v1/tiles/19/999999/2.png", { headers: auth }), config)).status, 400);
  assert.equal((await handle(request("/v1/places?q=x", { headers: auth }), config)).status, 400);
});

test("GPS filtering rejects jumps and reroutes after stable off-route fixes", () => {
  const first = { lat: 37.874, lng: 127.734, accuracy: 8, timestamp: 100_000 };
  assert.equal(filterGps(null, first).accepted, true);
  assert.equal(filterGps(first, { ...first, lat: 38.2, timestamp: 101_000 }).reason, "gps_jump");
  assert.equal(filterGps(first, { ...first, accuracy: 120, timestamp: 101_000 }).reason, "weak_fix");
  assert.ok(distanceToLineMeters({ lat: 37.874, lng: 127.734 }, [[127.734, 37.874], [127.744, 37.874]]) < 1);
  const coordinates = [[127.734, 37.874], [127.744, 37.874]];
  const position = { lat: 37.876, lng: 127.735, accuracy: 8, timestamp: 100_000 };
  let count = 0;
  for (let i = 0; i < 2; i++) {
    const state = shouldReplan({ position, coordinates, consecutiveOffRoute: count, lastReplanAt: 0, now: 100_000 });
    assert.equal(state.replan, false);
    count = state.consecutiveOffRoute;
  }
  assert.equal(shouldReplan({ position, coordinates, consecutiveOffRoute: count, lastReplanAt: 0, now: 100_000 }).replan, true);
  assert.equal(shouldReplan({ position: { ...position, accuracy: 100 }, coordinates, consecutiveOffRoute: count, lastReplanAt: 0, now: 100_000 }).replan, false);
});

test("satellite imagery is requested from the published ESA layer", async () => {
  const original = globalThis.fetch;
  let source;
  globalThis.fetch = async (url) => {
    source = new URL(String(url));
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  };
  try {
    const result = await handle(request("/v1/tiles/satellite/10/878/395.png", { headers: auth }), config);
    assert.equal(result.status, 200);
    assert.equal(source.hostname, "wmts.terrascope.be");
    assert.equal(source.searchParams.get("LAYER"), "esa-worldcover-s2rgbnir-10m-2021-v2_tcc");
    assert.equal((await handle(request("/v1/tiles/satellite/15/1/1.png", { headers: auth }), config)).status, 400);
  } finally { globalThis.fetch = original; }
});

test("traffic feed shows unavailable until a separate ITS key is configured, and rejects stale readings", async () => {
  const unavailable = await handle(request("/v1/traffic/segments", { headers: auth }), config);
  assert.equal((await unavailable.json()).isLive, false);
  const now = Date.parse("2026-11-11T06:00:00Z");
  const payload = { response: { header: { resultCode: 0 }, body: { items: { item: [
    { linkId: "1", roadName: "영동고속도로", speed: "29", createdDate: "20261111145500" },
    { linkId: "2", roadName: "오래된 도로", speed: "18", createdDate: "20261111130000" },
  ] } } } };
  const rows = normalizeTraffic(payload, now).segments;
  assert.equal(rows[0].isFresh, true);
  assert.equal(rows[1].isFresh, false);
  const actualItsShape = normalizeTraffic({ header: { resultCode: 0 }, body: { items: [
    { linkId: "2370005501", roadName: "국도", speed: "34", createdDate: "20261111145500" },
  ] } }, now);
  assert.equal(actualItsShape.segments.length, 1);
});

test("keyed traffic speed joins a standard road link without exposing the ITS key", async () => {
  const original = globalThis.fetch;
  const createdDate = new Date(Date.now() + 9 * 3600_000).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  globalThis.fetch = async (url) => {
    assert.equal(new URL(String(url)).hostname, "openapi.its.go.kr");
    return Response.json({ response: { header: { resultCode: 0 }, body: { items: { item: [
      { linkId: "2180020711", roadName: "테스트 도로", speed: "42", createdDate },
    ] } } } });
  };
  try {
    const { fileURLToPath } = await import("node:url");
    const itsShapesPath = fileURLToPath(new URL("./fixtures/traffic-shapes.json", import.meta.url));
    const reply = await handle(request("/v1/traffic/segments?bbox=126.9,36.7,128.9,38.5", { headers: auth }), { ...config, itsApiKey: "private-test-key", itsShapesPath });
    assert.equal(reply.status, 200);
    const body = await reply.json();
    assert.equal(body.matchedCount, 1);
    assert.equal(body.segments[0].geometry.type, "LineString");
    assert.equal(JSON.stringify(body).includes("private-test-key"), false);
  } finally { globalThis.fetch = original; }
});
