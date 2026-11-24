import { readFile, stat, registerBundledJson } from "./storage.mjs";
import { fileURLToPath } from "node:url";

const corpusPath = name => import.meta.url?.startsWith("file:")
  ? fileURLToPath(new URL("./knowledge/" + name, import.meta.url)) : "kroad-bundled:" + name;
const defaultPath = corpusPath("road-safety.json");
const photoPath = corpusPath("photo-classification.json");
const regulationPath = corpusPath("regulations.json");
import roadKnowledge from "./knowledge/road-safety.json" with { type: "json" };
import photoKnowledge from "./knowledge/photo-classification.json" with { type: "json" };
import regulations from "./knowledge/regulations.json" with { type: "json" };
registerBundledJson(defaultPath, roadKnowledge);
registerBundledJson(photoPath, photoKnowledge);
registerBundledJson(regulationPath, regulations);
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
function rank(index, query) {
  const terms = [...new Set(tokenize(query))];
  return index.rows.map((row) => {
    let score = 0;
    for (const term of terms) {
      const frequency = row.frequencies.get(term) ?? 0;
      const count = index.rows.filter((candidate) => candidate.frequencies.has(term)).length;
      if (frequency) score += Math.log(1 + (index.rows.length - count + 0.5) / (count + 0.5)) * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * row.length / index.average));
    }
    return { ...row.document, score: Number(score.toFixed(5)) };
  }).sort((a, b) => b.score - a.score);
}
export async function retrieveKnowledge(query, knowledgePath = defaultPath) {
  const ranked = rank(await load(knowledgePath), query);
  const required = new Set(["manito-topics", "manito-photo-uncertainty", "manito-consent", "official-report-status"]);
  const chosen = [...ranked.filter((row) => required.has(row.id)), ...ranked.filter((row) => !required.has(row.id)).slice(0, 4)];
  return chosen;
}

const byTopic = {
  living: new Set(["photo-trash-scattered", "photo-streetlight", "photo-facility"]),
  road: new Set(["photo-pothole", "photo-road-damage", "photo-obstruction"]),
  safety: new Set(["photo-flooding", "photo-ice", "photo-rockfall", "photo-safety-facility"]),
};
export async function retrievePhotoTaxonomy(query, selectedTopic, knowledgePath = photoPath) {
  const ranked = rank(await load(knowledgePath), query);
  const mandatory = new Set(["photo-taxonomy-overview", "photo-none", "photo-uncertain-other"]);
  const selected = byTopic[selectedTopic] ?? new Set();
  const chosen = [...ranked.filter((row) => mandatory.has(row.id)), ...ranked.filter((row) => selected.has(row.id))];
  const existing = new Set(chosen.map((row) => row.id));
  // The small taxonomy is kept at full recall so a wrong browsing tab cannot hide a class.
  chosen.push(...ranked.filter((row) => !existing.has(row.id)));
  return chosen;
}

export async function retrieveRegulatoryGuidance(issueType, knowledgePath = regulationPath) {
  if (!issueType || issueType === "none") return [];
  const { rows } = await load(knowledgePath);
  return rows.filter(({ document }) => Array.isArray(document.issueTypes) && document.issueTypes.includes(issueType))
    .map(({ document }) => ({ id: document.id, title: document.title, authority: document.authority, url: document.url, checkedAt: document.apiCheckedAt ?? document.checkedAt, appliesWhen: document.appliesWhen, text: document.text }));
}

export async function retrieveRegulatoryContext(knowledgePath = regulationPath) {
  const { rows } = await load(knowledgePath);
  // Keep legal IDs out of the model prompt: sourceIds is reserved for photo/service evidence.
  return rows.map(({ document }) => ({ title: document.title, issueTypes: document.issueTypes, appliesWhen: document.appliesWhen, text: document.text, ...(document.officialText ? { officialText: document.officialText.slice(0, 1600), apiCheckedAt: document.apiCheckedAt } : {}) }));
}
