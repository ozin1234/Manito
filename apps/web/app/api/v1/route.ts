import { NextResponse } from "next/server";
import { independentEngineEnabled } from "@/lib/groad-api";

export function GET() {
  const independent = independentEngineEnabled();
  return NextResponse.json({
    name: "K-ROAD API",
    version: "1",
    access: "site-owner-session",
    routeProvider: "groad-osrm",
    placeProvider: "groad-nominatim",
    engineConfigured: independent,
    endpoints: [
      { method: "GET", path: "/api/v1/places?q=강릉역", description: "K-ROAD 자체 장소 검색" },
      { method: "POST", path: "/api/v1/routes/driving", description: "K-ROAD 자체 자동차 경로 계획" },
      { method: "GET", path: "/api/v1/tiles/{z}/{x}/{y}.png", description: "K-ROAD 자체 지도 타일" },
      { method: "GET", path: "/api/v1/tiles/satellite/{z}/{x}/{y}.png", description: "ESA WorldCover 2021 위성 합성 영상" },
      { method: "GET", path: "/api/v1/tiles/recent/{date}/{z}/{x}/{y}.jpg", description: "NASA Terra MODIS 날짜별 최근 위성 관측 영상" },
      { method: "GET", path: "/api/v1/weather?lat=37.7&lng=128.4", description: "Open-Meteo 지역 현재 기상 모델" },
      { method: "GET", path: "/api/v1/traffic/segments", description: "ITS 도로별 속도, 별도 인증키 필요" },
      { method: "POST", path: "/api/v1/navigation/match", description: "GPS 도로 맞춤 추정" },
      { method: "GET", path: "/api/v1/risk/segments", description: "2025년 검증 사례 조회" },
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}
