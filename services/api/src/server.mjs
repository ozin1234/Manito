import { createServer } from "node:http";
import { handle } from "./api.mjs";
import { DEFAULT_UWAT_MODEL } from "./assistant.mjs";

const config = {
  key: process.env.KROAD_API_KEY,
  publicOrigin: process.env.KROAD_PUBLIC_ORIGIN,
  reportsDir: process.env.KROAD_REPORTS_DIR ?? "/app/data/reports",
  geminiApiKey: process.env.GEMINI_API_KEY,
  uwatModel: process.env.UWAT_MODEL || DEFAULT_UWAT_MODEL,
  knowledgePath: process.env.UWAT_KNOWLEDGE_PATH || undefined,
  adminUsername: process.env.KROAD_ADMIN_USERNAME,
  adminPasswordHash: process.env.KROAD_ADMIN_PASSWORD_HASH,
  adminSessionSecret: process.env.KROAD_ADMIN_SESSION_SECRET,
};
if (!config.key || config.key.length < 32) throw new Error("KROAD_API_KEY must contain at least 32 characters");
const port = Number(process.env.PORT ?? "8788");
const host = process.env.HOST ?? "127.0.0.1";

createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      const pathname = incoming.url?.split("?")[0];
      const maxBodyBytes = incoming.method === "POST" && ["/v1/reports", "/v1/assistant/chat"].includes(pathname) ? 4_300_000 : pathname === "/v1/reports/tracking" ? 24_000 : 8192;
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
}).listen(port, host, () => console.log(`K-ROAD API listening on ${host}:${port}`));
