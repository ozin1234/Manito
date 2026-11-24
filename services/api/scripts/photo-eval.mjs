import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { handle } from "../src/api.mjs";
import { DEFAULT_UWAT_MODEL } from "../src/assistant.mjs";

const manifestPath = process.argv[2];
if (!manifestPath || !process.env.GEMINI_API_KEY) {
  process.stderr.write("Usage: GEMINI_API_KEY=<server key> node services/api/scripts/photo-eval.mjs <labeled-manifest.json>\n");
  process.exitCode = 2;
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error("Manifest must be a nonempty array");
  const root = path.dirname(path.resolve(manifestPath));
  const reportsDir = await mkdtemp(path.join(tmpdir(), "manito-photo-eval-"));
  const key = "0123456789abcdef0123456789abcdef";
  const results = [];
  const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  try {
    for (const item of manifest) {
      if (!item || typeof item.id !== "string" || typeof item.file !== "string" || typeof item.selectedTopic !== "string" || typeof item.expectedIntent !== "string" || (item.expectedTopic !== null && typeof item.expectedTopic !== "string") || typeof item.expectedIssueType !== "string" || typeof item.expectedReady !== "boolean") throw new Error("Each case needs id, file, selectedTopic, expectedIntent, expectedTopic, expectedIssueType, expectedReady");
      const imageMime = mime[path.extname(item.file).toLowerCase()];
      if (!imageMime) throw new Error(`Unsupported image type for ${item.id}`);
      const image = await readFile(path.resolve(root, item.file));
      const photoDataUrl = `data:${imageMime};base64,${image.toString("base64")}`;
      const started = performance.now();
      const response = await handle(new Request("http://photo-eval.test/v1/assistant/chat", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ topic: item.selectedTopic, photoDataUrl, allowAiProcessing: true }),
      }), { key, reportsDir, geminiApiKey: process.env.GEMINI_API_KEY, uwatModel: process.env.UWAT_MODEL || DEFAULT_UWAT_MODEL });
      const body = await response.json();
      const analysis = response.ok ? body.analysis : null;
      const typeCorrect = analysis ? analysis.intent === item.expectedIntent && (item.expectedIntent === "no_issue" || analysis.suggestedTopic === item.expectedTopic) && analysis.issueType === item.expectedIssueType : null;
      const readinessCorrect = analysis ? analysis.ready === item.expectedReady : null;
      const correct = analysis ? typeCorrect && readinessCorrect : null;
      const result = { id: item.id, expected: { intent: item.expectedIntent, topic: item.expectedTopic, issueType: item.expectedIssueType, ready: item.expectedReady }, httpStatus: response.status, durationMs: Math.round(performance.now() - started), observed: analysis ? { intent: analysis.intent, topic: analysis.suggestedTopic, issueType: analysis.issueType, ready: analysis.ready, uncertainty: analysis.uncertainty, sourceIds: analysis.sourceIds } : null, typeCorrect, readinessCorrect, correct, errorCode: response.ok ? null : body.error?.code ?? "UNKNOWN" };
      results.push(result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    await rm(reportsDir, { recursive: true, force: true });
  }
  const successful = results.filter((row) => row.httpStatus === 200);
  const correct = successful.filter((row) => row.correct).length;
  const typeCorrect = successful.filter((row) => row.typeCorrect).length;
  const readinessCorrect = successful.filter((row) => row.readinessCorrect).length;
  const durations = successful.map((row) => row.durationMs).sort((a, b) => a - b);
  const percentile = (p) => durations.length ? durations[Math.ceil(p * durations.length) - 1] : null;
  const byIssueType = {};
  for (const row of results) {
    const group = byIssueType[row.expected.issueType] ??= { images: 0, successful: 0, typeCorrectOnSuccessful: 0, readinessCorrectOnSuccessful: 0, exactCorrectOnSuccessful: 0 };
    group.images++;
    if (row.httpStatus === 200) { group.successful++; if (row.typeCorrect) group.typeCorrectOnSuccessful++; if (row.readinessCorrect) group.readinessCorrectOnSuccessful++; if (row.correct) group.exactCorrectOnSuccessful++; }
  }
  process.stdout.write(`${JSON.stringify({ summary: { images: results.length, successful: successful.length, typeCorrectOnSuccessful: typeCorrect, readinessCorrectOnSuccessful: readinessCorrect, exactCorrectOnSuccessful: correct, failed: results.length - successful.length, p50MsOnSuccessful: percentile(0.5), p95MsOnSuccessful: percentile(0.95), byIssueType } })}\n`);
}
