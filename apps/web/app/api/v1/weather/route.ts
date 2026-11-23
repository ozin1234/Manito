import { NextRequest, NextResponse } from "next/server";

type OpenMeteoCurrent = {
  time: string;
  interval: number;
  temperature_2m: number;
  precipitation: number;
  snowfall: number;
  weather_code: number;
  cloud_cover: number;
  is_day: number;
};

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return NextResponse.json({ error: "지원 지역 좌표가 아닙니다." }, { status: 400 });
  }
  const source = new URL("https://api.open-meteo.com/v1/forecast");
  source.search = new URLSearchParams({
    latitude: lat.toFixed(2), longitude: lng.toFixed(2),
    current: "temperature_2m,precipitation,snowfall,weather_code,cloud_cover,is_day",
    timezone: "Asia/Seoul", forecast_days: "1",
  }).toString();
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const data = await response.json() as { current?: OpenMeteoCurrent };
    const current = data.current;
    if (!current || ![current.temperature_2m, current.precipitation, current.snowfall, current.weather_code, current.cloud_cover, current.is_day].every(Number.isFinite)) {
      throw new Error("Weather response invalid");
    }
    return NextResponse.json({
      source: "Open-Meteo weather model", modelled: true, time: current.time, intervalSeconds: current.interval,
      temperatureC: current.temperature_2m, precipitationMm: current.precipitation,
      snowfallCm: current.snowfall, weatherCode: current.weather_code,
      cloudCoverPct: current.cloud_cover, isDay: current.is_day === 1,
    }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return NextResponse.json({ error: "지역 기상 정보를 불러오지 못했습니다." }, { status: 503 });
  }
}
