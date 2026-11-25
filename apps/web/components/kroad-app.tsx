"use client";

import dynamic from "next/dynamic";
import { Bell, Building2, Camera, House, Info, MapPinned, Route, ShieldAlert, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SafetyReport } from "./report-map";
import { SeedBadge } from "./seed-ui";
import { UwatIcon } from "./uwat-icon";
import { UwatChat } from "./uwat-chat";
import { reportTopics, reportsForTopic, type ReportTopic } from "@/lib/report-topics";
import { PublicComplaints, PublicComplaintSources, PublicComplaintTools } from "./public-complaints";
import { caseStatusLabels, type PublicCaseUpdate } from "@/lib/case-types";
import { reportIssueLabel } from "@/lib/report-issue-types";

import publicData from "@/data/public-complaints.json";
import locationData from "@/data/complaint-locations.json";
import { filterPublicComplaints, type PublicComplaintFeed } from "@/lib/public-complaints";
import { mapComplaints, neighborhoodView, type ComplaintLocation, type MappedComplaint } from "@/lib/complaint-map";
import { MY_REPORTS_KEY, readMyReports, rememberMyReport, trackMyReports, myReportPins, setMyReportLocation, type MyReportReceipt } from "@/lib/my-reports";
import { currentReportLocation, hasReportLocation } from "@/lib/report-location";
import type { SubmittedReport, UwatLocation } from "@/lib/uwat-types";
import { MyReports } from "./my-reports";
import { PublicComplaintDetail } from "./public-complaint-detail";
const publicFeed = publicData as PublicComplaintFeed;
const locationIndex = locationData.locations as ComplaintLocation[];

const ReportMap = dynamic(() => import("./report-map"), { ssr: false });
type Category = SafetyReport["category"];
type Point = { lat: number; lng: number };
const labels: Record<Category, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
const topicIcons = { living: House, road: Route, safety: ShieldAlert };

function Brand() {
  return <div className="sr-brand"><svg viewBox="0 0 48 52" role="img" aria-label="K-ROAD 로고"><path d="M24 2C12.4 2 3 11.4 3 23c0 15 21 27 21 27s21-12 21-27C45 11.4 35.6 2 24 2Z" fill="#3869f8"/><path d="M17 14v21M31 14L17 25l15 10" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="35.6" cy="10.5" r="4.8" fill="#ff7651" stroke="#fff" strokeWidth="2"/></svg><span><strong>K-ROAD</strong><small>우리 동네 불편과 위험을 함께</small></span></div>;
}

function ReportDetail({ report, onClose }: { report: SafetyReport; onClose: () => void }) {
  return <aside className="sr-detail" aria-label="제보 상세"><div className="sr-detail-head"><SeedBadge tone={report.category === "danger" ? "critical" : report.category === "near_miss" ? "warning" : "informative"}>{labels[report.category]}</SeedBadge><button type="button" className="sr-icon-button" onClick={onClose} aria-label="제보 상세 닫기"><X size={20}/></button></div>
    {report.photoUrl ? <img className="sr-detail-photo" src={report.photoUrl} alt={`${report.title} 현장 사진`}/> : <div className="sr-no-photo"><Camera size={26}/>등록된 현장 사진 없음</div>}
    <div className="sr-detail-body"><small>{new Date(report.createdAt).toLocaleString("ko-KR")}{report.issueType ? ` · ${reportIssueLabel(report.issueType)}` : ""}</small><h2>{report.title}</h2><p className="sr-detail-summary"><Sparkles size={17}/>{report.summary}</p><p>{report.description}</p><div className="sr-detail-location"><MapPinned size={17}/>{report.lat.toFixed(5)}, {report.lng.toFixed(5)} · {report.locationSource === "gps" ? `휴대폰 GPS ±${Math.round(report.locationAccuracyM ?? 0)}m` : "지도 선택 위치"}</div><span className="sr-pending">이전 공개 현장 기록</span>{report.managementProgress && <div className="kr-report-progress"><strong>K-ROAD 관리 · {caseStatusLabels[report.managementProgress.status]}</strong><p>{report.managementProgress.message}</p><small>{report.managementProgress.department} · {report.managementProgress.updatedAt.slice(0, 10)}</small></div>}<small className="sr-agency-note">새 사진 제보는 우왓에서 관리자 접수함으로 바로 전달합니다.</small></div>
  </aside>;
}

