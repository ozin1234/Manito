import { NextRequest, NextResponse } from "next/server";
import { GroadApiError, isCoordinate, planDrivingRoute } from "@/lib/groad-api";

// Compatibility endpoint for older K-ROAD clients. New clients use /api/v1/routes/driving.
export async function POST(request: NextRequest) {
  let body: { start?: unknown; end?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "좌표 형식이 올바르지 않습니다." }, { status: 400 }); }
  if (!body || !isCoordinate(body.start) || !isCoordinate(body.end))
    return NextResponse.json({ error: "국내 출발지와 목적지 좌표가 필요합니다." }, { status: 400 });
  try {
    const route = await planDrivingRoute(body.start, body.end);
    return NextResponse.json({
      distanceM: route.distanceMeters, durationS: route.durationSeconds,
      coordinates: route.geometry.coordinates, provider: route.provider,
      calculatedAt: route.calculatedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("INTERNAL_ERROR", "자동차 경로를 찾지 못했습니다.", 500);
    return NextResponse.json({ error: problem.message }, { status: problem.status });
  }
}
