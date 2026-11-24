import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createReport,listReports,getReportPhoto} from "../src/reports.mjs";
const jpeg="data:image/jpeg;base64,/9j/2Q==";
const approved=()=>({reportId:randomUUID(),issueType:"pothole",title:"노면의 구멍 확인",summary:"사진에서 노면의 구멍이 관찰됩니다.",model:"test-only-model",sources:[],reason:"사진 관찰",confirmedAt:new Date().toISOString()});
const payload=()=>({category:"danger",topic:"road",description:"현장 사진에 노면의 구멍이 관찰됩니다.",lat:37.87,lng:127.73,locationSource:"gps",locationAccuracyM:12,locationCapturedAt:new Date().toISOString(),photoDataUrl:jpeg});
async function store(work){const dir=await mkdtemp(path.join(os.tmpdir(),"kroad-photo-test-"));try{await work({reportsDir:dir});}finally{if(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))await rm(dir,{recursive:true,force:true});}}
test("confirmed photo records preserve their image and original description",()=>store(async config=>{
 const body=payload(),metadata=approved();const report=await createReport(body,config,metadata);assert.equal(report.id,metadata.reportId);assert.equal(report.description,body.description);assert.equal(report.summarySource,"llm_rag");assert.equal(report.agencyStatus,"not_submitted");assert.equal(report.locationAccuracyM,12);assert.equal((await listReports(config)).length,1);assert.deepEqual((await getReportPhoto(config,report.id)).bytes,Buffer.from([255,216,255,217]));
}));
test("photo storage rejects unapproved, malformed or incomplete data",()=>store(async config=>{
 await assert.rejects(createReport(payload(),config),error=>error.code==="CONFIRMATION_REQUIRED");
 for(const override of [{lat:91},{description:"a".repeat(2001)},{topic:"invalid"},{photoDataUrl:"data:image/svg+xml;base64,PHN2Zz4="},{locationAccuracyM:-1}])await assert.rejects(createReport({...payload(),...override},config,approved()));
 assert.deepEqual(await listReports(config),[]);
}));
