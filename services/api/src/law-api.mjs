const BASE = "https://www.law.go.kr/DRF/";

function objects(value) {
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(objects)];
}

async function requestJson(endpoint, params, fetchImpl) {
  const url = new URL(endpoint, BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  let response;
  try { response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) }); }
  catch { throw new Error("법제처 API에 연결하지 못했습니다."); }
  if (!response.ok) throw new Error(`법제처 API 응답 오류: ${response.status}`);
  let body;
  try { body = await response.json(); }
  catch { throw new Error("법제처 API가 JSON을 반환하지 않았습니다."); }
  if (body.result || body.error) throw new Error("법제처 API 인증 또는 호출 조건을 확인해 주세요.");
  return body;
}

export async function fetchCurrentArticle({ oc, lawName, article, fetchImpl = fetch }) {
  if (!oc || !lawName || !Number.isInteger(article) || article < 1 || article > 9999) throw new Error("법령 조회 입력이 올바르지 않습니다.");
  const search = await requestJson("lawSearch.do", { OC: oc, target: "eflaw", type: "JSON", nw: 3, query: lawName, display: 100 }, fetchImpl);
  const matches = objects(search).filter((value) => value["법령명한글"] === lawName && /^\d+$/.test(String(value["법령ID"] ?? "")));
  if (matches.length !== 1) throw new Error(`현행 법령을 하나로 확인하지 못했습니다: ${lawName}`);
  const id = String(matches[0]["법령ID"]);
  const detail = await requestJson("lawService.do", { OC: oc, target: "eflaw", type: "JSON", ID: id, JO: `${String(article).padStart(4, "0")}00` }, fetchImpl);
  const names = objects(detail).map((value) => value["법령명_한글"]).filter((value) => typeof value === "string");
  if (!names.includes(lawName)) throw new Error(`본문의 법령명이 일치하지 않습니다: ${lawName}`);
  // The API can return a chapter heading with the same 조문번호 before the article.
  const heading = new RegExp(`^\\s*제${article}조(?:\\(|\\s|$)`);
  const articles = objects(detail).filter((value) => Number(value["조문번호"]) === article && typeof value["조문내용"] === "string" && heading.test(value["조문내용"]));
  if (articles.length !== 1) throw new Error(`조문을 하나로 확인하지 못했습니다: ${lawName} 제${article}조`);
  const articleNode = articles[0];
  const text = objects(articleNode).flatMap((value) => [value["조문내용"], value["항내용"], value["호내용"], value["목내용"]]).filter((value) => typeof value === "string" && value.trim()).join("\n");
  if (!text.includes(`제${article}조`) || text.length < 20 || text.length > 20_000) throw new Error(`조문 본문을 확인하지 못했습니다: ${lawName} 제${article}조`);
  return { lawName, article, lawId: id, effectiveDate: String(matches[0]["시행일자"] ?? ""), text };
}
