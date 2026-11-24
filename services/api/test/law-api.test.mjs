import test from "node:test";
import assert from "node:assert/strict";
import { fetchCurrentArticle } from "../src/law-api.mjs";

test("official law API adapter accepts an exact current law and article", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url.pathname.endsWith("lawSearch.do")) return Response.json({ LawSearch: { law: [{ 법령명한글: "도로법", 법령ID: "001823", 시행일자: "20260918" }] } });
    return Response.json({ 법령: { 기본정보: { 법령명_한글: "도로법" }, 조문: { 조문단위: { 조문번호: "31", 조문내용: "제31조(도로공사와 도로의 유지·관리 등) 도로의 유지·관리는 도로관리청이 수행한다.", 항: { 항내용: "① 다른 법률에 특별한 규정이 있는 경우는 제외한다." } } } } });
  };
  const article = await fetchCurrentArticle({ oc: "test-only-oc", lawName: "도로법", article: 31, fetchImpl });
  assert.equal(article.article, 31);
  assert.equal(article.effectiveDate, "20260918");
  assert.ok(article.text.includes("도로관리청"));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("nw"), "3");
  assert.equal(requests[1].searchParams.get("JO"), "003100");
});

test("official law API adapter rejects denied access and mismatched article", async () => {
  await assert.rejects(fetchCurrentArticle({ oc: "test-only-oc", lawName: "도로법", article: 31, fetchImpl: async () => Response.json({ result: "unauthorized" }) }), /인증/);
  let calls = 0;
  const fetchImpl = async () => ++calls === 1 ? Response.json({ LawSearch: { law: [{ 법령명한글: "도로법", 법령ID: "001823" }] } }) : Response.json({ 법령: { 기본정보: { 법령명_한글: "도로법" }, 조문: { 조문단위: { 조문번호: "30", 조문내용: "제30조 unrelated" } } } });
  await assert.rejects(fetchCurrentArticle({ oc: "test-only-oc", lawName: "도로법", article: 31, fetchImpl }), /조문을 하나로/);
});

test("official law API adapter ignores a chapter heading sharing the article number", async () => {
  let calls = 0;
  const fetchImpl = async () => ++calls === 1
    ? Response.json({ LawSearch: { law: [{ 법령명한글: "도로법", 법령ID: "001821" }] } })
    : Response.json({ 법령: { 기본정보: { 법령명_한글: "도로법" }, 조문: { 조문단위: [
      { 조문번호: "75", 조문내용: "제7장 도로의 보전 및 공용부담" },
      { 조문번호: "75", 조문내용: "제75조(도로에 관한 금지행위) 정당한 사유 없이 도로에 장애물을 쌓아놓아서는 아니 된다." },
    ] } } });
  const article = await fetchCurrentArticle({ oc: "test-only-oc", lawName: "도로법", article: 75, fetchImpl });
  assert.match(article.text, /^제75조/);
  assert.doesNotMatch(article.text, /제7장/);
});
