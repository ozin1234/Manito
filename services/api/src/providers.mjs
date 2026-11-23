import { validPoint } from "./geo.mjs";

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function providerJson(url, timeout = 12_000) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError("ENGINE_UNAVAILABLE", "지도 엔진에 연결할 수 없습니다.", 503);
  }
  if (!response.ok) throw new ApiError("ENGINE_ERROR", "지도 엔진 요청에 실패했습니다.", 502);
  try { return await response.json(); }
  catch { throw new ApiError("ENGINE_RESPONSE", "지도 엔진 응답을 읽을 수 없습니다.", 502); }
}

const maneuverText = {
  depart: "출발", arrive: "도착", turn: "회전", continue: "직진", merge: "합류",
  "on ramp": "진입로", "off ramp": "진출로", fork: "갈림길", "end of road": "도로 끝",
  roundabout: "회전교차로", rotary: "로터리", "new name": "도로명 변경",
};
const modifierText = { left: "좌회전", right: "우회전", straight: "직진", "slight left": "왼쪽 방향", "slight right": "오른쪽 방향", "sharp left": "급좌회전", "sharp right": "급우회전", uturn: "유턴" };

function instruction(step) {
  const maneuver = step.maneuver ?? {};
  const action = modifierText[maneuver.modifier] ?? maneuverText[maneuver.type] ?? "이동";
  return step.name ? `${step.name}에서 ${action}` : action;
}

export async function searchPlaces(query, limit, baseUrl) {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("accept-language", "ko");
  const raw = await providerJson(url);
  if (!Array.isArray(raw)) throw new ApiError("ENGINE_RESPONSE", "장소 검색 결과 형식이 올바르지 않습니다.", 502);
  return raw.flatMap((item) => {
    const point = { lat: Number(item.lat), lng: Number(item.lon) };
    if (!validPoint(point)) return [];
    return [{
      id: `osm:${item.osm_type ?? "place"}:${item.osm_id ?? item.place_id}`,
      name: item.name || String(item.display_name || "").split(",")[0],
      detail: item.display_name ?? "",
      ...point,
    }];
  });
}

export async function planRoute(origin, destination, baseUrl) {
  const url = new URL(`/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`, baseUrl);
  url.searchParams.set("steps", "true");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  const data = await providerJson(url);
  if (data.code === "NoRoute") throw new ApiError("NO_ROUTE", "운행 가능한 도로 경로를 찾지 못했습니다.", 422);
  if (Array.isArray(data.waypoints) && data.waypoints.some((point) => !Number.isFinite(point.distance) || point.distance > 500))
    throw new ApiError("OUTSIDE_COVERAGE", "출발지 또는 목적지가 현재 지도 범위를 벗어났습니다.", 422);
  const raw = data.routes?.[0];
  const coordinates = raw?.geometry?.coordinates;
  if (data.code !== "Ok" || !Number.isFinite(raw?.distance) || !Number.isFinite(raw?.duration) ||
      !Array.isArray(coordinates) || coordinates.length < 2)
    throw new ApiError("ENGINE_RESPONSE", "경로 엔진 응답 형식이 올바르지 않습니다.", 502);
  const steps = (raw.legs ?? []).flatMap((leg) => (leg.steps ?? []).flatMap((step) => {
    const location = step.maneuver?.location;
    if (!Array.isArray(location) || location.length !== 2) return [];
    return [{ instruction: instruction(step), roadName: step.name ?? "", turnCode: step.maneuver?.type ?? "", coordinate: location }];
  }));
  return {
    provider: "groad-osrm", dataSource: "OpenStreetMap", option: "recommended",
    trafficAware: false, distanceMeters: Math.round(raw.distance), durationSeconds: Math.round(raw.duration),
    tollFareKrw: null, geometry: { type: "LineString", coordinates }, steps,
    calculatedAt: new Date().toISOString(),
  };
}

export async function matchTrace(points, baseUrl) {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(";");
  const url = new URL(`/match/v1/driving/${coordinates}`, baseUrl);
  url.searchParams.set("timestamps", points.map((point) => Math.floor(point.timestamp / 1000)).join(";"));
  url.searchParams.set("radiuses", points.map((point) => Math.max(5, Math.min(60, Math.ceil(point.accuracy)))).join(";"));
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("tidy", "true");
  const data = await providerJson(url);
  const matched = data.tracepoints?.at(-1);
  const matching = data.matchings?.[matched?.matchings_index ?? 0];
  if (data.code !== "Ok" || !matched || !Array.isArray(matched.location) || !matching)
    throw new ApiError("NO_MATCH", "GPS 이동 기록을 도로에 맞출 수 없습니다.", 422);
  return {
    point: { lng: matched.location[0], lat: matched.location[1] },
    snapDistanceMeters: Math.round(matched.distance ?? 0),
    confidence: matching.confidence ?? null,
    isEstimated: true,
    provider: "groad-osrm",
  };
}