export function KroadApp() {
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [updates, setUpdates] = useState<PublicCaseUpdate[]>([]);
  const [receipts, setReceipts] = useState<MyReportReceipt[]>([]);
  const receiptsRef = useRef<MyReportReceipt[]>([]);
  const [trackingUnavailable, setTrackingUnavailable] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [selectedPublic, setSelectedPublic] = useState<MappedComplaint | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [point, setPoint] = useState<UwatLocation | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationReportId, setLocationReportId] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<"all" | "public" | "community" | "mine">("all");
  const [topic, setTopic] = useState<ReportTopic>("road");
  const [region, setRegion] = useState("춘천시");
  const [query, setQuery] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem("kroad-uwat-greeting")) return; } catch { /* Optional storage. */ }
    setShowGreeting(true);
    const timer = window.setTimeout(() => { setShowGreeting(false); try { sessionStorage.setItem("kroad-uwat-greeting", "seen"); } catch { /* Optional storage. */ } }, 9000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const load = () => { try { const values = readMyReports(localStorage.getItem(MY_REPORTS_KEY)); receiptsRef.current = values; setReceipts(values); } catch { /* In-memory receipts still work. */ } };
    load();
    const changed = (event: StorageEvent) => { if (event.key === MY_REPORTS_KEY || event.key === null) load(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const snapshot = receiptsRef.current;
    try {
      const [recordsResponse, progressResponse, tracked] = await Promise.all([fetch("/api/v1/reports?limit=200", { cache: "no-store" }), fetch("/api/v1/case-progress", { cache: "no-store" }), trackMyReports(snapshot)]);
      if (!recordsResponse.ok || !progressResponse.ok) throw new Error();
      const [recordsData, progressData] = await Promise.all([recordsResponse.json() as Promise<{ reports: SafetyReport[] }>, progressResponse.json() as Promise<{ updates: PublicCaseUpdate[] }>]);
      if (!Array.isArray(recordsData.reports) || !Array.isArray(progressData.updates)) throw new Error();
      const sameSnapshot = receiptsRef.current === snapshot;
      setReports(recordsData.reports); setUpdates((current) => sameSnapshot ? [...progressData.updates, ...tracked.updates] : [...progressData.updates, ...current.filter((row) => !progressData.updates.some((value) => value.caseId === row.caseId) && receiptsRef.current.some((receipt) => receipt.id === row.caseId))]); setProgressError(""); setTrackingUnavailable(tracked.unavailable);
      if (sameSnapshot) {
        receiptsRef.current = tracked.receipts; setReceipts(tracked.receipts);
        try { if (tracked.receipts.length) localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(tracked.receipts)); } catch { /* In-memory details remain available. */ }
      }
      setSelected((current) => current ? recordsData.reports.find((row: SafetyReport) => row.id === current.id) ?? current : null);
    } catch { setProgressError("최신 처리 상태를 가져오지 못했어요. 잠시 후 상태 새로고침을 눌러 주세요."); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); const onFocus = () => void refresh(); window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus); }, [refresh]);
  function openUwat() { if (locationBusy) return; setPickingLocation(false); setLocationReportId(null); setShowGreeting(false); setChatOpen(true); try { sessionStorage.setItem("kroad-uwat-greeting", "seen"); } catch { /* Optional storage. */ } }
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 6000); };
  const saved = (report: SubmittedReport) => {
    let next = rememberMyReport(receiptsRef.current, report), preserved = true;
    try { next = rememberMyReport(readMyReports(localStorage.getItem(MY_REPORTS_KEY)), report); localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(next)); }
    catch { preserved = false; }
    receiptsRef.current = next; setReceipts(next); setTrackingUnavailable((current) => current.filter((id) => id !== report.id));
    setUpdates((current) => [{ caseId: report.id, status: "unassigned", department: "", message: "관리자 접수함에 접수됐습니다. 담당자 확인을 기다리고 있어요.", updatedAt: report.createdAt }, ...current.filter((row) => row.caseId !== report.id)]);
    setSelectedPublic(null); setSelected(null); setPoint(null); setChatOpen(false);
    showNotice(preserved ? "관리자 접수함에 접수됐어요. 내가 보낸 제보에서 내용을 확인해 주세요." : "접수는 완료됐지만 브라우저 보관이 차단됐어요. 접수 번호를 따로 보관해 주세요: " + report.submission?.reference);
    if (hasReportLocation(report)) { setTopic(report.topic ?? "road"); setSource("all"); setFocus({ lat: report.lat, lng: report.lng, zoom: 16 }); }
    else if (preserved) showNotice("접수됐어요. 현장 위치가 없어 지도 표시를 기다립니다. 내 제보에서 위치를 등록해 주세요.");
    window.setTimeout(() => document.getElementById(hasReportLocation(report) ? "field-map" : "my-reports")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const focusReceipt = (receipt: MyReportReceipt) => { if (hasReportLocation(receipt)) { setTopic(receipt.topic ?? "road"); setSource("all"); setFocus({ lat: receipt.lat, lng: receipt.lng, zoom: 16 }); document.getElementById("field-map")?.scrollIntoView({ behavior: "smooth", block: "start" }); } };
  const saveLocation = async (id: string, location: UwatLocation) => {
    if (chatBusy) return;
    const receipt = receiptsRef.current.find((row) => row.id === id); if (!receipt) return;
    setLocationBusy(true);
    try {
      const updated = await setMyReportLocation(receipt, location);
      const next = rememberMyReport(receiptsRef.current, updated); receiptsRef.current = next; setReceipts(next); setTrackingUnavailable((current) => current.filter((value) => value !== id));
      try { localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(next)); } catch { showNotice("위치는 저장됐지만 브라우저 보관이 차단됐어요."); }
      setLocationReportId(null); setPickingLocation(false); focusReceipt(updated); showNotice("현장 위치를 저장했어요. 내 지도에 제보 핀이 표시됩니다.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "위치를 저장하지 못했습니다."); }
    finally { setLocationBusy(false); }
  };
  const useGps = async (id?: string) => {
    if (chatBusy || locationBusy) return; setLocationBusy(true);
    try { const location = await currentReportLocation(); if (id) await saveLocation(id, location); else { setPoint(location); showNotice(`현장에서 선택한 GPS 위치를 제보에 포함해요. 오차 ±${Math.round(location.locationAccuracyM ?? 0)}m`); } }
    catch (error) { showNotice(error instanceof Error ? error.message : "GPS를 확인하지 못했습니다."); }
    finally { setLocationBusy(false); }
  };
  const beginLocationPick = (id?: string) => { if (chatBusy || locationBusy) return; setLocationReportId(id ?? null); setPickingLocation(true); setChatOpen(false); showNotice("사진을 찍은 현장 위치를 지도에서 눌러 주세요."); document.getElementById("field-map")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const pick = (location: Point) => {
    if (chatBusy || locationBusy) return;
    const value: UwatLocation = { ...location, locationSource: "map", locationAccuracyM: null, locationCapturedAt: null };
    if (locationReportId) void saveLocation(locationReportId, value);
    else { setPoint(value); setPickingLocation(false); setChatOpen(true); }
  };
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const topicReports = useMemo(() => reportsForTopic(reports, topic), [reports, topic]);
  const publicRows = useMemo(() => filterPublicComplaints(publicFeed.records, topic, region, query), [topic, region, query]);
  const mapped = useMemo(() => mapComplaints(publicFeed.records, locationIndex, topic, region, query), [topic, region, query]);
  const ownerPins = useMemo(() => myReportPins(receipts, topic, trackingUnavailable), [receipts, topic, trackingUnavailable]);
  const view = useMemo(() => focus ?? (ownerPins[0] ? { lat: ownerPins[0].lat, lng: ownerPins[0].lng, zoom: 15 } : neighborhoodView(region, mapped)), [focus, region, mapped, ownerPins]);
  const shownComplaints = useMemo(() => (source === "community" || source === "mine") ? [] : mapped, [source, mapped]);
  const selectPublic = useCallback((value: MappedComplaint) => { setSelected(null); setSelectedPublic(value); setFocus({ lat: value.location.lat, lng: value.location.lng, zoom: 15 }); }, []);
  const selectReport = useCallback((value: SafetyReport) => { setSelectedPublic(null); setSelected(value); }, []);
  const changeTopic = (value: ReportTopic) => { if (chatBusy || locationBusy || value === topic) return; setTopic(value); setSource("all"); setQuery(""); setFocus(null); setSelected(null); setSelectedPublic(null); setPickingLocation(false); setChatOpen(false); };
  return <div className="safety-app seed-kroad" data-topic={topic}>
    <header className="sr-header"><div className="kr-header-shell"><Brand/>
      <nav className="sr-bottom-nav" aria-label="정보 분야">{reportTopics.map((item) => { const Icon = topicIcons[item.id]; return <button type="button" key={item.id} className={topic === item.id ? "active" : ""} aria-pressed={topic === item.id} disabled={chatBusy || locationBusy} onClick={() => changeTopic(item.id)}><Icon size={20}/><span>{item.label}</span></button>; })}</nav>
      <div className="sr-header-actions"><a className="kr-agency-link" href="/admin"><Building2 size={16}/>기관 관리</a><a className="kr-my-anchor" href="#my-reports">내 제보{receipts.length > 0 && <b>{receipts.length}</b>}</a></div>
    </div></header>
    <main className="sr-main">
      <div className="sr-map-heading"><div><span className="sr-kicker">강원특별자치도 · {topicInfo.label}</span><h1>{topicInfo.heading}</h1><p>동네 지도에서 불편한 곳을 살펴보고, 발견한 상황은 우왓에 알려 주세요.</p></div></div>
      <div className="kr-content-grid kr-map-first">
        <section id="field-map" className="kr-map-section" aria-labelledby="field-map-heading">
          <div className="kr-map-section-heading"><div><h2 id="field-map-heading">K-ROAD 현장 지도</h2></div><span className="kr-map-record-count"><MapPinned size={16}/>{mapped.length + topicReports.length + ownerPins.length}건 위치 표시</span></div>
          <PublicComplaintTools region={region} query={query} onRegionChange={(value) => { setRegion(value); setFocus(neighborhoodView(value, mapComplaints(publicFeed.records, locationIndex, topic, value, query))); setSelectedPublic(null); }} onQueryChange={(value) => { setQuery(value); setFocus(neighborhoodView(region, mapComplaints(publicFeed.records, locationIndex, topic, region, value))); setSelectedPublic(null); }}/>
          <div className="sr-filter" aria-label="지도 표시 자료">{([{ id: "all", label: "전체", count: mapped.length + topicReports.length + ownerPins.length }, { id: "public", label: "공개 민원", count: mapped.length }, { id: "community", label: "우왓 현장 기록", count: topicReports.length }, { id: "mine", label: "내 제보", count: ownerPins.length }] as const).map((item) => <button type="button" key={item.id} className={source === item.id ? "active" : ""} aria-pressed={source === item.id} onClick={() => { setSource(item.id); setSelected(null); setSelectedPublic(null); if (item.id === "public") setFocus(neighborhoodView(region, mapped)); else if ((item.id === "all" || item.id === "mine") && ownerPins[0]) setFocus({ lat: ownerPins[0].lat, lng: ownerPins[0].lng, zoom: 16 }); }}>{item.label}<b>{item.count}</b></button>)}</div>

          {pickingLocation && <div className="uwat-map-picking" role="status">사진을 찍은 현장 위치를 지도에서 눌러 주세요.<button type="button" disabled={locationBusy} onClick={() => { setPickingLocation(false); if (!locationReportId) setChatOpen(true); setLocationReportId(null); }}>위치 선택 취소</button></div>}
          <div className="sr-map-frame"><ReportMap reports={source === "public" || source === "mine" ? [] : topicReports} complaints={shownComplaints} myReports={source === "all" || source === "mine" ? ownerPins : []} onSelectMyReport={setOpenReportId} view={view} onSelectComplaint={selectPublic} onSelectReport={selectReport} pickingLocation={pickingLocation} showCategoryFilter={false} onNewReportAt={pick} onNotice={showNotice}/>{selected && <ReportDetail report={selected} onClose={() => setSelected(null)}/>} {selectedPublic && <PublicComplaintDetail complaint={selectedPublic} update={updates.find((row) => row.caseId === selectedPublic.id)} onClose={() => setSelectedPublic(null)}/>}</div>
          <p className="kr-map-caption"><span className={`kr-caption-pin ${topic}`}>!</span>느낌표를 누르면 내용을 볼 수 있어요. 공개 민원은 관련 장소 기준이며 실제 사고 발생·현재 위험을 뜻하지 않아요. 내 제보 핀은 본인 지도에만 표시돼요.</p>
          {mapped.length > 0 && <label className="kr-neighborhood-select"><MapPinned size={16}/><span>다른 동네</span><select aria-label="민원 위치로 이동" value={selectedPublic?.id ?? ""} onChange={(event) => { const place = mapped.find((row) => row.id === event.target.value); if (place) { setSource("all"); selectPublic(place); } }}><option value="">지도에서 볼 곳 고르기</option>{mapped.map((row) => <option key={row.id} value={row.id}>{row.location.label}</option>)}</select></label>}
          {publicRows.length > mapped.length && <p className="kr-unlocated-note">위치가 분명하지 않은 {publicRows.length - mapped.length}건은 아래 민원 목록에서 볼 수 있어요.</p>}
        </section>
        <aside className="kr-action-rail" aria-label="사진 분석과 공개 민원 출처"><section className="kr-photo-invite"><div className="kr-invite-label"><span className="kr-invite-symbol"><Camera size={23}/></span><span>사진을 보는 도우미, 우왓</span></div><div className="kr-invite-copy"><h2>사진 한 장으로<br/> 함께 확인해요.</h2><p>오른쪽 아래 우왓에서 사진을 올리면<br/>관리자에게 바로 전달해요.</p></div><small><Bell size={14}/>확인이 필요하면 알림음으로 알려요</small></section><PublicComplaintSources/></aside>
      </div>
      <details className="kr-public-disclosure"><summary>공개 민원 목록 <span>{publicRows.length}건 · 위치 확인 전 민원 포함</span></summary><PublicComplaints topic={topic} region={region} query={query} mapped={mapped} onSelectLocation={(value) => { setSource("all"); selectPublic(value); document.getElementById("field-map")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}/></details>
      <MyReports receipts={receipts} updates={updates} unavailable={trackingUnavailable} refreshing={refreshing} refreshError={progressError} onRefresh={() => void refresh()} openReportId={openReportId} onOpenHandled={() => setOpenReportId(null)} onMapLocation={beginLocationPick} onGpsLocation={(id) => void useGps(id)} onShowLocation={focusReceipt} locationBusy={locationBusy || chatBusy}/>
      <div className="sr-official-note"><Info size={18}/><p>우왓에서 보낸 사진 제보는 K-ROAD 관리자 접수함에 전달됩니다. 담당 관리자가 내용을 검토하고 처리 과정을 안내합니다.</p></div>
      <footer className="kr-page-footer"><span><strong>K-ROAD</strong>우리 동네 불편과 위험을 함께</span><a href="/admin"><Building2 size={15}/>기관 관리</a></footer>
    </main>
    <button type="button" className="sr-chat-fab uwat-launcher" hidden={chatOpen} onClick={openUwat} aria-label="우왓 열기" title="우왓에서 사진을 올려 함께 확인해요">{showGreeting && <span className="uwat-greeting" aria-hidden="true"><strong>여기 있어요!</strong><small>사진은 제가 확인할게요</small></span>}<UwatIcon size={43} className={showGreeting ? "uwat-icon--hello" : ""}/><span>우왓</span></button>
    <UwatChat open={chatOpen} topic={topic} point={point} onBusyChange={setChatBusy} onClose={() => setChatOpen(false)} onPickLocation={() => beginLocationPick()} onUseCurrentLocation={() => void useGps()} onClearLocation={() => setPoint(null)} locationBusy={locationBusy} onSaved={saved} onAttention={showNotice}/>
    {notice && <div className="sr-toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기"><X size={18}/></button></div>}
  </div>;
}
