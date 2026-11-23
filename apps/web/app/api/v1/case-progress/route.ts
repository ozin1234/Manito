import { NextResponse } from "next/server";
export async function GET() {
  try {
    const base = process.env.GROAD_INDEPENDENT_API_URL, key = process.env.GROAD_INDEPENDENT_API_KEY;
    if (!base || !key) throw new Error();
    const response = await fetch(new URL("/v1/case-progress", base), { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: { code: "MANAGEMENT_UNAVAILABLE", message: "관리 진행 상황을 불러오지 못했습니다." } }, { status: 503 }); }
}
