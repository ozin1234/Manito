import { NextResponse } from "next/server";

const actions = new Set(["status", "chat", "commit"]);
async function proxy(request: Request, action: string) {
  const base = process.env.KROAD_API_URL;
  const key = process.env.KROAD_API_KEY;
  if (!actions.has(action) || (request.method === "GET") !== (action === "status")) return NextResponse.json({ error: { code: "NOT_FOUND", message: "지원하지 않는 우왓 요청입니다." } }, { status: 404 });
  if (!base || !key) return NextResponse.json({ error: { code: "ASSISTANT_BACKEND_NOT_CONFIGURED", message: "우왓 서버 연결 설정을 확인해 주세요." } }, { status: 503 });
  try {
    const limit = action === "chat" ? 4_300_000 : 8192;
    if (Number(request.headers.get("content-length") ?? "0") > limit) return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "사진과 대화의 크기를 줄여 주세요." } }, { status: 413 });
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && new TextEncoder().encode(body).length > limit) return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "사진과 대화의 크기를 줄여 주세요." } }, { status: 413 });
    const response = await fetch(new URL(`/v1/assistant/${action}`, base), { method: request.method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(100_000), cache: "no-store" });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "ASSISTANT_UNAVAILABLE", message: "우왓 서버 응답을 받지 못했습니다. 입력은 유지되며 자동 저장하지 않았습니다." } }, { status: 503 });
  }
}
export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) { return proxy(request, (await params).action); }
