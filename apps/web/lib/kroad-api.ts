export class KroadApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function getMapTile(z: number, x: number, y: number) {
  const base = process.env.KROAD_API_URL, key = process.env.KROAD_API_KEY;
  if (!base || !key) throw new KroadApiError("API_NOT_CONFIGURED", "K-ROAD API 연결을 확인해 주세요.", 503);
  try {
    const response = await fetch(new URL(`/v1/tiles/${z}/${x}/${y}.png`, base), { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(25000), cache: "no-store" });
    if (!response.ok) throw new Error();
    return { body: response.body, contentType: response.headers.get("content-type") ?? "image/png" };
  } catch { throw new KroadApiError("TILE_UNAVAILABLE", "지도 타일을 불러오지 못했습니다.", 503); }
}
