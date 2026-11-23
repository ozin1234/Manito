import { NextRequest, NextResponse } from "next/server";
import { GroadApiError, isCoordinate, isRouteOption, planDrivingRoute } from "@/lib/groad-api";

export async function POST(request: NextRequest) {
  let body: { origin?: unknown; destination?: unknown; option?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ version: "1", error: { code: "INVALID_JSON", message: "JSON 요청 본문이 필요합니다." } }, { status: 400 }); }
  if (!body || !isCoordinate(body.origin) || !isCoordinate(body.destination))
    return NextResponse.json({ version: "1", error: { code: "INVALID_COORDINATE", message: "국내 출발지와 목적지의 위도·경도가 필요합니다." } }, { status: 400 });
  if (body.option !== undefined && !isRouteOption(body.option))
    return NextResponse.json({ version: "1", error: { code: "INVALID_OPTION", message: "지원하지 않는 경로 옵션입니다." } }, { status: 400 });
  try {
    const route = await planDrivingRoute(body.origin, body.destination, body.option ?? "recommended");
    return NextResponse.json({ version: "1", route }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("INTERNAL_ERROR", "경로 요청을 처리하지 못했습니다.", 500);
    return NextResponse.json({ version: "1", error: { code: problem.code, message: problem.message } }, { status: problem.status });
  }
}
