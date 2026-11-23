import { NextResponse } from "next/server";
import { getIndependentTile, GroadApiError } from "@/lib/groad-api";

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z: zText, x: xText, y: yText } = await context.params;
  const yValue = yText.endsWith(".png") ? yText.slice(0, -4) : yText;
  const [z, x, y] = [zText, xText, yValue].map(Number);
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z)
    return NextResponse.json({ error: { code: "INVALID_TILE", message: "지도 타일 좌표가 올바르지 않습니다." } }, { status: 400 });
  try {
    const tile = await getIndependentTile(z, x, y);
    return new Response(tile.body, { headers: { "Content-Type": tile.contentType, "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    const problem = error instanceof GroadApiError ? error : new GroadApiError("TILE_UNAVAILABLE", "지도 타일을 불러오지 못했습니다.", 503);
    return NextResponse.json({ error: { code: problem.code, message: problem.message } }, { status: problem.status });
  }
}
