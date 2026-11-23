import { NextResponse } from "next/server";
import { getTrafficSegments, GroadApiError } from "@/lib/groad-api";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("bbox") ?? "127.4,37.0,129.4,38.6";
  const bbox = value.split(",").map(Number);
  if (bbox.length !== 4 || bbox.some((part) => !Number.isFinite(part)) || bbox[0] < 124 || bbox[2] > 132 || bbox[1] < 33 || bbox[3] > 39 || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[2] - bbox[0] > 2 || bbox[3] - bbox[1] > 2)
    return NextResponse.json({ error: { code: "INVALID_BBOX", message: "교통정보 조회 영역이 올바르지 않습니다." } }, { status: 400 });
  try { return NextResponse.json(await getTrafficSegments(bbox as [number, number, number, number]), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("TRAFFIC_UNAVAILABLE", "교통정보를 불러오지 못했습니다.", 503);
    return NextResponse.json({ error: { code: problem.code, message: problem.message } }, { status: problem.status });
  }
}
