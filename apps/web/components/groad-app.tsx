"use client";

import dynamic from "next/dynamic";
import { Camera, ChevronRight, ExternalLink, Info, MapPinned, MessageCircle, Plus, ShieldAlert, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { SafetyReport } from "./live-risk-map";
import { SeedBadge, SeedButton, SeedTextarea } from "./seed-ui";
import { locationErrorMessage, locationPreflight } from "@/lib/location-diagnostics";
import { GpsAccessHint } from "./gps-access-hint";

const LiveRiskMap = dynamic(() => import("./live-risk-map"), { ssr: false });
type Category = SafetyReport["category"];
type Point = { lat: number; lng: number };
const labels: Record<Category, string> = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
const detail: Record<Category, string> = { danger: "즉시 점검이 필요한 도로", near_miss: "사고로 이어질 뻔한 상황", caution: "미리 알릴 주의 사항" };

function Brand() {
  return <div className="sr-brand"><svg viewBox="0 0 48 52" role="img" aria-label="G-ROAD 로고"><path d="M24 2C12.4 2 3 11.4 3 23c0 15 21 27 21 27s21-12 21-27C45 11.4 35.6 2 24 2Z" fill="#3869f8"/><path d="M32.5 17.6a11.1 11.1 0 1 0 1.6 13.6V25H25" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round"/><circle cx="35.6" cy="10.5" r="4.8" fill="#ff7651" stroke="#fff" strokeWidth="2"/></svg><span><strong>G-ROAD</strong><small>우리 동네 도로 안전 제보</small></span></div>;
}

async function stripPhotoMetadata(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일을 선택해 주세요.");
  if (file.size > 12 * 1024 * 1024) throw new Error("원본 사진은 12MB 이하만 선택할 수 있습니다.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", .75);
    if (result.length > 4 * 1024 * 1024) throw new Error("사진이 너무 큽니다. 다른 사진을 선택해 주세요.");
    return result;
  } finally { bitmap.close(); }
}

