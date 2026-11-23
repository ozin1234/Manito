// Development-only HTTP verification. The write check is restricted to an empty,
// newly created Manito Docker store and removes only its own synthetic record.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.loadEnvFile(path.join(root, ".env"));
const web = `http://127.0.0.1:${process.env.MANITO_WEB_PORT || "5174"}`;
const api = `http://127.0.0.1:${process.env.MANITO_API_PORT || "8790"}`;
const compose = ["compose", "--project-name", "manito-dev", "--file", "compose.shared-maps.yaml"];
const evidence = { checkedAt: new Date().toISOString(), web, api, checks: [], deviceGpsTested: false, cameraTested: false, actualAiProviderTested: false };
async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(60_000) });
}
function pass(name) { evidence.checks.push(name); console.log(`PASS: ${name}`); }
let createdId;
try {
  assert.equal((await request(`${api}/health`)).status, 200);
  pass("Manito API health");
  assert.equal((await request(`${api}/v1/reports`)).status, 401);
  pass("Direct API rejects unauthenticated requests");
  const home = await request(web);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes("G-ROAD"));
  pass("Existing reporting page renders");
  const listed = await request(`${web}/api/v1/reports`);
  assert.equal(listed.status, 200);
  const initialReports = (await listed.json()).reports;
  assert.ok(Array.isArray(initialReports));
  pass("Web proxy reads Manito report storage");
  const tile = await request(`${web}/api/v1/tiles/9/438/196.png`);
  assert.equal(tile.status, 200);
  assert.match(tile.headers.get("content-type"), /image\/png/);
  assert.ok((await tile.arrayBuffer()).byteLength > 100);
  pass("Street map tile resolves through the new API");

  if (process.argv.includes("--write-report")) {
    const inspected = spawnSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", "manito-dev-manito-api-1"], { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.equal(inspected.status, 0, "Write smoke test requires the Manito Docker API.");
    const bindings = JSON.parse(inspected.stdout)["8788/tcp"] ?? [];
    assert.ok(bindings.some((binding) => binding.HostIp === "127.0.0.1" && binding.HostPort === new URL(api).port), "The Manito Docker API must own the tested API port.");
    assert.equal(initialReports.length, 0, "Write smoke test requires an empty Manito store.");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=";
    const measuredAt = new Date().toISOString();
    const payload = { category: "danger", description: "[Manito smoke] 개발 검증용 도로 파손 제보입니다. 실제 시민 제보가 아닙니다.", lat: 37.874, lng: 127.734, locationSource: "gps", locationAccuracyM: 12.4, locationCapturedAt: measuredAt, allowAiProcessing: false, photoDataUrl: `data:image/png;base64,${png}` };
    const created = await request(`${web}/api/v1/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(created.status, 201);
    const report = (await created.json()).report;
    createdId = report.id;
    assert.match(createdId, /^[0-9a-f-]{36}$/);
    assert.equal(report.locationCapturedAt, measuredAt);
    assert.equal(report.locationAccuracyM, 12.4);
    assert.equal(report.status, "draft");
    assert.equal(report.agencyStatus, "not_submitted");
    assert.equal(report.summarySource, "rule_based");
    pass("Photo report and simulated GPS metadata persist through the web proxy");
    let fetched = await request(`${web}${report.photoUrl}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), Buffer.from(png, "base64"));
    pass("Stored photo bytes can be retrieved");
    const restarted = spawnSync("docker", [...compose, "restart", "manito-api"], { cwd: root, encoding: "utf8", timeout: 60_000 });
    assert.equal(restarted.status, 0, "Restarting the Manito API failed.");
    let restored = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const response = await request(`${web}/api/v1/reports`);
        if (response.ok && (await response.json()).reports.some((item) => item.id === createdId)) { restored = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(restored);
    fetched = await request(`${web}${report.photoUrl}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), Buffer.from(png, "base64"));
    pass("Report and photo survive a Manito API container restart");
    evidence.writeCheck = "synthetic development record, not device GPS or a real citizen report";
  }
} finally {
  if (createdId) {
    const cleanup = `import { readFile, unlink } from 'node:fs/promises'; const id = process.argv[1]; if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('Invalid test id'); const base='/app/data/reports/'; const report=JSON.parse(await readFile(base+id+'.json','utf8')); if (!report.description.startsWith('[Manito smoke]')) throw Error('Not a smoke record'); if (report.photoExtension === 'png') await unlink(base+id+'.png'); await unlink(base+id+'.json');`;
    const removed = spawnSync("docker", [...compose, "exec", "-T", "manito-api", "node", "--input-type=module", "-e", cleanup, createdId], { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(removed.status, 0, "The synthetic smoke record needs cleanup.");
    pass("Only the synthetic development record was removed");
  }
  mkdirSync(path.join(root, ".local"), { recursive: true });
  writeFileSync(path.join(root, ".local/smoke-result.json"), JSON.stringify(evidence, null, 2) + "\n");
}
