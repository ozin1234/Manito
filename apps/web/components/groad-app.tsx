"use client";

import dynamic from "next/dynamic";
import { Camera, ChevronRight, ExternalLink, House, Info, MapPinned, MessageCircle, Route, ShieldAlert, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SafetyReport } from "./live-risk-map";
import { SeedBadge, SeedButton } from "./seed-ui";
import { UwatChat } from "./uwat-chat";
import { reportTopics, reportsForTopic, type ReportTopic } from "@/lib/report-topics";

const LiveRiskMap = dynamic(() => import("./live-risk-map"), { ssr: false });
type Category = SafetyReport["category"];
type Point = { lat: number; lng: number };
const labels: Record<Category, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
const topicIcons = { living: House, road: Route, safety: ShieldAlert };

function Brand() {
  return <div className="sr-brand"><svg viewBox="0 0 48 52" role="img" aria-label="G-ROAD 로고"><path d="M24 2C12.4 2 3 11.4 3 23c0 15 21 27 21 27s21-12 21-27C45 11.4 35.6 2 24 2Z" fill="#3869f8"/><path d="M32.5 17.6a11.1 11.1 0 1 0 1.6 13.6V25H25" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="35.6" cy="10.5" r="4.8" fill="#ff7651" stroke="#fff" strokeWidth="2"/></svg><span><strong>G-ROAD</strong><small>우리 동네 불편과 위험을 함께</small></span></div>;
}