function Composer({ point, onClose, onSaved }: { point: Point | null; onClose: () => void; onSaved: (report: SafetyReport) => void }) {
  const [category, setCategory] = useState<Category>("danger");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<Point | null>(point);
  const [locationSource, setLocationSource] = useState<"gps" | "map" | null>(point ? "map" : null);
  const [locationAccuracyM, setLocationAccuracyM] = useState<number | null>(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [allowAi, setAllowAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gpsHelp, setGpsHelp] = useState(false);
  const locate = () => {
    const blocked = locationPreflight();
    if (blocked) { setError(blocked); setGpsHelp(true); return; }
    setLocating(true); setError(""); setGpsHelp(false);
    try { navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
      setLocation({ lat: coords.latitude, lng: coords.longitude });
      setLocationSource("gps"); setLocationAccuracyM(coords.accuracy);
      setLocationCapturedAt(new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString());
      setError(""); setGpsHelp(false); setLocating(false);
    }, (error) => { setError(locationErrorMessage(error)); setGpsHelp(true); setLocating(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }); }
    catch { setError("브라우저가 위치 요청을 막았습니다. HTTPS 주소를 Chrome 또는 Safari에서 직접 열어 주세요."); setGpsHelp(true); setLocating(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!location) { setError("지도에서 위치를 찍거나 현재 위치를 사용해 주세요."); return; }
    if (description.trim().length < 10) { setError("상황을 10자 이상 적어 주세요."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, description: description.trim(), lat: location.lat, lng: location.lng, locationSource: locationSource ?? "map", locationAccuracyM, locationCapturedAt, photoDataUrl: photo ?? undefined, allowAiProcessing: allowAi }) });
      const data = await response.json() as { report?: SafetyReport; error?: { message?: string } };
      if (!response.ok || !data.report) throw new Error(data.error?.message ?? "제보 저장에 실패했습니다.");
      onSaved(data.report);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "제보 저장에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <div className="sr-modal-backdrop" onMouseDown={onClose}><section className="sr-composer" role="dialog" aria-modal="true" aria-labelledby="sr-report-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="sr-kicker">현장 제보</span><h2 id="sr-report-title">어떤 상황인가요?</h2></div><button type="button" className="sr-icon-button" onClick={onClose} aria-label="제보 창 닫기"><X size={21}/></button></header>
    <form onSubmit={submit}>
      <fieldset className="sr-category-select"><legend>위험 정도</legend>{(Object.keys(labels) as Category[]).map((value) => <button type="button" key={value} className={`sr-category ${value}${category === value ? " selected" : ""}`} onClick={() => setCategory(value)}><strong>{labels[value]}</strong><small>{detail[value]}</small></button>)}</fieldset>
      <label className="sr-field">현장 사진 <span>촬영·선택 후 현재 GPS 자동 확인 · EXIF 제거</span><input type="file" accept="image/*" capture="environment" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setPhoto(await stripPhotoMetadata(file)); setError(""); locate(); } catch (cause) { setError(cause instanceof Error ? cause.message : "사진을 읽지 못했습니다."); } }}/></label>
      {photo && <div className="sr-photo-preview"><img src={photo} alt="제보 사진 미리보기"/><button type="button" onClick={() => setPhoto(null)}>사진 제거</button></div>}
      <label className="sr-field">무슨 일이 있었나요?<SeedTextarea label="제보 내용" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 굽은 도로에 낙석이 떨어져 차들이 급정거하고 있어요." maxLength={2000}/><small>{description.length}/2000자 · 얼굴·번호판 등 개인정보는 피하세요.</small></label>
      <div className="sr-location"><MapPinned size={18}/><div><strong>제보 위치</strong><small>{locating ? "휴대폰 GPS 측정 중 · 위치 권한을 허용해 주세요" : location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · ${locationSource === "gps" ? `GPS 정확도 ±${Math.round(locationAccuracyM ?? 0)}m` : "지도에서 선택"}` : "사진을 찍으면 GPS를 자동 확인합니다. 지도에서 위치를 고를 수도 있어요."}</small></div><button type="button" onClick={locate} disabled={locating}>{locating ? "측정 중" : "내 위치"}</button></div>
      <label className="sr-ai-consent"><input type="checkbox" checked={allowAi} onChange={(event) => setAllowAi(event.target.checked)}/><span>AI 문장 정리에 동의합니다<small>선택 시 제보 글만 외부 AI 서비스에 전송될 수 있습니다. 사진은 전송하지 않습니다. 동의하지 않아도 기본 자동 정리로 저장됩니다.</small></span></label>
      <p className="sr-privacy-note"><Info size={16}/>사진·내용은 G-ROAD 지도 이용자에게 표시됩니다. 기관 접수는 별도 단계입니다.</p>
      {error && <p className="sr-error" role="alert">{error}</p>}
      {gpsHelp && <GpsAccessHint />}
      <SeedButton className="sr-submit" type="submit" disabled={busy || locating}>{busy ? "제보 저장 중…" : locating ? "GPS 위치 확인 중…" : "지도에 제보 올리기"}<ChevronRight size={19}/></SeedButton>
    </form>
  </section></div>;
}

function ReportDetail({ report, onClose }: { report: SafetyReport; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const handoff = async () => {
    const text = `[도로 안전 신고] ${report.title}\n위치: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}\n내용: ${report.description}\nG-ROAD 제보번호: ${report.id}`;
    window.open("https://www.safetyreport.go.kr/", "_blank", "noopener,noreferrer");
    try { await navigator.clipboard.writeText(text); setMessage("내용을 복사했습니다. 안전신문고에서 사진을 다시 첨부하고 제출해 주세요."); }
    catch { setMessage("복사에 실패했습니다. 내용을 직접 옮겨 주세요."); }
  };
  return <aside className="sr-detail" aria-label="제보 상세"><div className="sr-detail-head"><SeedBadge tone={report.category === "danger" ? "critical" : report.category === "near_miss" ? "warning" : "informative"}>{labels[report.category]}</SeedBadge><button type="button" className="sr-icon-button" onClick={onClose} aria-label="제보 상세 닫기"><X size={20}/></button></div>
    {report.photoUrl ? <img className="sr-detail-photo" src={report.photoUrl} alt={`${report.title} 현장 사진`}/> : <div className="sr-no-photo"><Camera size={26}/>등록된 현장 사진 없음</div>}
    <div className="sr-detail-body"><small>{new Date(report.createdAt).toLocaleString("ko-KR")}</small><h2>{report.title}</h2><p className="sr-detail-summary"><Sparkles size={17}/>{report.summary}</p><p>{report.description}</p><div className="sr-detail-location"><MapPinned size={17}/>{report.lat.toFixed(5)}, {report.lng.toFixed(5)} · {report.locationSource === "gps" ? `휴대폰 GPS ±${Math.round(report.locationAccuracyM ?? 0)}m` : "지도 선택 위치"}</div><span className="sr-pending">기관 접수 전 · G-ROAD 지도 제보</span><button type="button" className="sr-agency-button" onClick={handoff}><ExternalLink size={17}/>안전신문고에서 기관에 제출</button><small className="sr-agency-note">공식 민원은 안전신문고에서 본인이 사진과 내용을 제출해야 접수됩니다. G-ROAD 저장만으로 기관에 전달되지 않습니다.</small>{message && <p className="sr-copy-message" role="status">{message}</p>}</div>
  </aside>;
}

function UwatChat({ onClose, onReport, count }: { onClose: () => void; onReport: () => void; count: number }) {
  const [messages, setMessages] = useState<Array<{ from: "bot" | "user"; text: string }>>([{ from: "bot", text: "우왓! 도로에서 발견한 위험을 알려주세요. 제보 방법, 위험 표시, 기관 제출 절차를 안내해 드릴게요." }]);
  const [input, setInput] = useState("");
  const send = (event: FormEvent) => {
    event.preventDefault(); const question = input.trim(); if (!question) return;
    const answer = /기관|시청|민원|신고/.test(question) ? "G-ROAD 제보는 지도에 저장됩니다. 기관 공식 접수는 제보 상세의 안전신문고에서 직접 완료해야 해요." : /위성|실시간/.test(question) ? "최근 위성 관측은 일일 영상으로 구름이 가릴 수 있어요. 도로 상황은 제보 사진과 내용을 함께 확인해 주세요." : /위험|아차|주의/.test(question) ? `현재 등록된 제보는 ${count}건이에요. 위험지역, 아차!지역, 단순주의지역으로 나눠 표시해요.` : /제보|사진|등록/.test(question) ? "제보하기를 누르고 사진, 설명, 위치를 넣어 주세요. 얼굴·번호판은 먼저 가려 주세요." : "저는 우왓 안내 도우미예요. 제보 방법이나 기관 제출 절차를 물어봐 주세요. 긴급 상황은 112·119에 직접 신고해 주세요.";
    setMessages((current) => [...current, { from: "user", text: question }, { from: "bot", text: answer }]); setInput("");
  };
  return <aside className="sr-chat" aria-label="우왓 안내 챗봇"><header><span className="sr-chat-face">!</span><div><strong>우왓</strong><small>도로 안전 안내 도우미</small></div><button type="button" className="sr-icon-button" onClick={onClose} aria-label="챗봇 닫기"><X size={20}/></button></header><div className="sr-chat-messages">{messages.map((message, index) => <p key={index} className={message.from}>{message.text}</p>)}</div><button type="button" className="sr-chat-report" onClick={onReport}><Plus size={17}/>바로 제보하기</button><form onSubmit={send}><input aria-label="우왓에게 질문" placeholder="궁금한 점을 물어보세요" value={input} onChange={(event) => setInput(event.target.value)}/><button type="submit" aria-label="질문 보내기"><ChevronRight size={20}/></button></form><small className="sr-chat-disclaimer">현재 우왓은 안내 규칙으로 답합니다. 현장 판단이나 기관 답변을 대신하지 않습니다.</small></aside>;
}

export function GroadApp() {
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [selected, setSelected] = useState<SafetyReport | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [intro, setIntro] = useState(false);
  useEffect(() => { setIntro(!sessionStorage.getItem("groad_intro_seen")); }, []);
  useEffect(() => { if (!intro) return; const timer = window.setTimeout(() => { setIntro(false); sessionStorage.setItem("groad_intro_seen", "1"); }, 2600); return () => window.clearTimeout(timer); }, [intro]);
  useEffect(() => { fetch("/api/v1/reports").then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ reports?: SafetyReport[] }>; }).then((data) => setReports(data.reports ?? [])).catch(() => setNotice("제보 목록을 불러오지 못했습니다. 서버 연결을 확인해 주세요.")); }, []);
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 5200); };
  const saved = (report: SafetyReport) => { setReports((current) => [report, ...current]); setComposerOpen(false); setSelected(report); showNotice("지도에 저장했습니다. 기관 공식 접수는 제보 상세에서 진행해 주세요."); };
  const shown = filter === "all" ? reports : reports.filter((report) => report.category === filter);
  return <div className="safety-app seed-groad">
    {intro && <div className="sr-intro" onClick={() => { setIntro(false); sessionStorage.setItem("groad_intro_seen", "1"); }}><div><Brand/><strong>{"G-ROAD".split("").map((letter, index) => <span key={index} style={{ animationDelay: `${index * 170}ms` }}>{letter}</span>)}</strong><small>길 위의 위험을 함께 발견해요</small></div></div>}
    <header className="sr-header"><Brand/><div className="sr-header-actions"><span>강원 안전 제보 지도</span><SeedButton onClick={() => { setPoint(null); setComposerOpen(true); }}><Plus size={18}/>제보하기</SeedButton></div></header>
    <main className="sr-main"><div className="sr-map-heading"><div><span className="sr-kicker">G-ROAD SAFETY MAP</span><h1>위험을 보면, 함께 알려요.</h1><p>도로의 위험과 아찔했던 순간을 지도에 남겨 주세요.</p></div><div className="sr-count"><strong>{reports.length}</strong><span>등록된 제보</span></div></div>
      <div className="sr-filter" aria-label="제보 유형 필터"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>전체 <b>{reports.length}</b></button>{(Object.keys(labels) as Category[]).map((category) => <button key={category} className={`${category}${filter === category ? " active" : ""}`} onClick={() => setFilter(category)}><i/>{labels[category]} <b>{reports.filter((report) => report.category === category).length}</b></button>)}</div>
      <div className="sr-map-frame"><LiveRiskMap reports={shown} onSelectReport={setSelected} onNewReportAt={(location: Point) => { setPoint(location); setComposerOpen(true); }} onNotice={showNotice}/>{selected && <ReportDetail report={selected} onClose={() => setSelected(null)}/>}<button type="button" className="sr-map-report" onClick={() => { setPoint(null); setComposerOpen(true); }}><Camera size={20}/>현장 제보</button></div>
      <section className="sr-feed"><div><span className="sr-kicker">최근 제보</span><h2>지도 위 새 소식</h2></div>{shown.length ? <div className="sr-feed-list">{shown.slice(0, 8).map((report) => <button type="button" key={report.id} onClick={() => setSelected(report)}><span className={`sr-feed-icon ${report.category}`}>!</span><span><strong>{report.title}</strong><small>{report.summary}</small></span><ChevronRight size={18}/></button>)}</div> : <div className="sr-feed-empty"><ShieldAlert size={25}/><strong>아직 등록된 제보가 없습니다.</strong><p>사진과 위치를 남겨 첫 위험 정보를 알려 주세요.</p></div>}</section>
      <div className="sr-official-note"><Info size={19}/><p>지도 제보와 공공기관 공식 접수는 별개입니다. 제보 상세에서 안전신문고로 이동해 제출을 완료할 수 있습니다. 위험 표시는 시민 제보를 기반으로 하며 현장 통제를 뜻하지 않습니다.</p></div>
    </main>
    <nav className="sr-bottom-nav" aria-label="주요 메뉴"><button type="button" className="active"><MapPinned size={21}/>지도</button><button type="button" onClick={() => { setPoint(null); setComposerOpen(true); }}><Camera size={21}/>제보</button><button type="button" onClick={() => setChatOpen(true)}><MessageCircle size={21}/>우왓</button></nav>
    <button type="button" className="sr-chat-fab" onClick={() => setChatOpen(true)} aria-label="우왓 챗봇 열기"><span>!</span><small>우왓</small></button>
    {composerOpen && <Composer point={point} onClose={() => setComposerOpen(false)} onSaved={saved}/>}
    {chatOpen && <UwatChat onClose={() => setChatOpen(false)} onReport={() => { setChatOpen(false); setPoint(null); setComposerOpen(true); }} count={reports.length}/>}
    {notice && <div className="sr-toast" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="알림 닫기"><X size={15}/></button></div>}
  </div>;
}
