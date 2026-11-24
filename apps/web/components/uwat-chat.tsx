"use client";

import { Bell, Camera, CircleHelp, MapPinned, Pause, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SafetyReport } from "./live-risk-map";
import { locationErrorMessage, locationPreflight } from "@/lib/location-diagnostics";
import { prepareReportPhoto } from "@/lib/report-photo";
import type { UwatLocation, UwatReply } from "@/lib/uwat-types";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { reportTopics, sameConversationTopic, type ReportTopic } from "@/lib/report-topics";

type Message = { role: "assistant" | "user" | "system"; text: string };
type Turn = { photo?: string; fresh?: boolean; selection?: { questionId: string; optionId: string }; location?: UwatLocation | null };
const labels = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
export function UwatChat({ open, topic, point, onClose, onPickLocation, onSaved, onAttention, onBusyChange }: {
  open: boolean; topic: ReportTopic; point: { lat: number; lng: number } | null; onClose: () => void;
  onPickLocation: () => void; onSaved: (report: SafetyReport) => void; onAttention: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const [messages, setMessages] = useState<Message[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<UwatLocation | null>(null);
  const [reply, setReply] = useState<UwatReply | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false);
  const [locating, setLocating] = useState(false), [error, setError] = useState(""), [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; analysisMode: string } | null>(null);
  const busyRef = useRef(false), replyRef = useRef(reply); replyRef.current = reply;
  const topicRef = useRef(topic); topicRef.current = topic;
  const consentRef = useRef(consent); consentRef.current = consent;
  const previousTopic = useRef(topic), bodyRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const sound = useAlertSound();
  const invalidateDraft = () => {
    const current = replyRef.current;
    if (!current) return;
    const value = { ...current, phase: "needs_update", question: null, confirmationToken: null, analysis: { ...current.analysis, ready: false } };
    replyRef.current = value; setReply(value);
  };
  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/v1/assistant/status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStatus(await response.json() as { configured: boolean; analysisMode: string });
    } catch { setError("사진 분석 서버에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요."); }
  };
  useEffect(() => { if (open) void refreshStatus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { onBusyChange(busy || preparing || locating); }, [busy, preparing, locating, onBusyChange]);
  useEffect(() => {
    if (previousTopic.current === topic) return;
    previousTopic.current = topic;
    replyRef.current = null; setReply(null); setPaused(false); setError("");
    setMessages([]);
  }, [topic]);
  useEffect(() => {
    if (point) { setLocation({ ...point, locationSource: "map", locationAccuracyM: null, locationCapturedAt: null }); setPaused(false); invalidateDraft(); }
  }, [point]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, reply, error]);
  const locate = async (): Promise<UwatLocation | null> => {
    invalidateDraft();
    const blocked = locationPreflight();
    if (blocked) { setError(blocked); return null; }
    setLocating(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
        const value: UwatLocation = { lat: coords.latitude, lng: coords.longitude, locationSource: "gps", locationAccuracyM: coords.accuracy, locationCapturedAt: new Date(timestamp || Date.now()).toISOString() };
        setLocation(value); setLocating(false); resolve(value);
      }, (cause) => { setError(locationErrorMessage(cause)); setLocating(false); resolve(null); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
    });
  };
  const turn = async (options: Turn = {}) => {
    if (busyRef.current) return;
    if (!consentRef.current) { setError("사진을 Google Gemini로 보내 분석하는 데 먼저 동의해 주세요."); return; }
    if (!status?.configured || status.analysisMode !== "photo_only") { setError("사진 분석 서버 연결을 확인해 주세요."); return; }
    const image = options.photo ?? photo;
    if (!image) { setError("현장 사진을 먼저 올려 주세요."); return; }
    const requestTopic = topic, session = replyRef.current;
    busyRef.current = true; setBusy(true); setPaused(false); setError(""); invalidateDraft();
    void sound.unlock();
    try {
      const response = await fetch("/api/v1/assistant/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: requestTopic, sessionId: !options.fresh && sameConversationTopic(session, requestTopic) ? session?.sessionId : undefined, selection: options.selection, photoDataUrl: image, location: options.location === undefined ? location : options.location, allowAiProcessing: true }),
      });
      const value = await response.json() as UwatReply & { error?: { message?: string } };
      if (topicRef.current !== requestTopic || !consentRef.current) return;
      if (!response.ok) throw new Error(value.error?.message ?? "사진 분석을 완료하지 못했습니다.");
      if (!sameConversationTopic(value, requestTopic) || !value.hasPhoto) throw new Error("사진 분석 응답을 확인하지 못했습니다. 다시 시도해 주세요.");
      setReply(value); replyRef.current = value;
      const selection = session?.question?.options.find((item) => item.id === options.selection?.optionId)?.label;
      setMessages((current) => [...current, { role: "user", text: selection ?? (options.fresh ? "현장 사진을 올렸어요." : "사진을 다시 확인해 주세요.") }, { role: "assistant", text: value.reply }]);
      sound.notify(); onAttention(value.question ? "우왓이 사진을 확인했어요. 확인 질문을 확인해 주세요." : "사진 분석이 끝났어요. 우왓의 판단을 확인해 주세요.");
    } catch (cause) { if (topicRef.current !== requestTopic) return; setError(cause instanceof Error ? cause.message : "사진 분석에 실패했습니다. 사진은 유지했어요."); sound.notify(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const commit = async () => {
    const value = replyRef.current;
    if (busyRef.current || !consentRef.current || !value?.confirmationToken || !sameConversationTopic(value, topicRef.current)) return;
    busyRef.current = true; setBusy(true); setError(""); void sound.unlock();
    try {
      const response = await fetch("/api/v1/assistant/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: value.sessionId, revision: value.revision, confirmationToken: value.confirmationToken, confirmed: true }) });
      const result = await response.json() as { report?: SafetyReport; error?: { message?: string } };
      if (!response.ok || !result.report) throw new Error(result.error?.message ?? "저장을 완료하지 못했습니다.");
      onSaved(result.report); setReply(null); replyRef.current = null; setPhoto(null); setLocation(null);
      setMessages((current) => [...current, { role: "user", text: "사진과 초안·위치를 확인하고 공개 저장합니다." }, { role: "system", text: "사진 분석 결과를 K-ROAD 지도에 저장했어요. 공공기관 공식 접수는 별도예요." }]);
      sound.notify();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장을 완료하지 못했습니다."); sound.notify(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const pause = () => { setPaused(true); setMessages((current) => [...current, { role: "system", text: "아직 공개 저장하지 않았어요. 사진과 초안을 확인한 뒤 이어갈 수 있어요." }]); };
  const choose = async (id: string) => {
    const question = replyRef.current?.question;
    if (!question) return;
    if (id === "defer") { pause(); return; }
    if (question.kind === "confirm" && id === "confirm") { await commit(); return; }
    await turn({ selection: { questionId: question.id, optionId: id } });
  };
  const setPhotoFile = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true; setPreparing(true); setError(""); invalidateDraft();
    const requestTopic = topic;
    let prepared: string | null = null;
    try { prepared = await prepareReportPhoto(file); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "사진을 읽지 못했습니다."); }
    finally { busyRef.current = false; setPreparing(false); }
    if (!prepared || requestTopic !== topicRef.current) return;
    setPhoto(prepared); setLocation(null); setReply(null); replyRef.current = null;
    await turn({ photo: prepared, fresh: true, location: null });
  };
  const question = reply?.question;
  const working = busy || preparing || locating;
  return <aside className="sr-chat uwat-chat uwat-photo-chat" role="dialog" aria-label={`우왓 AI ${topicInfo.label} 사진 분석`} hidden={!open} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <header><span className="sr-chat-face"><Camera size={23}/></span><div><strong>우왓 <span className="uwat-topic">{topicInfo.label}</span></strong><small>사진으로 살피는 우리 동네</small></div><button ref={closeRef} type="button" className="sr-icon-button" onClick={onClose} aria-label="우왓 닫기"><X size={21}/></button></header>
    <div className="uwat-state" role="status" aria-live="polite"><span>{preparing ? "사진을 준비하고 있어요" : busy ? "사진을 보고 판단하고 있어요" : locating ? "현장 위치를 확인하고 있어요" : paused ? "초안을 보류했어요" : question ? "사진을 확인했어요. 답변을 골라 주세요" : "사진을 선택하면 분석을 시작해요"}</span>{working ? <span className="uwat-spinner" aria-hidden="true"/> : <span className="uwat-state-dot" aria-hidden="true"/>}</div>
    <div className="sr-chat-messages uwat-messages" ref={bodyRef}>
      {status && !status.configured && <div className="uwat-config"><strong>사진 분석 연결을 확인해 주세요</strong><p>분석 서버에 연결되지 않았습니다.</p><button type="button" onClick={() => void refreshStatus()}><RefreshCw size={15}/>연결 다시 확인</button></div>}
      {!messages.length && !photo && <div className="uwat-welcome"><span className="uwat-welcome-symbol"><Camera size={31}/></span><h2>사진으로 시작해 볼까요?</h2><p>{topicInfo.label} 현장 사진을 올려 주세요.<br/>보이는 상황을 살피고, 필요한 것만 물어볼게요.</p><ol><li><span>1</span>사진 선택</li><li><span>2</span>AI 판단 확인</li><li><span>3</span>위치·공개 확인</li></ol><small><Bell size={15}/>확인할 내용이 생기면 알림음으로 알려요.</small></div>}
      {messages.map((message, index) => <p key={index} className={message.role}>{message.text}</p>)}
      {photo && <div className="uwat-photo"><img src={photo} alt="우왓이 판단할 현장 사진"/><button type="button" disabled={working} onClick={() => { setPhoto(null); setReply(null); replyRef.current = null; setLocation(null); }}>사진 제거</button><small>사진에서 위치 메타데이터를 제거했어요 · 공개 저장 전</small></div>}
      {location && <div className="uwat-location"><MapPinned size={17}/><span>{location.locationSource === "gps" ? `GPS 오차 약 ${Math.round(location.locationAccuracyM ?? 0)}m` : "직접 고른 현장 위치"}<small>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</small></span>{reply?.phase === "needs_update" && <button type="button" disabled={working || !consent} onClick={() => void turn()}>이 위치로 확인</button>}</div>}
      {reply?.analysis.observations.length ? <div className="uwat-evidence"><strong><Sparkles size={16}/>사진에서 확인한 단서</strong><ul>{reply.analysis.observations.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {reply?.analysis.ready && <div className="uwat-draft"><small>{reportTopics.find((item) => item.id === reply.analysis.suggestedTopic)?.label ?? "분야 확인 중"} · 사진으로 정리한 초안</small><h3>{reply.analysis.title}</h3><p>{reply.analysis.summary}</p><span>{reply.analysis.category ? labels[reply.analysis.category] : "분류 확인 중"} · AI 제안</span><p className="uwat-reason">{reply.analysis.reason}</p><small>사진만으로 확인할 수 없는 내용과 실제 현장 위치를 함께 확인해 주세요.</small></div>}
      {question && !paused && <section className="uwat-question" aria-label="우왓 확인 질문"><strong><CircleHelp size={17}/>{question.text}</strong><div>{question.options.map((option) => <button type="button" key={option.id} disabled={working || !consent} onClick={() => void choose(option.id)}>{option.label}</button>)}</div>{question.kind === "location" && <div><button type="button" disabled={working || !consent} onClick={async () => { void sound.unlock(); const value = await locate(); if (value) await turn({ location: value }); }}>현장 GPS 확인</button><button type="button" disabled={working} onClick={onPickLocation}>지도에서 위치 고르기</button></div>}<button type="button" className="uwat-pause" disabled={working} onClick={pause}><Pause size={15}/>나중에 확인</button></section>}
      {reply?.sources.length ? <details className="uwat-sources"><summary>판단에 참고한 근거 {reply.sources.length}개</summary>{reply.sources.map((source) => <div key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title}</span>}<small>{source.authority === "official" ? "공식 안내" : "K-ROAD 내부 기준"} · {source.checkedAt} 확인</small></div>)}</details> : null}
      {error && <div className="uwat-error" role="alert">{error}</div>}
      {sound.error && <p className="uwat-sound-note" role="status">{sound.error}</p>}
      {photo && <p className="uwat-photo-help">사진에서 구분이 어려운 부분만 선택지로 확인해요. 지도 공개는 마지막에 결정할 수 있어요.</p>}
    </div>
    <label className="uwat-consent"><input type="checkbox" checked={consent} onChange={(event) => { consentRef.current = event.target.checked; setConsent(event.target.checked); if (!event.target.checked) invalidateDraft(); }}/><span>사진을 Google Gemini에 보내 분석하는 데 동의해요<small>얼굴·번호판은 피하거나 가려 주세요. 지도 공개는 초안과 위치를 확인한 뒤 따로 결정해요.</small></span></label>
    <div className="uwat-tools"><button type="button" disabled={working || !consent || status?.configured !== true || status?.analysisMode !== "photo_only"} onClick={() => { void sound.unlock(); fileRef.current?.click(); }}><Camera size={18}/>{photo ? "다른 사진 올리기" : "사진 올려서 분석"}</button><button type="button" disabled={working} onClick={async () => { if (await sound.unlock()) sound.notify(); }}><Bell size={18}/>{sound.ready ? "알림음 확인" : "알림음 준비"}</button><input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setPhotoFile(file); event.target.value = ""; }}/></div>
    {photo && <button type="button" className="uwat-reanalyse" disabled={working || !consent} onClick={() => void turn()}><RefreshCw size={16}/>이 사진 다시 분석</button>}
    <small className="sr-chat-disclaimer">안전한 장소에서 사진을 올려 주세요. AI 판단은 현장 확인을 대신하지 않으며 기관 공식 접수는 별도예요.</small>
  </aside>;
}
