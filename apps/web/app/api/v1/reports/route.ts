import { NextResponse } from "next/server";

const MAX_BODY = 4_300_000;

function engine() {
  const base = process.env.GROAD_INDEPENDENT_API_URL;
  const key = process.env.GROAD_INDEPENDENT_API_KEY;
  if (!base || !key) throw new Error("ENGINE_NOT_CONFIGURED");
  return { base, key };
}

function unavailable() {
  return NextResponse.json({ version: "1", error: { code: "REPORTS_UNAVAILABLE", message: "제보 저장 서버에 연결할 수 없습니다." } }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const { base, key } = engine();
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "100");
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      return NextResponse.json({ version: "1", error: { code: "INVALID_LIMIT", message: "limit은 1~200이어야 합니다." } }, { status: 400 });
    const response = await fetch(new URL(`/v1/reports?limit=${limit}`, base), {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return unavailable();
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  try {
    const { base, key } = engine();
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY)
      return NextResponse.json({ version: "1", error: { code: "REQUEST_TOO_LARGE", message: "사진은 3MB 이하로 줄여 주세요." } }, { status: 413 });
    const raw = await request.text();
    if (raw.length > MAX_BODY)
      return NextResponse.json({ version: "1", error: { code: "REQUEST_TOO_LARGE", message: "사진은 3MB 이하로 줄여 주세요." } }, { status: 413 });
    const response = await fetch(new URL("/v1/reports", base), {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: raw, cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null);
    if (!payload) return unavailable();
    return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}