function ReportDetail({ report, onClose }: { report: SafetyReport; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const handoff = async () => {
    const text = `[${reportTopics.find((item) => item.id === (report.topic ?? "road"))?.label ?? "도로"} 현장 기록] ${report.title}\n위치: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}\n내용: ${report.description}\nG-ROAD 제보번호: ${report.id}`;
    window.open("https://www.safetyreport.go.kr/", "_blank", "noopener,noreferrer");
    try { await navigator.clipboard.writeText(text); setMessage("내용을 복사했습니다. 안전신문고에서 사진을 다시 첨부하고 제출해 주세요."); }
    catch { setMessage("복사에 실패했습니다. 내용을 직접 옮겨 주세요."); }
  };
  return <aside className="sr-detail" aria-label="제보 상세"><div className="sr-detail-head"><SeedBadge tone={report.category === "danger" ? "critical" : report.category === "near_miss" ? "warning" : "informative"}>{labels[report.category]}</SeedBadge><button type="button" className="sr-icon-button" onClick={onClose} aria-label="제보 상세 닫기"><X size={20}/></button></div>
    {report.photoUrl ? <img className="sr-detail-photo" src={report.photoUrl} alt={`${report.title} 현장 사진`}/> : <div className="sr-no-photo"><Camera size={26}/>등록된 현장 사진 없음</div>}
    <div className="sr-detail-body"><small>{new Date(report.createdAt).toLocaleString("ko-KR")}</small><h2>{report.title}</h2><p className="sr-detail-summary"><Sparkles size={17}/>{report.summary}</p><p>{report.description}</p><div className="sr-detail-location"><MapPinned size={17}/>{report.lat.toFixed(5)}, {report.lng.toFixed(5)} · {report.locationSource === "gps" ? `휴대폰 GPS ±${Math.round(report.locationAccuracyM ?? 0)}m` : "지도 선택 위치"}</div><span className="sr-pending">기관 접수 전 · G-ROAD 지도 제보</span><button type="button" className="sr-agency-button" onClick={handoff}><ExternalLink size={17}/>안전신문고에서 기관에 제출</button><small className="sr-agency-note">공식 민원은 안전신문고에서 본인이 사진과 내용을 제출해야 접수됩니다. G-ROAD 저장만으로 기관에 전달되지 않습니다.</small>{message && <p className="sr-copy-message" role="status">{message}</p>}</div>
  </aside>;
}

export function GroadApp() {
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [topic, setTopic] = useState<ReportTopic>("road");
  const [chatBusy, setChatBusy] = useState(false);
  const [intro, setIntro] = useState(false);
  useEffect(() => { setIntro(!sessionStorage.getItem("groad_intro_seen")); }, []);
  useEffect(() => { if (!intro) return; const timer = window.setTimeout(() => { setIntro(false); sessionStorage.setItem("groad_intro_seen", "1"); }, 2600); return () => window.clearTimeout(timer); }, [intro]);
  useEffect(() => { fetch("/api/v1/reports").then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ reports?: SafetyReport[] }>; }).then((data) => setReports(data.reports ?? [])).catch(() => setNotice("지도 기록을 불러오지 못했습니다. 서버 연결을 확인해 주세요.")); }, []);
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 6000); };
  const saved = (report: SafetyReport) => { setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]); showNotice("우왓과 확인한 내용을 지도에 저장했습니다. 기관 공식 접수는 별도입니다."); };
  const pick = (location: Point) => { setPoint(location); setPickingLocation(false); setChatOpen(true); };
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const topicReports = reportsForTopic(reports, topic);
  const shown = filter === "all" ? topicReports : topicReports.filter((report) => report.category === filter);
  const changeTopic = (value: ReportTopic) => { if (chatBusy || value === topic) return; setTopic(value); setFilter("all"); setSelected(null); setPickingLocation(false); setChatOpen(false); };
  return <div className="safety-app seed-groad">
    {intro && <div className="sr-intro" onClick={() => { setIntro(false); sessionStorage.setItem("groad_intro_seen", "1"); }}><div><Brand/><strong>{"G-ROAD".split("").map((letter, index) => <span key={index} style={{ animationDelay: `${index * 170}ms` }}>{letter}</span>)}</strong><small>길 위의 위험을 함께 발견해요</small></div></div>}
    <header className="sr-header"><Brand/><div className="sr-header-actions"><span>사진과 대화로 확인하는 우리 동네</span><SeedButton onClick={() => setChatOpen(true)}><MessageCircle size={18}/>우왓과 말하기</SeedButton></div></header>
    <nav className="sr-bottom-nav" aria-label="정보 분야">{reportTopics.map((item) => { const Icon = topicIcons[item.id]; return <button type="button" key={item.id} className={topic === item.id ? "active" : ""} aria-pressed={topic === item.id} disabled={chatBusy} onClick={() => changeTopic(item.id)}><Icon size={21}/>{item.label}</button>; })}</nav>
    <main className="sr-main"><div className="sr-map-heading"><div><span className="sr-kicker">{topicInfo.label}</span><h1>{topicInfo.heading}</h1><p>{topicInfo.examples}</p></div><div className="sr-count"><strong>{topicReports.length}</strong><span>공유한 {topicInfo.label} 정보</span></div></div>
      <div className="sr-filter" aria-label={`${topicInfo.label} 지도 표시 필터`}><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>전체 <b>{topicReports.length}</b></button>{(Object.keys(labels) as Category[]).map((category) => <button key={category} className={`${category}${filter === category ? " active" : ""}`} onClick={() => setFilter(category)}><i/>{labels[category]} <b>{topicReports.filter((report) => report.category === category).length}</b></button>)}</div>
      {pickingLocation && <div className="uwat-map-picking" role="status">정차 상태에서 현장 위치를 지도에서 눌러 주세요.<button type="button" onClick={() => { setPickingLocation(false); setChatOpen(true); }}>취소하고 대화로</button></div>}
      <div className="sr-map-frame"><LiveRiskMap reports={shown} onSelectReport={setSelected} pickingLocation={pickingLocation} onNewReportAt={pick} onNotice={showNotice}/>{selected && <ReportDetail report={selected} onClose={() => setSelected(null)}/>}<button type="button" className="sr-map-report" onClick={() => setChatOpen(true)}><MessageCircle size={20}/>우왓에게 알리기</button></div>
      <section className="sr-feed"><div><span className="sr-kicker">함께 확인한 {topicInfo.label} 정보</span><h2>지도 위 새 소식</h2></div>{shown.length ? <div className="sr-feed-list">{shown.slice(0, 8).map((report) => <button type="button" key={report.id} onClick={() => setSelected(report)}><span className={`sr-feed-icon ${report.category}`}>!</span><span><strong>{report.title}</strong><small>{report.summary}</small></span><ChevronRight size={18}/></button>)}</div> : <div className="sr-feed-empty"><ShieldAlert size={25}/><strong>{filter === "all" ? `아직 공유된 ${topicInfo.label} 정보가 없습니다.` : "선택한 위험 표시에 해당하는 정보가 없습니다."}</strong><p>우왓에게 발견한 상황을 말해 주세요.</p></div>}</section>
      <div className="sr-official-note"><Info size={19}/><p>지도 공유는 기관 공식 접수와 별개입니다. AI 해석에는 오차가 있어 현장 확인이 필요하며 도로 통제를 뜻하지 않습니다.</p></div>
    </main>
    <button type="button" className="sr-chat-fab" onClick={() => setChatOpen(true)} aria-label="우왓 AI 대화 열기"><span>!</span><small>우왓</small></button>
    <UwatChat open={chatOpen} topic={topic} point={point} onBusyChange={setChatBusy} onClose={() => setChatOpen(false)} onPickLocation={() => { setPickingLocation(true); setChatOpen(false); showNotice("현장 위치를 지도에서 눌러 주세요."); }} onSaved={saved} onAttention={showNotice}/>
    {notice && <div className="sr-toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기"><X size={15}/></button></div>}
  </div>;
}
