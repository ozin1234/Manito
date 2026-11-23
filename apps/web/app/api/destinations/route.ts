import { NextRequest, NextResponse } from "next/server";
import { GroadApiError, searchPlaces } from "@/lib/groad-api";

// Compatibility endpoint for older G-ROAD clients. New clients use /api/v1/places.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80)
    return NextResponse.json({ error: "검색어를 2~80자로 입력해 주세요." }, { status: 400 });
  try {
    return NextResponse.json({ results: await searchPlaces(query, 6) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("INTERNAL_ERROR", "장소 검색을 처리하지 못했습니다.", 500);
    return NextResponse.json({ error: problem.message }, { status: problem.status });
  }
}
