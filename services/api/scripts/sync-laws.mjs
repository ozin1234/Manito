import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { fetchCurrentArticle } from "../src/law-api.mjs";

const corpusPath = fileURLToPath(new URL("../src/knowledge/regulations.json", import.meta.url));
const oc = process.env.LAW_API_OC;
if (!oc) throw new Error("LAW_API_OC가 필요합니다. 법제처 공동활용에서 OC와 서버 IP·도메인을 등록해 주세요.");

const target = {
  "law-waste-disposal-place": ["폐기물관리법", 8],
  "law-waste-local-discharge": ["폐기물관리법", 15],
  "law-road-maintenance": ["도로법", 31],
  "law-road-accessories": ["도로법 시행령", 3],
  "law-road-obstruction": ["도로법", 75],
  "law-road-restriction": ["도로법", 76],
  "law-traffic-signals": ["도로교통법", 3],
  "law-traffic-accident-measures": ["도로교통법", 54],
  "law-urban-park-management": ["도시공원 및 녹지 등에 관한 법률", 19],
  "law-steep-slope-inspection": ["급경사지 재해예방에 관한 법률", 5],
};
const documents = JSON.parse(await readFile(corpusPath, "utf8"));
if (documents.length !== Object.keys(target).length || documents.some((row) => !target[row.id])) throw new Error("검토 대상 조문 목록이 변경되어 동기화를 중단했습니다.");
const checkedAt = new Date().toISOString().slice(0, 10);
const updated = [];
for (const row of documents) {
  const [lawName, article] = target[row.id];
  const result = await fetchCurrentArticle({ oc, lawName, article });
  updated.push({ ...row, officialText: result.text, apiEffectiveDate: result.effectiveDate, apiCheckedAt: checkedAt });
  process.stdout.write(`${row.id} 현행 조문 확인\n`);
}
const temporary = `${corpusPath}.${randomUUID()}.tmp`;
await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { flag: "wx" });
await rename(temporary, corpusPath);
process.stdout.write(`${updated.length}개 공식 조문을 모두 확인한 뒤 법령 코퍼스를 갱신했습니다.\n`);
