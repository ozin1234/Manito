import { NextResponse } from "next/server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const base = process.env.KROAD_API_URL, key = process.env.KROAD_API_KEY;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!base || !key) return NextResponse.json({ error: { message: "위치 저장 서버 설정을 확인해 주세요." } }, { status: 503, headers });
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: { message: "접수 번호를 확인해 주세요." } }, { status: 400, headers });
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 8192) return NextResponse.json({ error: { message: "요청이 너무 큽니다." } }, { status: 413, headers });
    const result = await fetch(new URL(`/v1/reports/${id}/location`, base), { method: "PATCH", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    return NextResponse.json(await result.json(), { status: result.status, headers });
  } catch { return NextResponse.json({ error: { message: "위치를 저장하지 못했습니다. 접수 내역은 유지됩니다." } }, { status: 503, headers }); }
}
