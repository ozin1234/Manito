"use client";

import dynamic from "next/dynamic";
import { Bell, Building2, Camera, House, Info, MapPinned, Route, ShieldAlert, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SafetyReport } from "./live-risk-map";
import { SeedBadge, SeedButton } from "./seed-ui";
import { UwatChat } from "./uwat-chat";
import { reportTopics, reportsForTopic, type ReportTopic } from "@/lib/report-topics";
import { PublicComplaints, PublicComplaintSources } from "./public-complaints";
import { caseStatusLabels } from "@/lib/case-types";

const LiveRiskMap = dynamic(() => import("./live-risk-map"), { ssr: false });
type Category = SafetyReport["category"];
type Point = { lat: number; lng: number };
const labels: Record<Category, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
const topicIcons = { living: House, road: Route, safety: ShieldAlert };

function Brand() {
  return <div className="sr-brand"><svg viewBox="0 0 48 52" role="img" aria-label="K-ROAD 로고"><path d="M24 2C12.4 2 3 11.4 3 23c0 15 21 27 21 27s21-12 21-27C45 11.4 35.6 2 24 2Z" fill="#3869f8"/><path d="M17 14v21M31 14L17 25l15 10" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="35.6" cy="10.5" r="4.8" fill="#ff7651" stroke="#fff" strokeWidth="2"/></svg><span><strong>K-ROAD</strong><small>우리 동네 불편과 위험을 함께</small></span></div>;
}

