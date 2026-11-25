"use client";

import { Bell, Camera, CheckCircle2, CircleHelp, MapPinned, Pause, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UwatIcon } from "./uwat-icon";
import { prepareReportPhoto } from "@/lib/report-photo";
import type { SubmittedReport, UwatReply, UwatLocation } from "@/lib/uwat-types";
import { useAlertSound } from "@/hooks/use-alert-sound";
import { reportTopics, sameConversationTopic, type ReportTopic } from "@/lib/report-topics";
import { reportIssueLabel } from "@/lib/report-issue-types";

type Message = { role: "assistant" | "user" | "system"; text: string };
type Turn = { photo?: string; fresh?: boolean; selection?: { questionId: string; optionId: string } };
export function UwatChat({ open, topic, point, onClose, onPickLocation, onUseCurrentLocation, onClearLocation, locationBusy = false, onSaved, onAttention, onBusyChange }: {
  open: boolean; topic: ReportTopic; point: UwatLocation | null; onClose: () => void;
  onPickLocation: () => void; onUseCurrentLocation?: () => void; onClearLocation?: () => void; locationBusy?: boolean; onSaved: (report: SubmittedReport) => void; onAttention: (text: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const [messages, setMessages] = useState<Message[]>([]), [photo, setPhoto] = useState<string | null>(null);
  const [reply, setReply] = useState<UwatReply | null>(null), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [paused, setPaused] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; analysisMode: string } | null>(null);
  const busyRef = useRef(false), replyRef = useRef(reply), topicRef = useRef(topic), consentRef = useRef(consent), requestId = useRef<string | null>(null), requestToken = useRef<string | null>(null);
  replyRef.current = reply; topicRef.current = topic; consentRef.current = consent;
  const previousTopic = useRef(topic), bodyRef = useRef<HTMLDivElement>(null), fileRef = useRef<HTMLInputElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const sound = useAlertSound();
  const refreshStatus = async () => {
    try { const response = await fetch("/api/v1/assistant/status", { cache: "no-store" }); if (!response.ok) throw new Error(); setStatus(await response.json() as { configured: boolean; analysisMode: string }); setError(""); }
    catch { setError("사진 분석 서버에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요."); }
  };
  useEffect(() => { if (open) void refreshStatus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement; closeRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [open]);
  useEffect(() => { onBusyChange(busy || preparing); }, [busy, preparing, onBusyChange]);
  useEffect(() => { if (previousTopic.current !== topic) { previousTopic.current = topic; replyRef.current = null; setReply(null); setPhoto(null); requestId.current = null; requestToken.current = null; setPaused(false); setError(""); setMessages([]); } }, [topic]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, reply, error]);
  const turn = async (options: Turn = {}) => {
    if (busyRef.current) return;
    if (!consentRef.current) { setError("사진의 AI 분석과 관리자 접수함 제보에 먼저 동의해 주세요."); return; }
    if (!status?.configured || status.analysisMode !== "photo_only") { setError("사진 분석 서버 연결을 확인해 주세요."); return; }
    const image = options.photo ?? photo;
    if (!image) { setError("현장 사진을 먼저 올려 주세요."); return; }
    if (point?.locationSource === "gps" && (!point.locationCapturedAt || Math.abs(Date.now() - Date.parse(point.locationCapturedAt)) > 300_000)) { setError("GPS 위치가 오래됐어요. 현장 위치를 다시 확인하거나 지도에서 골라 주세요."); return; }
    const requestTopic = topic, session = replyRef.current;
    requestId.current ??= crypto.randomUUID();
    requestToken.current ??= btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    busyRef.current = true; setBusy(true); setPaused(false); setError(""); void sound.unlock();
    try {
      const response = await fetch("/api/v1/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: requestTopic, requestId: requestId.current, requestToken: requestToken.current, sessionId: !options.fresh && sameConversationTopic(session, requestTopic) ? session?.sessionId : undefined, selection: options.selection, photoDataUrl: image, location: point, allowAiProcessing: true, submitToAdmin: true, allowAdminSubmission: true }) });
      const value = await response.json() as UwatReply & { error?: { message?: string } };
      if (!response.ok) throw new Error(value.error?.message ?? "접수 결과를 확인하지 못했습니다. 같은 사진으로 다시 확인해 주세요.");
      if (!sameConversationTopic(value, requestTopic) || (!value.hasPhoto && !value.report)) throw new Error("사진 판단 응답을 확인하지 못했습니다.");
      setReply(value); replyRef.current = value;
      const selection = session?.question?.options.find((item) => item.id === options.selection?.optionId)?.label;
      setMessages((current) => [...current, { role: "user", text: selection ?? (options.fresh ? "사진으로 제보합니다." : "접수 결과를 다시 확인해 주세요.") }, { role: "assistant", text: value.reply }]);
      sound.notify();
      if (value.phase === "submitted" && value.report?.receiptToken && value.report.submission?.destination === "kroad_admin") { onSaved(value.report); setPhoto(null); requestId.current = null; requestToken.current = null; }
      else onAttention(value.question ? "확인할 내용이 있어요. 답변을 골라 주세요." : "사진 판단이 끝났어요. 결과를 확인해 주세요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "접수 결과를 확인하지 못했습니다. 사진은 유지했어요."); sound.notify(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const choose = async (id: string) => { const question = replyRef.current?.question; if (question?.kind === "clarify") await turn({ selection: { questionId: question.id, optionId: id } }); };
  const setPhotoFile = async (file: File) => {
    if (busyRef.current) return;
    busyRef.current = true; setPreparing(true); setError(""); let prepared: string | null = null;
    try { prepared = await prepareReportPhoto(file); } catch (cause) { setError(cause instanceof Error ? cause.message : "사진을 읽지 못했습니다."); }
    finally { busyRef.current = false; setPreparing(false); }
    if (!prepared) return;
    requestId.current = crypto.randomUUID(); requestToken.current = null; setPhoto(prepared); setReply(null); replyRef.current = null; setMessages([]); setPaused(false);
    await turn({ photo: prepared, fresh: true });
  };
  const question = reply?.question, working = busy || preparing || locationBusy;
  return <aside className="sr-chat uwat-chat uwat-photo-chat" role="dialog" aria-label={`우왓 AI ${topicInfo.label} 사진 제보`} hidden={!open} onKeyDown={(event) => { if (event.key === "Escape" && !working) onClose(); }}>
    <header><span className="sr-chat-face"><UwatIcon size={39}/></span><div><strong>우왓 <span className="uwat-topic">{topicInfo.label}</span></strong><small>사진 한 장에서 관리자 접수까지</small></div><button ref={closeRef} type="button" disabled={working} className="sr-icon-button" onClick={onClose} aria-label="우왓 닫기"><X size={21}/></button></header>
    <div className="uwat-state" role="status" aria-live="polite"><span>{preparing ? "사진을 준비하고 있어요" : busy ? "사진을 판단하고 관리자 접수를 준비하고 있어요" : paused ? "답변을 기다리고 있어요" : reply?.phase === "submitted" ? "관리자 접수함에 접수됐어요" : question ? "답변을 고르면 제보를 이어갑니다" : "사진을 올리면 AI 판단 후 바로 접수해요"}</span>{working ? <span className="uwat-spinner" aria-hidden="true"/> : <span className="uwat-state-dot" aria-hidden="true"/>}</div>
    <div className="sr-chat-messages uwat-messages" ref={bodyRef}>
      {status && !status.configured && <div className="uwat-config"><strong>사진 분석 연결을 확인해 주세요</strong><button type="button" onClick={() => void refreshStatus()}><RefreshCw size={15}/>연결 다시 확인</button></div>}
      {!messages.length && !photo && <div className="uwat-welcome"><span className="uwat-welcome-symbol"><UwatIcon size={64}/></span><h2>사진으로 바로 제보해요</h2><p>AI가 사진에서 보이는 상황을 정리해<br/>관리자 접수함으로 보내드려요.</p><ol><li><span>1</span>사진 올리기</li><li><span>2</span>필요한 것만 선택</li><li><span>3</span>관리자 접수</li></ol><small><Bell size={15}/>확인이 필요하면 알림음으로 알려요.</small></div>}
      {messages.map((message, index) => <p key={index} className={message.role}>{message.text}</p>)}
      {photo && <div className="uwat-photo"><img src={photo} alt="관리자 접수함에 제보할 현장 사진"/><small>사진의 위치 메타데이터를 제거했어요 · 일반 지도에 자동 공개하지 않아요</small></div>}
      {point && <div className="uwat-location"><MapPinned size={17}/><span>{point.locationSource === "gps" ? `현장에서 선택한 GPS 위치 · ±${Math.round(point.locationAccuracyM ?? 0)}m` : "직접 고른 현장 위치"}<small>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</small></span></div>}
      {reply?.analysis.observations.length ? <div className="uwat-evidence"><strong><Sparkles size={16}/>사진에서 확인한 단서</strong><ul>{reply.analysis.observations.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
      {reply?.phase === "submitted" && reply.report && <div className="uwat-submitted"><CheckCircle2 size={24}/><strong>관리자 접수함에 접수 완료</strong><span>{reply.report.submission?.reference}</span><p>{reportTopics.find((item) => item.id === reply.analysis.suggestedTopic)?.label} · {reportIssueLabel(reply.analysis.issueType)}</p><p>{reply.report.summary}</p></div>}
      {question?.kind === "clarify" && !paused && <section className="uwat-question" aria-label="우왓 확인 질문"><strong><CircleHelp size={17}/>{question.text}</strong><p>알맞은 답을 고르면 판단을 마무리해 관리자에게 접수해요.</p><div>{question.options.map((option) => <button type="button" key={option.id} disabled={working || !consent} onClick={() => void choose(option.id)}>{option.label}</button>)}</div><button type="button" className="uwat-pause" disabled={working} onClick={() => setPaused(true)}><Pause size={15}/>나중에 답하기</button></section>}
      {reply?.analysis.intent === "no_issue" && <p className="uwat-photo-help">사진에서 제보할 문제가 확인되지 않아 접수하지 않았어요. 다른 사진으로 다시 제보할 수 있어요.</p>}
      {reply?.sources.length ? <details className="uwat-sources"><summary>판단에 참고한 근거 {reply.sources.length}개</summary>{reply.sources.map((source) => <div key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title}</span>}<small>{source.authority === "official" ? "공식 안내" : "K-ROAD 내부 기준"} · {source.checkedAt} 확인</small></div>)}</details> : null}
      {reply?.legalReferences?.length ? <details className="uwat-sources"><summary>관련 법령 참고 {reply.legalReferences.length}개</summary>{reply.legalReferences.map((source) => <div key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>적용 조건: {source.appliesWhen}</small></div>)}</details> : null}
      {error && <div className="uwat-error" role="alert">{error}</div>}{sound.error && <p className="uwat-sound-note" role="status">{sound.error}</p>}
    </div>
    <section className="uwat-location-choice" aria-label="제보 현장 위치"><strong>현장 위치 <small>선택</small></strong><p>현장에 있을 때만 현재 위치를 사용해 주세요. 다른 곳에서 찍은 사진은 지도에서 골라 주세요.</p><div><button type="button" disabled={working || !onUseCurrentLocation} onClick={onUseCurrentLocation}>{locationBusy ? "위치 확인 중…" : "현장의 현재 위치 사용"}</button><button type="button" disabled={working} onClick={onPickLocation}>지도에서 현장 선택</button>{point && onClearLocation && <button type="button" disabled={working} onClick={onClearLocation}>위치 선택 해제</button>}</div>{point && <small>{point.locationSource === "gps" ? `GPS 오차 ±${Math.round(point.locationAccuracyM ?? 0)}m` : "지도에서 선택한 위치"} · 제보 후 내 지도에 표시돼요.</small>}</section>
    <label className="uwat-consent"><input type="checkbox" disabled={working} checked={consent} onChange={(event) => { consentRef.current = event.target.checked; setConsent(event.target.checked); }}/><span>사진의 AI 분석과 관리자 접수에 동의해요<small>Google Gemini로 분석한 사진·내용을 K-ROAD 관리자가 확인합니다. 얼굴·번호판은 가려 주세요.</small></span></label>
    <div className="uwat-tools"><button type="button" disabled={working || !consent || !status?.configured} onClick={() => { void sound.unlock(); fileRef.current?.click(); }}><Camera size={18}/>{photo ? "다른 사진으로 제보" : "사진 올려 바로 제보"}</button><button type="button" disabled={working} onClick={async () => { if (await sound.unlock()) sound.notify(); }}><Bell size={18}/>{sound.ready ? "알림음 확인" : "알림음 준비"}</button><input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setPhotoFile(file); event.target.value = ""; }}/></div>
    {photo && <button type="button" className="uwat-reanalyse" disabled={working || !consent} onClick={() => void turn()}><RefreshCw size={16}/>{paused ? "선택지 다시 확인" : "같은 요청 다시 확인"}</button>}
    <small className="sr-chat-disclaimer">위치를 모르면 ‘위치 확인 필요’로 접수해요. 안전한 장소에서 제보해 주세요. AI 판단은 현장 확인을 대신하지 않아요.</small>
  </aside>;
}
