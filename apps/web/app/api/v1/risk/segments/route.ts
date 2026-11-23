import { NextRequest, NextResponse } from "next/server";
import feed from "@/public/data/risk-feed.json";

const bands = new Set(["심각", "위험", "주의", "안전"]);

export function GET(request: NextRequest) {
  const band = request.nextUrl.searchParams.get("band");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "48");
  if (band && !bands.has(band))
    return NextResponse.json({ version: "1", error: { code: "INVALID_BAND", message: "band 값이 올바르지 않습니다." } }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 48)
    return NextResponse.json({ version: "1", error: { code: "INVALID_LIMIT", message: "limit은 1~48이어야 합니다." } }, { status: 400 });
  const bboxText = request.nextUrl.searchParams.get("bbox");
  const bbox = bboxText?.split(",").map(Number);
  if (bboxText && (!bbox || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]))
    return NextResponse.json({ version: "1", error: { code: "INVALID_BBOX", message: "bbox는 minLng,minLat,maxLng,maxLat 형식이어야 합니다." } }, { status: 400 });
  const segments = feed.segments.filter((segment) =>
    (!band || segment.riskBand === band) &&
    (!bbox || (segment.lng >= bbox[0] && segment.lng <= bbox[2] && segment.lat >= bbox[1] && segment.lat <= bbox[3]))
  ).slice(0, limit);
  return NextResponse.json({
    version: "1",
    dataMode: "validated_demo",
    samplePeriod: "2025",
    isLiveRisk: false,
    count: segments.length,
    segments,
  }, { headers: { "Cache-Control": "no-store" } });
}
