"use client";

import { Camera, MapPinned, Mic, Pause, RefreshCw, Send, Sparkles, Volume2, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { SafetyReport } from "./live-risk-map";
import { locationErrorMessage, locationPreflight } from "@/lib/location-diagnostics";
import { prepareReportPhoto } from "@/lib/report-photo";
import { voiceChoice, type UwatLocation, type UwatReply } from "@/lib/uwat-types";
import { useUwatVoice } from "@/hooks/use-uwat-voice";
import { reportTopics, sameConversationTopic, type ReportTopic } from "@/lib/report-topics";

type Message = { role: "assistant" | "user" | "system"; text: string };
const labels = { danger: "위험지역", near_miss: "아차!지역", caution: "단순주의지역" };
export function UwatChat({ open, topic, point, onClose, onPickLocation, onSaved, onAttention, onBusyChange }: {
  open: boolean; topic: ReportTopic; point: { lat: number; lng: number } | null; onClose: () => void;
  onPickLocation: () => void; onSaved: (report: SafetyReport) => void; onAttention: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const topicInfo = reportTopics.find((item) => item.id === topic)!;
  const welcome = `우왓이에요. ${topicInfo.label}에 관해 본 상황을 말하거나, 정차 후 사진을 남겨 주세요. 근거를 찾아 확인하고 필요한 것만 여쭤볼게요.`;
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: welcome }]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<UwatLocation | null>(null);
  const [reply, setReply] = useState<UwatReply | null>(null);
  const [consent, setConsent] = useState(false);
  const [driving, setDriving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const busyRef = useRef(false), replyRef = useRef(reply); replyRef.current = reply;
  const topicRef = useRef(topic); topicRef.current = topic;
  const previousTopic = useRef(topic);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<(text: string) => Promise<void>>(async () => {});
  const voice = useUwatVoice((text) => actionRef.current(text));

  const invalidateDraft = () => {
    const current = replyRef.current;
    if (!current) return;
    const value = { ...current, phase: "needs_update", question: null, confirmationToken: null, analysis: { ...current.analysis, ready: false } };
    replyRef.current = value;
    setReply(value);
  };

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/v1/assistant/status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStatus(await response.json());
    } catch { setError("우왓 서버 상태를 확인하지 못했습니다. 연결을 확인해 주세요."); }
  };
  useEffect(() => { if (open) void refreshStatus(); }, [open]);
  useEffect(() => { onBusyChange(busy || locating); }, [busy, locating, onBusyChange]);
  useEffect(() => {
    if (previousTopic.current === topic) return;
    previousTopic.current = topic;
    replyRef.current = null; setReply(null); setPaused(false); setError("");
    setMessages([{ role: "assistant", text: welcome }]);
    if (voice.enabled) voice.say(`${topicInfo.label} 분야로 바꿨어요. 어떤 상황을 보셨나요?`);
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
  const speakResult = (value: UwatReply) => {
    if (value.question) {
      voice.notify(); onAttention("우왓이 확인을 기다리고 있어요. 음성으로 답하거나 정차 후 이어가세요.");
      const choices = value.question.options.map((option, index) => `${index + 1}번 ${option.label}`).join(". ");
      const draft = value.phase === "awaiting_confirmation" ? `${value.analysis.summary} 위치는 ${value.location?.locationSource === "gps" ? `기록한 GPS 기준, 오차 약 ${Math.round(value.location.locationAccuracyM ?? 0)}미터` : "선택한 지도 위치"}이에요. 현장 위치가 다르면 정차 후 수정해 주세요. ` : "";
      voice.say(`${value.reply} ${draft}${value.question.text} ${choices} 답하기 어렵다면 나중에라고 말씀해 주세요.`);
    } else voice.say(value.reply);
  };
  const turn = async (text: string, selection?: { questionId: string; optionId: string }, overrideLocation?: UwatLocation | null) => {
    if (busyRef.current) return;
    if (!consent) { setError("사진·대화를 Google Gemini로 보내는 AI 처리에 먼저 동의해 주세요."); return; }
    if (!status?.configured) { setError("실제 AI 대화에는 서버 GEMINI_API_KEY 설정이 필요합니다. 키를 넣은 뒤 서버를 다시 실행하고 연결 상태를 새로 확인해 주세요."); return; }
    busyRef.current = true; setBusy(true); setPaused(false); setError(""); voice.setBusy(true); voice.unlock();
    const requestTopic = topic;
    try {
      let valueLocation = overrideLocation === undefined ? location : overrideLocation;
      if (driving && !valueLocation) {
        voice.say("현장 위치를 확인할게요. 위치를 받지 못하면 저장을 보류할 수 있어요.");
        valueLocation = await locate();
      }
      const response = await fetch("/api/v1/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: requestTopic, sessionId: sameConversationTopic(replyRef.current, requestTopic) ? replyRef.current?.sessionId : undefined, message: text, selection, photoDataUrl: photo ?? "", ...(valueLocation ? { location: valueLocation } : {}), allowAiProcessing: true, drivingMode: driving }) });
      const data = await response.json() as UwatReply & { error?: { message?: string } };
      if (topicRef.current !== requestTopic) return;
      if (!response.ok) throw new Error(data.error?.message ?? "AI 답변을 받지 못했습니다.");
      const value = data as UwatReply;
      if (!sameConversationTopic(value, requestTopic)) throw new Error("선택한 분야와 AI 대화가 일치하지 않습니다. 서버 업데이트를 확인해 주세요.");
      setReply(value); replyRef.current = value; setInput("");
      setMessages((current) => [...current, { role: "user", text: text || (photo ? "첨부 사진을 확인해 주세요." : "선택한 답을 확인해 주세요.") }, { role: "assistant", text: value.reply }]);
      speakResult(value);
    } catch (cause) { if (topicRef.current !== requestTopic) return; setError(cause instanceof Error ? cause.message : "요청에 실패했습니다. 입력은 유지했어요."); voice.notify(); voice.say("연결이나 처리 오류로 판단을 완료하지 못했어요. 자동 저장하지 않았고 입력은 유지했어요. 정차 후 다시 확인해 주세요."); }
    finally { busyRef.current = false; setBusy(false); voice.setBusy(false); }
  };
  const commit = async () => {
    const value = replyRef.current;
    if (busyRef.current || !value?.confirmationToken || !sameConversationTopic(value, topicRef.current)) return;
    busyRef.current = true; setBusy(true); voice.setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/assistant/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: value.sessionId, revision: value.revision, confirmationToken: value.confirmationToken, confirmed: true }) });
      const result = await response.json() as { report?: SafetyReport; error?: { message?: string } };
      if (!response.ok || !result.report) throw new Error(result.error?.message ?? "저장을 완료하지 못했습니다.");
      onSaved(result.report); setReply(null); replyRef.current = null; setPhoto(null); setLocation(null);
      const text = "확인한 내용을 Manito 지도에 저장했어요. 공공기관에 공식 접수된 상태는 아니에요.";
      setMessages((current) => [...current, { role: "user", text: "확인한 초안과 위치를 지도에 공개 저장합니다." }, { role: "system", text }]); voice.say(text);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장에 실패했습니다."); voice.notify(); voice.say("저장 완료를 확인하지 못했어요. 초안을 유지했으니 정차 후 확인해 주세요."); }
    finally { busyRef.current = false; setBusy(false); voice.setBusy(false); }
  };
  const pause = () => { setPaused(true); voice.disable(); setMessages((current) => [...current, { role: "system", text: "아직 공개 저장하지 않았어요. 초안을 두고 정차 후 이어갈 수 있어요." }]); };
  const choose = async (id: string) => {
    const question = replyRef.current?.question;
    if (!question) return;
    if (id === "defer") { pause(); return; }
    if (question.kind === "confirm" && id === "confirm") { await commit(); return; }
    const option = question.options.find((item) => item.id === id);
    if (option) await turn(option.label, { questionId: question.id, optionId: id });
  };
  actionRef.current = async (text) => {
    if (/^(보류|나중에|나중에확인|잠깐)[.!?\s]*$/.test(text.trim())) { pause(); return; }
    const option = voiceChoice(text, replyRef.current?.question ?? null);
    if (option) await choose(option); else await turn(text);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void turn(input); };
  const setPhotoFile = async (file: File) => {
    if (driving) return;
    setError(""); invalidateDraft();
    try { setPhoto(await prepareReportPhoto(file)); await locate(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "사진을 읽지 못했습니다."); }
  };
  const startVoice = async () => {
    if (!consent || !status?.configured) { setError("AI 처리 동의와 서버 연결을 확인한 뒤 음성 대화를 시작해 주세요."); return; }
    await voice.enable();
  };
  const question = reply?.question;
  return <aside className={`sr-chat uwat-chat${driving ? " uwat-driving" : ""}`} aria-label={`우왓 AI ${topicInfo.label} 대화`} hidden={!open}>
    <header><span className="sr-chat-face">!</span><div><strong>우왓 <span className="uwat-topic">{topicInfo.label}</span></strong><small>{status?.configured ? "사진·대화와 근거를 함께 확인해요" : "AI 서버 연결 준비"}</small></div><button type="button" className="sr-icon-button" onClick={onClose} aria-label="우왓 닫기"><X size={22}/></button></header>
    <div className="uwat-mode" role="group" aria-label="이용 상태"><button type="button" aria-pressed={!driving} onClick={() => setDriving(false)}>정차·동승자</button><button type="button" aria-pressed={driving} onClick={() => setDriving(true)}>운전 중 · 음성</button></div>
    <div className="uwat-state" role="status" aria-live="polite"><span>{busy ? "사진·대화와 근거를 확인 중이에요" : locating ? "현재 GPS를 측정하고 있어요" : voice.speaking ? "우왓이 음성으로 안내하고 있어요" : voice.listening ? "듣고 있어요. 말씀해 주세요" : paused ? "초안을 보류했어요" : question ? "확인을 기다리고 있어요" : "사진이나 상황을 남겨 주세요"}</span>{busy && <span className="uwat-spinner" aria-hidden="true"/>}</div>
    <div className="sr-chat-messages uwat-messages" ref={bodyRef}>
      {!status?.configured && <div className="uwat-config"><strong>AI 연결 설정이 필요해요</strong><p>서버의 GEMINI_API_KEY를 설정하면 실제 사진 판독과 LLM 대화를 사용할 수 있어요.</p><button type="button" onClick={() => void refreshStatus()}><RefreshCw size={15}/>연결 상태 확인</button></div>}
      {messages.map((message, index) => <p key={index} className={message.role}>{message.text}</p>)}
      {photo && <div className="uwat-photo"><img src={photo} alt="AI와 확인할 현장 사진"/>{!driving && <button type="button" onClick={() => { setPhoto(null); invalidateDraft(); }}>사진 제거</button>}<small>EXIF를 제거한 사진 · 공개 저장 전</small></div>}
      {location && <div className="uwat-location"><MapPinned size={17}/><span>{location.locationSource === "gps" ? `GPS ±${Math.round(location.locationAccuracyM ?? 0)}m` : "직접 고른 지도 위치"}<small>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</small></span>{!driving && reply?.phase === "needs_update" && <button type="button" disabled={busy} onClick={() => void turn("이 위치와 입력을 반영해 초안을 다시 확인해 주세요.")}>위치·입력 반영</button>}</div>}
      {reply?.analysis.observations.length ? <div className="uwat-evidence"><strong><Sparkles size={16}/>사진·설명에서 확인한 단서</strong><ul>{reply.analysis.observations.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null}
      {reply?.analysis.ready && <div className="uwat-draft"><small>{topicInfo.label} · 공개 전 확인할 초안</small><h3>{reply.analysis.title}</h3><p>{reply.analysis.summary}</p><span>{reply.analysis.category ? labels[reply.analysis.category] : "분류 확인 중"} · AI 제안</span><p className="uwat-reason">{reply.analysis.reason}</p><small>위치가 실제 현장과 일치하는지 확인해 주세요.</small></div>}
      {question && !paused && <section className="uwat-question" aria-label="우왓 확인 질문"><strong><Volume2 size={17}/>{question.text}</strong>{driving ? <p>선택지는 음성으로 안내해요. 번호로 답하거나 “나중에”라고 말해 주세요.</p> : <div>{question.options.map((option, index) => <button type="button" key={option.id} disabled={busy} onClick={() => void choose(option.id)}>{index + 1}. {option.label}</button>)}</div>}{question.kind === "location" && !driving && <div><button type="button" disabled={busy || locating} onClick={async () => { const point = await locate(); if (point) await turn("현재 GPS 위치를 현장 위치 후보로 확인해 주세요.", undefined, point); }}>현재 GPS 확인</button><button type="button" onClick={onPickLocation}>지도에서 위치 고르기</button></div>}<button type="button" className="uwat-pause" onClick={pause}><Pause size={15}/>정차 후 이어가기</button></section>}
      {reply?.sources.length ? <details className="uwat-sources"><summary>판단에 참고한 근거 {reply.sources.length}개</summary>{reply.sources.map((source) => <div key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title}</span>}<small>{source.authority === "official" ? "공식 안내" : "Manito 내부 기준"} · {source.checkedAt} 확인</small></div>)}</details> : null}
      {(error || voice.error) && <div className="uwat-error" role="alert">{error || voice.error}</div>}
      {voice.interim && <div className="uwat-transcript">들은 말: {voice.interim}</div>}
      {driving && <div className="uwat-driving-note">운전 중에는 촬영·타이핑·화면 선택을 요구하지 않아요. 음성을 사용할 수 없으면 정차 후 이어가 주세요.</div>}
    </div>
    <label className="uwat-consent"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); if (!event.target.checked) voice.disable(); }}/><span>사진·대화를 Google Gemini에 보내 분석하는 데 동의해요<small>얼굴·번호판은 피하거나 가려 주세요. 운전 중 음성 요청은 현장 GPS도 측정해요. 지도 공개는 마지막에 따로 확인해요.</small></span></label>
    <div className="uwat-tools"><button type="button" className={voice.enabled ? "active" : ""} onClick={() => voice.enabled ? voice.disable() : void startVoice()} disabled={busy && !voice.enabled}><Mic size={18}/>{voice.enabled ? "음성 대화 끄기" : "음성 대화 시작"}</button>{!driving && <><button type="button" disabled={busy} onClick={() => { voice.unlock(); fileRef.current?.click(); }}><Camera size={18}/>사진</button><button type="button" disabled={busy || locating} onClick={() => void locate()}><MapPinned size={18}/>위치</button></>}<input ref={fileRef} type="file" hidden accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void setPhotoFile(file); event.target.value = ""; }}/></div>
    {!driving && <form onSubmit={submit}><input aria-label="우왓에게 상황 설명" placeholder="어떤 상황을 보셨나요?" value={input} maxLength={2000} disabled={busy} onChange={(event) => { setInput(event.target.value); invalidateDraft(); }}/><button type="submit" disabled={busy || (!input.trim() && !photo)} aria-label="사진과 대화 분석 요청"><Send size={20}/></button></form>}
    <small className="sr-chat-disclaimer">AI 판단은 현장 확인을 대신하지 않아요. 음성 인식·읽기는 브라우저 지원이 필요해요. 기관 공식 접수는 별도예요.</small>
  </aside>;
}
