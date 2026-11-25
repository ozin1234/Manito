import { NextResponse } from "next/server";
export async function POST(request: Request) {
  const base = process.env.KROAD_API_URL, key = process.env.KROAD_API_KEY;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!base || !key) return NextResponse.json({ error: { message: "접수 조회 서버 설정을 확인해 주세요." } }, { status: 503, headers });
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 24_000) return NextResponse.json({ error: { message: "조회할 접수증이 너무 많습니다." } }, { status: 413, headers });
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 24_000) return NextResponse.json({ error: { message: "접수증 크기를 확인해 주세요." } }, { status: 413, headers });
    const result = await fetch(new URL("/v1/reports/tracking", base), { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    return NextResponse.json(await result.json(), { status: result.status, headers });
  } catch { return NextResponse.json({ error: { message: "접수 현황을 확인하지 못했습니다. 접수증은 유지됩니다." } }, { status: 503, headers }); }
}
