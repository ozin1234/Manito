"use client";

import { UwatIcon } from "./uwat-icon";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { AlertTriangle, LocateFixed, MapPin, X } from "lucide-react";
import { locationErrorMessage, locationPreflight } from "@/lib/location-diagnostics";
import { GpsAccessHint } from "./gps-access-hint";
import type { ReportTopic } from "@/lib/report-topics";
import type { ReportIssueType } from "@/lib/report-issue-types";
import { reportIssueLabel } from "@/lib/report-issue-types";
import type { PublicCaseUpdate } from "@/lib/case-types";
import type { MappedComplaint } from "@/lib/complaint-map";

export type ReportCategory = "danger" | "near_miss" | "caution";
export type SafetyReport = {
  id: string; topic?: ReportTopic; issueType?: ReportIssueType; category: ReportCategory; title: string; summary: string; description: string;
  lat: number; lng: number; photoUrl?: string; createdAt: string; status: string;
  agencyStatus?: string; summarySource?: string;
  managementProgress?: PublicCaseUpdate;
  locationSource?: "gps" | "map"; locationAccuracyM?: number | null; locationCapturedAt?: string | null;
};
type Coordinate = { lat: number; lng: number };
const categories: { id: ReportCategory; label: string; color: string }[] = [
  { id: "danger", label: "위험지역", color: "#df4d4f" },
  { id: "near_miss", label: "아차!지역", color: "#ec8b3f" },
  { id: "caution", label: "단순주의지역", color: "#d1a839" },
];
const labels: Record<ReportCategory, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
function reportIcon(category: ReportCategory) {
  return L.divIcon({ className: "gr-report-icon",
    html: `<span class="gr-report-pin gr-report-pin-${category}" aria-hidden="true"><b>!</b></span>`,
    iconSize: [42, 48], iconAnchor: [21, 44] });
}
function userIcon() {
  return L.divIcon({ className: "gr-user-icon", html: '<span aria-hidden="true"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}
export default function ReportMap({ reports, complaints = [], view, onSelectComplaint, onSelectReport, onNewReportAt, onNotice, pickingLocation = false, showCategoryFilter = true }: {
  reports: SafetyReport[];
  complaints?: MappedComplaint[];
  view?: { lat: number; lng: number; zoom: number };
  onSelectComplaint?: (complaint: MappedComplaint) => void;
  onSelectReport?: (report: SafetyReport) => void;
  onNewReportAt: (point: Coordinate) => void;
  onNotice: (message: string) => void;
  pickingLocation?: boolean;
  showCategoryFilter?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const reportLayersRef = useRef<L.LayerGroup | null>(null);
  const complaintLayersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const watchRef = useRef<number | null>(null);
  const hadGpsRef = useRef(false);
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [visible, setVisible] = useState<Record<ReportCategory, boolean>>({ danger: true, near_miss: true, caution: true });
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsPending, setGpsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false, scrollWheelZoom: false, preferCanvas: true });
    mapRef.current = map;
    const street = L.tileLayer("/api/v1/tiles/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    street.on("tileerror", () => setMapError("지도를 불러오지 못했습니다. 연결을 확인해 주세요."));
    street.on("load", () => setMapError(""));
    reportLayersRef.current = L.layerGroup().addTo(map);
    complaintLayersRef.current = L.layerGroup().addTo(map);
    map.setView([view?.lat ?? 37.8813, view?.lng ?? 127.7299], view?.zoom ?? 14);
    map.on("contextmenu", (event: L.LeafletMouseEvent) => onNewReportAt({ lat: event.latlng.lat, lng: event.latlng.lng }));
    const resize = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(resize);
      if (watchRef.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchRef.current);
      map.remove(); mapRef.current = null; reportLayersRef.current = null; complaintLayersRef.current = null;
      userMarkerRef.current = null; accuracyRef.current = null;
    };
  }, []);

  useEffect(() => { if (view) mapRef.current?.setView([view.lat, view.lng], view.zoom); }, [view]);

  useEffect(() => {
    const group = complaintLayersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const complaint of complaints) {
      const { location } = complaint;
      const icon = L.divIcon({ className: "kr-complaint-map-icon", html: `<span class="kr-complaint-pin ${complaint.topic}" aria-hidden="true">!</span>`, iconSize: [42, 48], iconAnchor: [21, 44] });
      const marker = L.marker([location.lat, location.lng], { icon, title: `공개 민원 · ${complaint.title}`, alt: `공개 민원 · ${complaint.title}`, keyboard: true }).addTo(group);
      // Only plain text enters the tooltip: complaint titles never become HTML.
      const tooltip = document.createElement("span"); tooltip.textContent = location.label;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -37] });
      marker.on("click", () => onSelectComplaint?.(complaint));
    }
  }, [complaints, onSelectComplaint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickingLocation) return;
    const select = (event: L.LeafletMouseEvent) => onNewReportAt({ lat: event.latlng.lat, lng: event.latlng.lng });
    map.getContainer().style.cursor = "crosshair";
    map.on("click", select);
    return () => { map.off("click", select); map.getContainer().style.cursor = ""; };
  }, [pickingLocation, onNewReportAt]);

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
  return <div className="gr-safety-map">
    <div ref={elementRef} className="gr-safety-map-canvas" role="application" aria-label="K-ROAD 현장 지도" />
    {showCategoryFilter && <div className="gr-map-category-filter" role="group" aria-label="위험도 필터">{categories.map(({ id, label }) =>
      <button key={id} type="button" className={visible[id] ? `active ${id}` : ""} onClick={() => setVisible(state => ({ ...state, [id]: !state[id] }))}><span>!</span>{label}</button>)}</div>}
    <div className="gr-map-controls">
      <button type="button" onClick={startGps} aria-label={gpsPending ? "위치 요청 취소" : gpsActive ? "위치 추적 끄기" : "내 위치 추적"} title={gpsPending ? "GPS 연결 중" : "내 위치 추적"}><LocateFixed size={21} /></button>
      <button type="button" onClick={() => { if (gps) mapRef.current?.setView([gps.lat, gps.lng], 14); else startGps(); }} aria-label="내 위치로 이동" title="내 위치로 이동"><MapPin size={20} /></button>
      <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="확대">+</button>
      <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="축소">−</button>
    </div>
    {gpsPending ? <div className="gr-map-gps">GPS 연결 중 · 권한 요청을 확인해 주세요</div> : gps && <div className="gr-map-gps">내 위치 · 정확도 ±{Math.round(gps.accuracy)}m</div>}
    {(mapError || message) && <div className="gr-map-message" role="status"><span>{mapError || message}</span>{message && <GpsAccessHint />}</div>}
    <button type="button" className="gr-map-new-report" onClick={newReport} aria-label="이 위치에서 우왓 열기"><UwatIcon size={27}/>우왓</button>
    {selected && !onSelectReport && <section className="gr-map-report-detail" aria-label="제보 상세">
      <div className="gr-map-detail-top"><span className={`gr-map-detail-badge ${selected.category}`}>{labels[selected.category]}</span><button type="button" onClick={() => setSelected(null)} aria-label="제보 닫기"><X size={18} /></button></div>
      <h2>{selected.title}</h2>{selected.issueType && <small>{reportIssueLabel(selected.issueType)}</small>}<p>{selected.summary}</p>
      {selected.photoUrl && <img src={selected.photoUrl} alt={`${selected.title} 현장 제보 사진`} />}
      <div className="gr-map-detail-description">{selected.description}</div>
      <small>시민 제보 · {new Date(selected.createdAt).toLocaleString("ko-KR")} · 기관 제출 전</small>
      <div className="gr-map-detail-foot"><AlertTriangle size={15} /> 현장 상황과 통제 여부를 별도로 확인해 주세요.</div>
    </section>}
  </div>;
}
