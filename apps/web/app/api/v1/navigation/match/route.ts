import { NextRequest, NextResponse } from "next/server";
import { GroadApiError, isCoordinate, matchGpsTrace, type GpsTracePoint } from "@/lib/groad-api";

function isGpsTracePoint(value: unknown): value is GpsTracePoint {
  if (!isCoordinate(value)) return false;
  const point = value as Partial<GpsTracePoint>;
  return typeof point.accuracy === "number" && Number.isFinite(point.accuracy) &&
    point.accuracy >= 1 && point.accuracy <= 80 &&
    typeof point.timestamp === "number" && Number.isFinite(point.timestamp);
}

export async function POST(request: NextRequest) {
  let body: { points?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ version: "1", error: { code: "INVALID_JSON", message: "GPS 좌표 JSON이 필요합니다." } }, { status: 400 }); }
  const points = body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 20 ||
      !points.every(isGpsTracePoint) ||
      points.some((point, index) => index > 0 && point.timestamp <= points[index - 1].timestamp))
    return NextResponse.json({ version: "1", error: { code: "INVALID_TRACE", message: "시간순 GPS 좌표 2~20개가 필요합니다." } }, { status: 400 });
  try {
    const match = await matchGpsTrace(points);
    return NextResponse.json({ version: "1", match }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("INTERNAL_ERROR", "GPS 도로 맞춤을 처리하지 못했습니다.", 500);
    return NextResponse.json({ version: "1", error: { code: problem.code, message: problem.message } }, { status: problem.status });
  }
}
