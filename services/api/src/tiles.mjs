import { ApiError } from "./errors.mjs";
export async function getStreetTile(z, x, y, publicOrigin = "https://k-road-manito.hydroai4.chatgpt.site") {
  if (![z,x,y].every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new ApiError("INVALID_TILE", "지도 타일 좌표를 확인해 주세요.", 400);
  let response;
  try { response = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { headers: { "User-Agent": "K-ROAD/1.0 (+https://github.com/ozin1234/Manito)", Referer: publicOrigin }, signal: AbortSignal.timeout(20_000), cf: { cacheEverything: true, cacheTtl: 604800 } }); }
  catch { throw new ApiError("TILE_UNAVAILABLE", "지도 원본 서버에 연결할 수 없습니다.", 503); }
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new ApiError("TILE_UNAVAILABLE", "지도 응답을 확인하지 못했습니다.", 503);
  const headers = new Headers(response.headers); headers.set("Cache-Control", "public, max-age=604800"); headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: 200, headers });
}
