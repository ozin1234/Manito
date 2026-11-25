import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { hostedRequest } from "../src/hosted.mjs";
import { cloudStorage } from "../src/cloud-storage.mjs";
import { hashAdminPassword } from "../src/admin-auth.mjs";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../../../drizzle/0000_light_korg.sql",import.meta.url),"utf8").replaceAll("--> statement-breakpoint",""));
  const db = {
    prepare(query) { let params=[]; return { bind(...values) { params=values; return this; }, async first() { return sql.prepare(query).get(...params) ?? null; }, async all() { return { results: sql.prepare(query).all(...params) }; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...params).changes) } }; } }; },
    async batch(statements) { sql.exec("BEGIN"); try { const rows=[]; for (const statement of statements) rows.push(await statement.run()); sql.exec("COMMIT"); return rows; } catch(error) { sql.exec("ROLLBACK");throw error; } },
  };
  const objects = new Map();
  const bucket = { async head(key) { return objects.has(key) ? {} : null; }, async put(key,data) { objects.set(key,Buffer.from(data)); }, async get(key) { const data=objects.get(key); return data ? { async text(){return data.toString();}, async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);} } : null; } };
  const env = { DB: db, BUCKET: bucket, KROAD_API_KEY: "c".repeat(64), GEMINI_API_KEY: "test-only-provider-key", KROAD_PUBLIC_ORIGIN: "https://kroad.test", KROAD_ADMIN_USERNAME: "test-admin", KROAD_ADMIN_PASSWORD_HASH: hashAdminPassword("test-password-long-enough"), KROAD_ADMIN_SESSION_SECRET: "s".repeat(64) };
  const request = (path, method="GET", body, headers={}) => hostedRequest(new Request("https://kroad.test/v1"+path,{method,headers:{"Content-Type":"application/json",...(method==="GET"?{}:{Origin:"https://kroad.test"}),...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {sql,db,bucket,env,request};
}
const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
test("hosted direct admin intake and private receipt reads work through D1/R2 without exposing photos", async () => {
  const f=fixture(), original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({intent:"road_report",reply:"사진의 파손을 확인했어요.",suggestedTopic:"road",issueType:"pothole",uncertainty:"clear",observations:["노면 구멍이 보입니다."],category:"danger",title:"노면 파손 점검 요청",summary:"사진의 노면 파손 점검이 필요합니다.",description:"사진에서 노면에 파인 부분을 확인했습니다.",reason:"노면의 파손 단서를 근거로 제안합니다.",question:"",options:[],sourceIds:["photo-pothole"],ready:true})}]}}]});
  try {
    const result=await (await f.request("/assistant/chat","POST",{requestId:"12345678-1234-4123-8123-123456789abc",requestToken:"t".repeat(43),topic:"road",photoDataUrl:image,allowAiProcessing:true,submitToAdmin:true,allowAdminSubmission:true})).json();
    assert.equal(result.phase,"submitted"); assert.equal((await (await f.request("/reports")).json()).reports.length,0);
    assert.equal((await f.request("/reports/"+result.report.id+"/photo")).status,404);
    f.sql.prepare("INSERT INTO kroad_leases VALUES('writer','another-writer',?)").run(Date.now()+120000);
    const tracked=await f.request("/reports/tracking","POST",{receipts:[{id:result.report.id,receiptToken:result.report.receiptToken}]});
    assert.equal(tracked.status,200); assert.equal((await tracked.json()).reports[0].report.submission.destination,"kroad_admin");
    assert.equal(f.sql.prepare("SELECT owner FROM kroad_leases WHERE name='writer'").get().owner,"another-writer");
    f.sql.exec("DELETE FROM kroad_leases");
    const login=await (await f.request("/admin/login","POST",{username:"test-admin",password:"test-password-long-enough"})).json();
    assert.equal((await f.request("/admin/cases/"+result.report.id+"/photo","GET",undefined,{"X-KROAD-Admin-Session":login.token})).status,200);
  } finally {globalThis.fetch=original; f.sql.close();}
});
test("hosted photo analysis, confirmation, durable photo and admin progress reuse the same API",async()=>{
  const f=fixture(), original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify({intent:"road_report",reply:"사진에 구멍이 보여요. 위치를 확인해 주세요.",suggestedTopic:"road",issueType:"pothole",uncertainty:"clear",observations:["노면에 구멍이 보임"],category:"danger",title:"노면의 구멍 확인",summary:"노면의 구멍을 확인한 사진입니다.",description:"사진에 노면의 구멍이 보입니다. 현장 위치 확인이 필요합니다.",reason:"노면 구멍의 사진 관찰을 바탕으로 제안합니다.",question:"",options:[],sourceIds:["photo-pothole"],ready:true})}]}}]});
  try {
    const first=await f.request("/assistant/chat","POST",{topic:"road",photoDataUrl:image,allowAiProcessing:true});assert.equal(first.status,200);const draft=await first.json();assert.ok(draft.legalReferences.length);assert.equal(draft.confirmationToken,null);
    const second=await f.request("/assistant/chat","POST",{topic:"road",sessionId:draft.sessionId,allowAiProcessing:true,location:{lat:37.87,lng:127.73,locationSource:"map"}});assert.equal(second.status,200);const confirmed=await second.json();assert.ok(confirmed.confirmationToken);
    const saved=await f.request("/assistant/commit","POST",{sessionId:confirmed.sessionId,revision:confirmed.revision,confirmationToken:confirmed.confirmationToken,confirmed:true});assert.equal(saved.status,201);const {report}=await saved.json();assert.equal(report.issueType,"pothole");assert.equal(report.agencyStatus,"not_submitted");
    assert.equal((await (await f.request("/reports")).json()).reports.length,1);
    const photo=await f.request("/reports/"+report.id+"/photo");assert.equal(photo.status,200);assert.equal(photo.headers.get("content-type"),"image/png");
    const denied=await f.request("/admin/cases");assert.equal(denied.status,401);
    const login=await f.request("/admin/login","POST",{username:"test-admin",password:"test-password-long-enough"});assert.equal(login.status,200);const {token}=await login.json();const admin={"X-KROAD-Admin-Session":token};
    const cases=await (await f.request("/admin/cases","GET",undefined,admin)).json();assert.equal(cases.cases.length,36);
    const update={revision:0,status:"reviewing",department:"도로관리",assignee:"담당자",note:"사진을 확인하고 현장 검토를 시작합니다.",publish:true,publicMessage:"접수한 사진을 확인하고 현장 검토를 진행하고 있습니다."};
    assert.equal((await f.request("/admin/cases/"+report.id,"PATCH",update,admin)).status,200);
    assert.equal((await f.request("/admin/cases/"+report.id,"PATCH",update,admin)).status,409);
    assert.equal((await (await f.request("/case-progress")).json()).updates.length,1);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM kroad_records WHERE key LIKE '%.tmp'").get().n,0);
  } finally {globalThis.fetch=original;f.sql.close();}
});
test("large session photos stay in R2 and expired writers cannot change D1 records",async()=>{
  const f=fixture();f.sql.prepare("INSERT INTO kroad_leases VALUES('writer','one',?)").run(Date.now()+120000);
  const store=cloudStorage(f.db,f.bucket,"one"), photoDataUrl="data:image/jpeg;base64,"+"a".repeat(2800000);
  await store.writeFile("/kroad/_assistant/example.tmp",JSON.stringify({photoDataUrl,revision:1}),{flag:"wx"});
  await store.rename("/kroad/_assistant/example.tmp","/kroad/_assistant/example.json");
  assert.ok(f.sql.prepare("SELECT length(content) AS n FROM kroad_records").get().n<1000);
  assert.equal(JSON.parse(await cloudStorage(f.db,f.bucket).readFile("/kroad/_assistant/example.json","utf8")).photoDataUrl,photoDataUrl);
  f.sql.exec("UPDATE kroad_leases SET owner='two'");
  await assert.rejects(store.writeFile("/kroad/forged.json","{}"),/expired/);
  f.sql.close();
});
test("hosted requests reject cross-site writes and concurrent global writers",async()=>{
 const f=fixture();
 assert.equal((await f.request("/assistant/chat","POST",{},{Origin:"https://elsewhere.test"})).status,403);
 f.sql.prepare("INSERT INTO kroad_leases VALUES('writer','other',?)").run(Date.now()+120000);
 assert.equal((await f.request("/assistant/chat","POST",{})).status,409);
 assert.equal(f.sql.prepare("SELECT owner FROM kroad_leases").get().owner,"other");f.sql.close();
});

import { withCloudRequest, trustedRequestOrigin } from "../../../apps/web/lib/cloud-context.mjs";
test("hosted admin Origin checks use the trusted public origin across the internal proxy",()=>{
 const internal="http://worker-internal.invalid/api/admin/login";
 const bridge=Object.assign(()=>{}, {publicOrigin:"https://kroad.test"});
 withCloudRequest(bridge,()=>assert.equal(trustedRequestOrigin(internal,undefined),"https://kroad.test"));
 assert.equal(trustedRequestOrigin(internal,"https://configured.test"),"https://configured.test");
 assert.equal(trustedRequestOrigin(internal,undefined),"http://worker-internal.invalid");
});
