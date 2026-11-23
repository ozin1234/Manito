"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { AlertTriangle, Cloud, CloudRain, Layers3, LocateFixed, MapPin, Moon, Plus, Satellite, Snowflake, Sun, X } from "lucide-react";
import type { TrafficSnapshot } from "@/lib/groad-api";
import { locationErrorMessage, locationPreflight } from "@/lib/location-diagnostics";
import { GpsAccessHint } from "./gps-access-hint";
import type { ReportTopic } from "@/lib/report-topics";
import type { PublicCaseUpdate } from "@/lib/case-types";

export type ReportCategory = "danger" | "near_miss" | "caution";
export type SafetyReport = {
  id: string; topic?: ReportTopic; category: ReportCategory; title: string; summary: string; description: string;
  lat: number; lng: number; photoUrl?: string; createdAt: string; status: string;
  agencyStatus?: string; summarySource?: string;
  managementProgress?: PublicCaseUpdate;
  locationSource?: "gps" | "map"; locationAccuracyM?: number | null; locationCapturedAt?: string | null;
};
type Coordinate = { lat: number; lng: number };
type MapLayer = "street" | "satellite" | "recent";
type Weather = { temperatureC: number; precipitationMm: number; snowfallCm: number; weatherCode: number; cloudCoverPct: number; isDay: boolean };
const categories: { id: ReportCategory; label: string; color: string }[] = [
  { id: "danger", label: "위험지역", color: "#df4d4f" },
  { id: "near_miss", label: "아차!지역", color: "#ec8b3f" },
  { id: "caution", label: "단순주의지역", color: "#d1a839" },
];
const labels: Record<ReportCategory, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
const recentDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
function reportIcon(category: ReportCategory) {
  return L.divIcon({ className: "gr-report-icon",
    html: `<span class="gr-report-pin gr-report-pin-${category}" aria-hidden="true"><b>!</b></span>`,
    iconSize: [42, 48], iconAnchor: [21, 44] });
}
function userIcon() {
  return L.divIcon({ className: "gr-user-icon", html: '<span aria-hidden="true"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}
function weatherLabel(value: Weather) {
  const code = value.weatherCode;
  if (value.snowfallCm > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) return "눈";
  if (value.precipitationMm > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "비";
  if (code >= 45 && code <= 48) return "안개";
  if (code >= 2 || value.cloudCoverPct >= 60) return "흐림";
  return "맑음";
}

export default function LiveRiskMap({ reports, onSelectReport, onNewReportAt, onNotice, pickingLocation = false }: {
  reports: SafetyReport[];
  onSelectReport?: (report: SafetyReport) => void;
  onNewReportAt: (point: Coordinate) => void;
  onNotice: (message: string) => void;
  pickingLocation?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<Record<MapLayer, L.TileLayer> | null>(null);
  const reportLayersRef = useRef<L.LayerGroup | null>(null);
  const trafficLayersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const watchRef = useRef<number | null>(null);
  const hadGpsRef = useRef(false);
  const [layer, setLayer] = useState<MapLayer>("street");
  const [layerMenu, setLayerMenu] = useState(false);
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [visible, setVisible] = useState<Record<ReportCategory, boolean>>({ danger: true, near_miss: true, caution: true });
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsPending, setGpsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [trafficOn, setTrafficOn] = useState(false);
  const [traffic, setTraffic] = useState<TrafficSnapshot | null>(null);
  const [trafficMessage, setTrafficMessage] = useState("");

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false, scrollWheelZoom: false, preferCanvas: true });
    mapRef.current = map;
    const street = L.tileLayer("/api/v1/tiles/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    const satellite = L.tileLayer("/api/v1/tiles/satellite/{z}/{x}/{y}.png", {
      minNativeZoom: 8, maxNativeZoom: 14, maxZoom: 19,
      attribution: '&copy; ESA WorldCover 2021 / Copernicus Sentinel-2',
    });
    const recent = L.tileLayer(`/api/v1/tiles/recent/${recentDate}/{z}/{x}/{y}.jpg`, {
      maxNativeZoom: 9, maxZoom: 19,
      attribution: '&copy; <a href="https://earthdata.nasa.gov/gibs">NASA GIBS / MODIS Terra</a>',
    });
    for (const tile of [street, satellite, recent]) {
      tile.on("tileerror", () => setMapError("지도 영상을 불러오지 못했습니다. 서버 연결을 확인해 주세요."));
      tile.on("load", () => setMapError(""));
    }
    baseRef.current = { street, satellite, recent };
    trafficLayersRef.current = L.layerGroup().addTo(map);
    reportLayersRef.current = L.layerGroup().addTo(map);
    map.setView([37.72, 128.35], 9);
    map.on("contextmenu", (event: L.LeafletMouseEvent) => onNewReportAt({ lat: event.latlng.lat, lng: event.latlng.lng }));
    const resize = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(resize);
      if (watchRef.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchRef.current);
      map.remove(); mapRef.current = null; baseRef.current = null; reportLayersRef.current = null; trafficLayersRef.current = null;
      userMarkerRef.current = null; accuracyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickingLocation) return;
    const select = (event: L.LeafletMouseEvent) => onNewReportAt({ lat: event.latlng.lat, lng: event.latlng.lng });
    map.getContainer().style.cursor = "crosshair";
    map.on("click", select);
    return () => { map.off("click", select); map.getContainer().style.cursor = ""; };
  }, [pickingLocation, onNewReportAt]);

  useEffect(() => {
    const map = mapRef.current, tiles = baseRef.current;
    if (!map || !tiles) return;
    for (const [name, tile] of Object.entries(tiles) as [MapLayer, L.TileLayer][]) {
      if (name === layer) tile.addTo(map); else map.removeLayer(tile);
    }
  }, [layer]);

  useEffect(() => {
    const group = reportLayersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const report of reports) {
      if (!visible[report.category] || !Number.isFinite(report.lat) || !Number.isFinite(report.lng)) continue;
      if (report.category === "danger") {
        // A point report gives an approximate caution area, not a measured road closure.
        L.circle([report.lat, report.lng], { radius: 190, color: "#df4d4f", weight: 2,
          dashArray: "8 7", fillColor: "#df4d4f", fillOpacity: 0.12 }).addTo(group);
      }
      const marker = L.marker([report.lat, report.lng], {
        icon: reportIcon(report.category), title: `${labels[report.category]} · ${report.title}`,
      }).addTo(group);
      marker.on("click", () => { setSelected(report); onSelectReport?.(report); });
    }
  }, [reports, visible, onSelectReport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let active = true;
    let lastPoint: Coordinate | null = null;
    const update = async () => {
      const center = map.getCenter();
      if (lastPoint && Math.abs(center.lat - lastPoint.lat) < .08 && Math.abs(center.lng - lastPoint.lng) < .08) return;
      lastPoint = { lat: center.lat, lng: center.lng };
      try {
        const result = await fetch(`/api/v1/weather?lat=${center.lat.toFixed(3)}&lng=${center.lng.toFixed(3)}`);
        if (result.ok) { const value = await result.json() as Weather; if (active) setWeather(value); }
      } catch { /* Weather is optional. */ }
    };
    void update();
    map.on("moveend", update);
    const timer = window.setInterval(() => { lastPoint = null; void update(); }, 600_000);
    return () => { active = false; map.off("moveend", update); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!trafficOn) { setTraffic(null); return; }
    let active = true;
    const refresh = async () => {
      const center = mapRef.current?.getCenter() ?? L.latLng(37.72, 128.35);
      const bbox = [center.lng - .8, center.lat - .55, center.lng + .8, center.lat + .55].map(x => x.toFixed(3)).join(",");
      try {
        const response = await fetch(`/api/v1/traffic/segments?bbox=${bbox}`, { cache: "no-store" });
        const value = await response.json() as TrafficSnapshot & { error?: { message?: string } };
        if (!response.ok) throw new Error(value.error?.message || "교통정보 연결 실패");
        if (active) { setTraffic(value); setTrafficMessage(value.available ? "" : value.reason || "현재 교통자료가 없습니다."); }
      } catch (error) { if (active) setTrafficMessage(error instanceof Error ? error.message : "교통정보 연결 실패"); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [trafficOn]);

  useEffect(() => {
    const group = trafficLayersRef.current;
    if (!group) return;
    group.clearLayers();
    if (!trafficOn || !traffic?.isLive) return;
    for (const segment of traffic.segments) {
      if (!segment.geometry) continue;
      const paths = segment.geometry.type === "LineString"
        ? [segment.geometry.coordinates as [number, number][]]
        : segment.geometry.coordinates as [number, number][][];
      const color = segment.speedKph < 30 ? "#d84748" : segment.speedKph < 60 ? "#ed9a35" : "#4aab82";
      for (const path of paths) {
        if (path.length < 2) continue;
        L.polyline(path.map(([lng, lat]) => [lat, lng]), { color, weight: 5, opacity: .78 })
          .bindTooltip(`${segment.roadName} · ${Math.round(segment.speedKph)} km/h · 우회 여부는 도로 상황 확인 필요`)
          .addTo(group);
      }
    }
  }, [trafficOn, traffic]);

  const startGps = () => {
    const blocked = locationPreflight();
    if (blocked) { setMessage(blocked); return; }
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null;
      setGpsActive(false); setGpsPending(false); onNotice("위치 추적을 종료했습니다."); return;
    }
    setMessage(""); setGpsPending(true);
    try { watchRef.current = navigator.geolocation.watchPosition(({ coords }) => {
      setGpsPending(false); setGpsActive(true);
      const point = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
      setGps(point);
      const map = mapRef.current;
      if (!map) return;
      const ll = L.latLng(point.lat, point.lng);
      if (userMarkerRef.current) userMarkerRef.current.setLatLng(ll);
      else userMarkerRef.current = L.marker(ll, { icon: userIcon(), zIndexOffset: 1000, title: "내 위치" }).addTo(map);
      if (accuracyRef.current) accuracyRef.current.setLatLng(ll).setRadius(point.accuracy);
      else accuracyRef.current = L.circle(ll, { radius: point.accuracy, color: "#466bfa", weight: 1, fillOpacity: .08 }).addTo(map);
      if (!hadGpsRef.current) { map.setView(ll, 13); hadGpsRef.current = true; }
    }, (error) => {
      setMessage(locationErrorMessage(error));
      setGpsActive(false); setGpsPending(false);
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 }); }
    catch { setGpsPending(false); setGpsActive(false); setMessage("브라우저가 위치 요청을 막았습니다. HTTPS 주소를 Chrome 또는 Safari에서 직접 열어 주세요."); }
  };
  const newReport = () => {
    const center = mapRef.current?.getCenter();
    const point = gps && gps.accuracy <= 100 ? gps : center;
    if (point) onNewReportAt({ lat: point.lat, lng: point.lng });
  };
  const condition = weather ? weatherLabel(weather) : null;
  const WeatherIcon = condition === "눈" ? Snowflake : condition === "비" ? CloudRain : condition === "흐림" || condition === "안개" ? Cloud : weather?.isDay ? Sun : Moon;

  return <div className={`gr-safety-map${weather && !weather.isDay ? " is-night" : ""}`}>
    <div ref={elementRef} className="gr-safety-map-canvas" role="application" aria-label="강원 도로 안전 제보 지도" />
    {condition && <div className="gr-map-weather" title="Open-Meteo 기상 모델 자료 · 현장 실측값이 아닙니다."><WeatherIcon size={16} /> {Math.round(weather!.temperatureC)}° · {condition} <small>기상 모델</small></div>}
    <div className="gr-map-category-filter" role="group" aria-label="제보 유형 필터">{categories.map(({ id, label }) =>
      <button key={id} type="button" className={visible[id] ? `active ${id}` : ""} onClick={() => setVisible(state => ({ ...state, [id]: !state[id] }))}><span>!</span>{label}</button>)}</div>
    <div className="gr-map-controls">
      <button type="button" onClick={startGps} aria-label={gpsPending ? "위치 요청 취소" : gpsActive ? "위치 추적 끄기" : "내 위치 추적"} title={gpsPending ? "GPS 연결 중" : "내 위치 추적"}><LocateFixed size={21} /></button>
      <button type="button" onClick={() => { if (gps) mapRef.current?.setView([gps.lat, gps.lng], 14); else startGps(); }} aria-label="내 위치로 이동" title="내 위치로 이동"><MapPin size={20} /></button>
      <button type="button" className={layerMenu ? "active" : ""} onClick={() => setLayerMenu(!layerMenu)} aria-label="지도 설정" aria-expanded={layerMenu}><Layers3 size={21} /></button>
      <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="확대">+</button>
      <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="축소">−</button>
    </div>
    {layerMenu && <div className="gr-map-layer-menu"><strong>지도 배경</strong>
      <button type="button" className={layer === "street" ? "active" : ""} onClick={() => { setLayer("street"); setLayerMenu(false); }}>자체 도로 지도</button>
      <button type="button" className={layer === "satellite" ? "active" : ""} onClick={() => { setLayer("satellite"); setLayerMenu(false); }}><Satellite size={16} /> 상세 위성 배경 <small>2021년</small></button>
      <button type="button" className={layer === "recent" ? "active" : ""} onClick={() => { setLayer("recent"); setLayerMenu(false); }}><Satellite size={16} /> 최근 위성 관측 <small>약 250m</small></button>
      <button type="button" className={trafficOn ? "active" : ""} onClick={() => { setTrafficOn(!trafficOn); setLayerMenu(false); }}>도로별 교통 속도 <small>{trafficOn ? "켜짐" : "꺼짐"}</small></button>
      <p>빨간 교통선은 시속 30km 미만입니다. 위험 제보의 점선 원은 대략적인 주의 범위이며 통제 구간이 아닙니다.</p>
    </div>}
    {gpsPending ? <div className="gr-map-gps">GPS 연결 중 · 권한 요청을 확인해 주세요</div> : gps && <div className="gr-map-gps">내 위치 · 정확도 ±{Math.round(gps.accuracy)}m</div>}
    {(mapError || message || trafficMessage) && <div className="gr-map-message" role="status"><span>{mapError || message || trafficMessage}</span>{message && <GpsAccessHint />}</div>}
    {layer === "recent" && <div className="gr-map-imagery-note">NASA Terra MODIS · {recentDate} 관측 · 약 250m · 실시간 도로 영상 아님</div>}
    {layer === "satellite" && <div className="gr-map-imagery-note">ESA WorldCover · 2021년 합성 영상 · 실시간 아님</div>}
    <button type="button" className="gr-map-new-report" onClick={newReport}><Plus size={20} /> 이 위치 제보</button>
    {selected && !onSelectReport && <section className="gr-map-report-detail" aria-label="제보 상세">
      <div className="gr-map-detail-top"><span className={`gr-map-detail-badge ${selected.category}`}>{labels[selected.category]}</span><button type="button" onClick={() => setSelected(null)} aria-label="제보 닫기"><X size={18} /></button></div>
      <h2>{selected.title}</h2><p>{selected.summary}</p>
      {selected.photoUrl && <img src={selected.photoUrl} alt={`${selected.title} 현장 제보 사진`} />}
      <div className="gr-map-detail-description">{selected.description}</div>
      <small>시민 제보 · {new Date(selected.createdAt).toLocaleString("ko-KR")} · 기관 제출 전</small>
      <div className="gr-map-detail-foot"><AlertTriangle size={15} /> 현장 상황과 통제 여부를 별도로 확인해 주세요.</div>
    </section>}
  </div>;
}
