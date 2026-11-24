export type Coordinate = { lat: number; lng: number };
export type RouteOption = "recommended";
export type Place = { id: string; name: string; detail: string; lat: number; lng: number };
export type RouteStep = { instruction: string; roadName: string; turnCode: number | string; coordinate: [number, number] };
export type DrivingRoute = {
  provider: "groad-osrm";
  option: RouteOption;
  distanceMeters: number;
  durationSeconds: number;
  trafficAware: false;
  tollFareKrw: null;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  steps: RouteStep[];
  calculatedAt: string;
};

export class GroadApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

function engineConfig() {
  const base = process.env.GROAD_INDEPENDENT_API_URL;
  const key = process.env.GROAD_INDEPENDENT_API_KEY;
  if (!base || !key) throw new GroadApiError("ENGINE_NOT_CONFIGURED", "K-ROAD 독립 지도 엔진 서버가 아직 연결되지 않았습니다.", 503);
  return { base, key };
}

export function independentEngineEnabled() {
  return Boolean(process.env.GROAD_INDEPENDENT_API_URL && process.env.GROAD_INDEPENDENT_API_KEY);
}

export function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Coordinate>;
  return typeof point.lat === "number" && typeof point.lng === "number" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= 33 && point.lat <= 39 && point.lng >= 124 && point.lng <= 132;
}

export function isRouteOption(value: unknown): value is RouteOption {
  return value === "recommended";
}

async function engineRequest(path: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const config = engineConfig();
  try {
    const response = await fetch(new URL(path, config.base), {
      ...init,
      headers: { Authorization: `Bearer ${config.key}`, Accept: "application/json", ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401) throw new GroadApiError("ENGINE_AUTH", "K-ROAD 독립 지도 엔진 인증을 확인해야 합니다.", 503);
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new GroadApiError(payload?.error?.message ? "ENGINE_ERROR" : "ENGINE_UNAVAILABLE", payload?.error?.message ?? "K-ROAD 독립 지도 엔진 요청에 실패했습니다.", response.status >= 500 ? 503 : response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof GroadApiError) throw error;
    throw new GroadApiError("ENGINE_UNAVAILABLE", "K-ROAD 독립 지도 엔진에 연결할 수 없습니다.", 503);
  }
}

async function engineJson(path: string, init?: RequestInit, timeoutMs?: number): Promise<unknown> {
  const response = await engineRequest(path, init, timeoutMs);
  try { return await response.json(); }
  catch { throw new GroadApiError("ENGINE_RESPONSE", "K-ROAD 독립 지도 엔진 응답을 읽을 수 없습니다.", 502); }
}

export async function searchPlaces(query: string, limit = 8): Promise<Place[]> {
  const url = new URLSearchParams({ q: query, limit: String(limit) });
  const result = await engineJson(`/v1/places?${url}`) as { places?: Place[] };
  if (!Array.isArray(result.places)) throw new GroadApiError("ENGINE_RESPONSE", "K-ROAD 장소 검색 결과 형식이 올바르지 않습니다.", 502);
  return result.places;
}

export async function planDrivingRoute(origin: Coordinate, destination: Coordinate, option: RouteOption = "recommended"): Promise<DrivingRoute> {
  if (option !== "recommended") throw new GroadApiError("INVALID_OPTION", "현재 독립 엔진은 추천 경로만 지원합니다.", 400);
  const result = await engineJson("/v1/routes/driving", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination, option }),
  }) as { route?: DrivingRoute };
  if (!result.route || result.route.provider !== "groad-osrm" || !Array.isArray(result.route.geometry?.coordinates))
    throw new GroadApiError("ENGINE_RESPONSE", "K-ROAD 경로 결과 형식이 올바르지 않습니다.", 502);
  return result.route;
}

export async function getIndependentTile(z: number, x: number, y: number) {
  const response = await engineRequest(`/v1/tiles/${z}/${x}/${y}.png`, {}, 120000);
  return { body: response.body, contentType: response.headers.get("content-type") ?? "image/png" };
}

export async function getSatelliteTile(z: number, x: number, y: number) {
  const source = new URL("https://wmts.terrascope.be/");
  source.search = new URLSearchParams({ SERVICE: "WMTS", REQUEST: "GetTile", VERSION: "1.0.0", LAYER: "esa-worldcover-s2rgbnir-10m-2021-v2_tcc", STYLE: "default", FORMAT: "image/png", TILEMATRIXSET: "EPSG:3857", TILEMATRIX: String(z), TILECOL: String(x), TILEROW: String(y), TIME: "2021-01-01" }).toString();
  let response;
  try { response = await fetch(source, { signal: AbortSignal.timeout(30000) }); }
  catch { throw new GroadApiError("SATELLITE_UNAVAILABLE", "위성사진 원본 서버에 연결할 수 없습니다.", 503); }
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png"))
    throw new GroadApiError("SATELLITE_UNAVAILABLE", "위성사진 원본을 불러오지 못했습니다.", 503);
  return { body: response.body, contentType: "image/png" };
}

export type TrafficSegment = { linkId: string; roadName: string; speedKph: number; collectedAt: string | null; isFresh: boolean; geometry?: { type: "LineString" | "MultiLineString"; coordinates: [number, number][] | [number, number][][] } };
export type TrafficSnapshot = { version: "1"; available: boolean; isLive: boolean; source: string; reason?: string; retrievedAt?: string; count?: number; freshCount?: number; matchedCount?: number; slowest?: TrafficSegment[]; segments: TrafficSegment[] };

export async function getTrafficSegments(bbox: [number, number, number, number]): Promise<TrafficSnapshot> {
  const result = await engineJson(`/v1/traffic/segments?bbox=${bbox.join(",")}`, {}, 70_000) as TrafficSnapshot;
  if (!Array.isArray(result.segments) || typeof result.available !== "boolean")
    throw new GroadApiError("ENGINE_RESPONSE", "교통정보 응답 형식이 올바르지 않습니다.", 502);
  return result;
}

export type GpsTracePoint = Coordinate & { accuracy: number; timestamp: number };
export type RoadMatch = { point: Coordinate; snapDistanceMeters: number; confidence: number | null; isEstimated: true; provider: "groad-osrm" };

export async function matchGpsTrace(points: GpsTracePoint[]): Promise<RoadMatch> {
  const result = await engineJson("/v1/navigation/match", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points }),
  }) as { match?: RoadMatch };
  if (!result.match || !isCoordinate(result.match.point) || result.match.provider !== "groad-osrm")
    throw new GroadApiError("ENGINE_RESPONSE", "도로 맞춤 결과 형식이 올바르지 않습니다.", 502);
  return result.match;
}
