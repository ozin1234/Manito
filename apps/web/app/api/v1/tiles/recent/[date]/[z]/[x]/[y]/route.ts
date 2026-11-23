import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ date: string; z: string; x: string; y: string }> }) {
  const { date, z: zText, x: xText, y: yText } = await context.params;
  const yValue = yText.endsWith(".jpg") ? yText.slice(0, -4) : yText;
  const [z, x, y] = [zText, xText, yValue].map(Number);
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const ageDays = (Date.now() - dateValue) / 86_400_000;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 9 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z || !Number.isFinite(ageDays) || ageDays < 0 || ageDays > 8) {
    return NextResponse.json({ error: "최근 위성 타일 요청이 올바르지 않습니다." }, { status: 400 });
  }
  const source = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")) throw new Error("Satellite tile unavailable");
    return new Response(response.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "최근 위성 타일을 불러오지 못했습니다." }, { status: 503 });
  }
}