function ReportDetail({ report, onClose }: { report: SafetyReport; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const handoff = async () => {
    const text = `[${reportTopics.find((item) => item.id === (report.topic ?? "road"))?.label ?? "도로"} 현장 기록] ${report.title}\n위치: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}\n내용: ${report.description}\nK-ROAD 제보번호: ${report.id}`;
    window.open("https://www.safetyreport.go.kr/", "_blank", "noopener,noreferrer");
    try { await navigator.clipboard.writeText(text); setMessage("내용을 복사했습니다. 안전신문고에서 사진을 다시 첨부하고 제출해 주세요."); }
    catch { setMessage("복사에 실패했습니다. 내용을 직접 옮겨 주세요."); }
  };
  return <aside className="sr-detail" aria-label="제보 상세"><div className="sr-detail-head"><SeedBadge tone={report.category === "danger" ? "critical" : report.category === "near_miss" ? "warning" : "informative"}>{labels[report.category]}</SeedBadge><button type="button" className="sr-icon-button" onClick={onClose} aria-label="제보 상세 닫기"><X size={20}/></button></div>
    {report.photoUrl ? <img className="sr-detail-photo" src={report.photoUrl} alt={`${report.title} 현장 사진`}/> : <div className="sr-no-photo"><Camera size={26}/>등록된 현장 사진 없음</div>}
    <div className="sr-detail-body"><small>{new Date(report.createdAt).toLocaleString("ko-KR")}</small><h2>{report.title}</h2><p className="sr-detail-summary"><Sparkles size={17}/>{report.summary}</p><p>{report.description}</p><div className="sr-detail-location"><MapPinned size={17}/>{report.lat.toFixed(5)}, {report.lng.toFixed(5)} · {report.locationSource === "gps" ? `휴대폰 GPS ±${Math.round(report.locationAccuracyM ?? 0)}m` : "지도 선택 위치"}</div><span className="sr-pending">기관 접수 전 · K-ROAD 지도 제보</span>{report.managementProgress && <div className="kr-report-progress"><strong>K-ROAD 관리 · {caseStatusLabels[report.managementProgress.status]}</strong><p>{report.managementProgress.message}</p><small>{report.managementProgress.department} · {report.managementProgress.updatedAt.slice(0, 10)}</small></div>}<button type="button" className="sr-agency-button" onClick={handoff}><Building2 size={17}/>안전신문고에서 기관에 제출</button><small className="sr-agency-note">공식 민원은 안전신문고에서 본인이 사진과 내용을 제출해야 접수됩니다. K-ROAD 저장만으로 기관에 전달되지 않습니다.</small>{message && <p className="sr-copy-message" role="status">{message}</p>}</div>
  </aside>;
}

export function GroadApp() {
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [topic, setTopic] = useState<ReportTopic>("road");
  const [chatBusy, setChatBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetch("/api/v1/reports", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ reports?: SafetyReport[] }>; }).then((data) => { if (!active) return; const records = data.reports ?? []; setReports(records); setSelected((current) => current ? records.find((row) => row.id === current.id) ?? current : null); }).catch(() => { if (active) setNotice("지도 기록을 불러오지 못했습니다. 서버 연결을 확인해 주세요."); }); };
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 6000); };
  const saved = (report: SafetyReport) => { setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]); setTopic(report.topic ?? "road"); setFilter("all"); setSelected(report); setChatOpen(false); showNotice("사진에서 판단하고 확인한 내용을 K-ROAD 지도에 저장했습니다. 기관 공식 접수는 별도입니다."); };
  const pick = (location: Point) => { setPoint(location); setPickingLocation(false); setChatOpen(true); };
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const topicReports = reportsForTopic(reports, topic);
  const shown = filter === "all" ? topicReports : topicReports.filter((report) => report.category === filter);
  const changeTopic = (value: ReportTopic) => { if (chatBusy || value === topic) return; setTopic(value); setFilter("all"); setSelected(null); setPickingLocation(false); setChatOpen(false); };
  return <div className="safety-app seed-groad" data-topic={topic}>
    <header className="sr-header"><div className="kr-header-shell">
      <Brand/>
      <nav className="sr-bottom-nav" aria-label="정보 분야">{reportTopics.map((item) => { const Icon = topicIcons[item.id]; return <button type="button" key={item.id} className={topic === item.id ? "active" : ""} aria-pressed={topic === item.id} disabled={chatBusy} onClick={() => changeTopic(item.id)}><Icon size={20}/><span>{item.label}</span></button>; })}</nav>
      <div className="sr-header-actions"><a className="kr-agency-link" href="/admin"><Building2 size={16}/>기관 관리</a><SeedButton onClick={() => setChatOpen(true)}><Camera size={18}/>사진으로 알리기</SeedButton></div>
    </div></header>
    <main className="sr-main">
      <div className="sr-map-heading"><div><span className="sr-kicker">강원특별자치도 · {topicInfo.label}</span><h1>{topicInfo.heading}</h1><p>{topicInfo.examples}</p></div><a className="kr-map-anchor" href="#field-map"><MapPinned size={17}/>현장 지도 보기</a></div>
      <div className="kr-content-grid">
        <aside className="kr-action-rail" aria-label="사진 분석과 공개 민원 출처">
          <section className="kr-photo-invite"><div className="kr-invite-label"><span className="kr-invite-symbol"><Camera size={23}/></span><span>사진을 보는 도우미, 우왓</span></div><div className="kr-invite-copy"><h2>사진 한 장으로<br/>함께 확인해요.</h2><p>사진에 보이는 상황을 살펴보고<br/>필요한 내용을 정리해 드려요.</p></div><button type="button" className="kr-photo-start" onClick={() => setChatOpen(true)}><Camera size={18}/>사진으로 알리기</button><small><Bell size={14}/>확인이 필요하면 알림음으로 알려요</small></section>
          <PublicComplaintSources/>
        </aside>
        <PublicComplaints topic={topic}/>
      </div>
      <section id="field-map" className="kr-map-section" aria-labelledby="field-map-heading">
        <div className="kr-map-section-heading"><div><span className="sr-kicker">사진으로 함께 남긴 기록</span><h2 id="field-map-heading">K-ROAD 현장 지도</h2><p>우왓과 확인하고 공개한 현장 정보를 살펴보세요.</p></div><span className="kr-map-record-count"><MapPinned size={16}/>{topicReports.length}개 현장 기록</span></div>
        <div className="sr-filter" aria-label={`${topicInfo.label} 지도 표시 필터`}><button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체 <b>{topicReports.length}</b></button>{(Object.keys(labels) as Category[]).map((category) => <button type="button" key={category} className={`${category}${filter === category ? " active" : ""}`} aria-pressed={filter === category} onClick={() => setFilter(category)}><i/>{labels[category]} <b>{topicReports.filter((report) => report.category === category).length}</b></button>)}</div>
        {pickingLocation && <div className="uwat-map-picking" role="status">현장 위치를 지도에서 눌러 주세요.<button type="button" onClick={() => { setPickingLocation(false); setChatOpen(true); }}>사진 분석으로 돌아가기</button></div>}
        <div className="sr-map-frame"><LiveRiskMap reports={shown} onSelectReport={setSelected} pickingLocation={pickingLocation} showCategoryFilter={false} onNewReportAt={pick} onNotice={showNotice}/>{selected && <ReportDetail report={selected} onClose={() => setSelected(null)}/>}</div>
      </section>
      <section className="sr-feed"><div className="kr-feed-heading"><h2>함께 남긴 {topicInfo.label} 기록</h2><span>최근 공개 기록</span></div>{shown.length ? <div className="sr-feed-list">{shown.slice(0, 8).map((report) => <button type="button" key={report.id} onClick={() => { setSelected(report); document.getElementById("field-map")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span className={`sr-feed-icon ${report.category}`}><MapPinned size={20}/></span><span><strong>{report.title}</strong><small>{report.summary}</small></span></button>)}</div> : <div className="sr-feed-empty"><span className="kr-empty-symbol"><MapPinned size={25}/></span><div><strong>{filter === "all" ? "이 분야의 첫 현장 기록을 기다리고 있어요." : "이 조건에 맞는 현장 기록이 없어요."}</strong><p>발견한 상황을 사진으로 남겨 주세요. 우왓이 함께 확인해요.</p></div><button type="button" onClick={() => setChatOpen(true)}><Camera size={17}/>사진으로 남기기</button></div>}</section>
      <div className="sr-official-note"><Info size={18}/><p>공개 민원 목록과 K-ROAD 현장 기록은 별도입니다. 지도에 남긴 기록은 기관 공식 접수나 도로 통제를 뜻하지 않아요.</p></div>
      <footer className="kr-page-footer"><span><strong>K-ROAD</strong>우리 동네 불편과 위험을 함께</span><a href="/admin"><Building2 size={15}/>기관 관리</a></footer>
    </main>
    <button type="button" className="sr-chat-fab" onClick={() => setChatOpen(true)} aria-label="우왓 사진 분석 열기"><Camera size={21}/><span>우왓</span></button>
    <UwatChat open={chatOpen} topic={topic} point={point} onBusyChange={setChatBusy} onClose={() => setChatOpen(false)} onPickLocation={() => { setPickingLocation(true); setChatOpen(false); showNotice("현장 위치를 지도에서 눌러 주세요."); window.setTimeout(() => document.getElementById("field-map")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} onSaved={saved} onAttention={showNotice}/>
    {notice && <div className="sr-toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기"><X size={18}/></button></div>}
  </div>;
}
