import { NextRequest, NextResponse } from "next/server";
import { GroadApiError, searchPlaces } from "@/lib/groad-api";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitValue = request.nextUrl.searchParams.get("limit") ?? "8";
  const limit = Number(limitValue);
  if (query.length < 2 || query.length > 80)
    return NextResponse.json({ version: "1", error: { code: "INVALID_QUERY", message: "검색어를 2~80자로 입력해 주세요." } }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    return NextResponse.json({ version: "1", error: { code: "INVALID_LIMIT", message: "limit은 1~10이어야 합니다." } }, { status: 400 });
  try {
    const places = await searchPlaces(query, limit);
    return NextResponse.json({ version: "1", provider: "groad-nominatim", query, places }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("INTERNAL_ERROR", "장소 검색을 처리하지 못했습니다.", 500);
    return NextResponse.json({ version: "1", error: { code: problem.code, message: problem.message } }, { status: problem.status });
  }
}
