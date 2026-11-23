import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const defaultPath = fileURLToPath(new URL("./knowledge/road-safety.json", import.meta.url));
const indexes = new Map();
export function tokenize(text) {
  const words = String(text).toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) ?? [];
  return words.flatMap((word) => /^[가-힣]+$/.test(word) ? [word, ...Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2))] : [word]);
}
async function load(path) {
  const info = await stat(path);
  const cached = indexes.get(path);
  if (cached && cached.modified === info.mtimeMs && cached.size === info.size) return cached;
  const documents = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(documents) || !documents.length || documents.length > 1000) throw new Error("Invalid RAG knowledge corpus");
  const seen = new Set();
  const rows = documents.map((document) => {
    if (!/^[a-z0-9-]+$/.test(document.id) || seen.has(document.id) || !document.text || !document.title || !["official", "product"].includes(document.authority)) throw new Error("Invalid RAG document");
    seen.add(document.id);
    const terms = tokenize(`${document.title} ${document.text}`);
    return { document, length: terms.length, frequencies: terms.reduce((map, term) => map.set(term, (map.get(term) ?? 0) + 1), new Map()) };
  });
  const index = { rows, average: rows.reduce((sum, row) => sum + row.length, 0) / rows.length, modified: info.mtimeMs, size: info.size };
  indexes.set(path, index);
  return index;
}
export async function retrieveKnowledge(query, knowledgePath = defaultPath) {
  const index = await load(knowledgePath);
  const terms = [...new Set(tokenize(query))];
  const ranked = index.rows.map((row) => {
    let score = 0;
    for (const term of terms) {
      const frequency = row.frequencies.get(term) ?? 0;
      const count = index.rows.filter((candidate) => candidate.frequencies.has(term)).length;
      if (frequency) score += Math.log(1 + (index.rows.length - count + 0.5) / (count + 0.5)) * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * row.length / index.average));
    }
    return { ...row.document, score: Number(score.toFixed(5)) };
  }).sort((a, b) => b.score - a.score);
  const required = new Set(["manito-topics", "manito-photo-uncertainty", "manito-consent", "official-report-status"]);
  const chosen = [...ranked.filter((row) => required.has(row.id)), ...ranked.filter((row) => !required.has(row.id)).slice(0, 4)];
  return chosen;
}
