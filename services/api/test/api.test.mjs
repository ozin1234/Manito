import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/api.mjs";
const config = { key: "0123456789abcdef0123456789abcdef" };
const request = (path, method = "GET", authenticated = true) => new Request("https://kroad.test" + path, { method, headers: authenticated ? { Authorization: `Bearer ${config.key}` } : {} });
test("current API metadata and health describe only the photo service",async()=>{
 assert.equal((await (await handle(request("/health"),config)).json()).service,"kroad");
 const meta=await (await handle(request("/v1"),config)).json();assert.equal(meta.name,"K-ROAD API");assert.equal(meta.analysisMode,"photo_only");
 assert.ok(meta.endpoints.includes("POST /v1/assistant/commit"));assert.ok(!meta.endpoints.some(path=>/risk|traffic|driving|places/.test(path)));
});
test("missing internal authentication never calls an external provider",async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Unexpected network");};
 try {assert.equal((await handle(request("/v1/reports","GET",false),config)).status,401);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test("removed forecast, routing, imagery and manual publication endpoints return 404",async()=>{
 for(const [path,method] of [["/v1/risk/segments","GET"],["/v1/traffic/segments","GET"],["/v1/routes/driving","POST"],["/v1/navigation/match","POST"],["/v1/places?q=test","GET"],["/v1/tiles/satellite/9/438/196.png","GET"],["/v1/reports","POST"]])assert.equal((await handle(request(path,method),config)).status,404,path);
});
test("map tiles validate coordinates before fetching and identify their source",async()=>{
 const original=globalThis.fetch;const visits=[];globalThis.fetch=async(url,init)=>{visits.push({url,init});return new Response(new Uint8Array([137,80,78,71]),{headers:{"content-type":"image/png"}});};
 try {assert.equal((await handle(request("/v1/tiles/19/999999/0.png"),config)).status,400);assert.equal(visits.length,0);const tile=await handle(request("/v1/tiles/9/438/196.png"),config);assert.equal(tile.status,200);assert.equal(String(visits[0].url),"https://tile.openstreetmap.org/9/438/196.png");assert.ok(visits[0].init.headers["User-Agent"].startsWith("K-ROAD/"));assert.match(tile.headers.get("cache-control"),/604800/);}finally{globalThis.fetch=original;}
});
