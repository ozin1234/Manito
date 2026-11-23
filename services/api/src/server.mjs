import { createServer } from "node:http";
import { handle } from "./api.mjs";

const config = {
  key: process.env.GROAD_API_KEY,
  osrmUrl: process.env.OSRM_URL ?? "http://127.0.0.1:5000",
  nominatimUrl: process.env.NOMINATIM_URL ?? "http://127.0.0.1:8080",
  tilesUrl: process.env.TILES_URL ?? "http://127.0.0.1:8081",
  itsApiKey: process.env.ITS_API_KEY,
  itsShapesPath: process.env.ITS_LINK_SHAPES_PATH,
  reportsDir: process.env.GROAD_REPORTS_DIR ?? "/app/data/reports",
  geminiApiKey: process.env.GEMINI_API_KEY,
  summaryModel: process.env.GROAD_SUMMARY_MODEL,
  uwatModel: process.env.UWAT_MODEL || "gemini-3.8-flash",
  knowledgePath: process.env.UWAT_KNOWLEDGE_PATH || undefined,
};
if (!config.key || config.key.length < 32) throw new Error("GROAD_API_KEY must contain at least 32 characters");
const port = Number(process.env.PORT ?? "8788");
const host = process.env.HOST ?? "127.0.0.1";

createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      const maxBodyBytes = incoming.method === "POST" && ["/v1/reports", "/v1/assistant/chat"].includes(incoming.url?.split("?")[0]) ? 4_300_000 : 8192;
      if (size > maxBodyBytes) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://localhost:${port}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const response = await handle(request, config);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    const body = response.body;
    if (body) for await (const chunk of body) outgoing.write(chunk);
    outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(400);
    outgoing.end();
  }
}).listen(port, host, () => console.log(`G-ROAD Independent API listening on ${host}:${port}`));
