"use client";

import { useEffect, useRef, useState } from "react";
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null;
  start: () => void; abort: () => void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition; webkitAudioContext?: typeof AudioContext };

export function useUwatVoice(onTranscript: (text: string) => Promise<void>) {
  const [enabled, setEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const enabledRef = useRef(false), busyRef = useRef(false), speakingRef = useRef(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const callbackRef = useRef(onTranscript); callbackRef.current = onTranscript;

  const unlock = () => {
    const Constructor = window.AudioContext ?? (window as VoiceWindow).webkitAudioContext;
    if (Constructor) {
      audioRef.current ??= new Constructor();
      void audioRef.current.resume().catch(() => setError("알림 소리를 켜려면 음성 시작을 다시 눌러 주세요."));
    }
  };
  const stopListening = () => { recognitionRef.current?.abort(); setListening(false); };
  const startListening = () => {
    if (!enabledRef.current || busyRef.current || speakingRef.current || !recognitionRef.current) return;
    try { recognitionRef.current.start(); setListening(true); }
    catch { /* An already running recognition must not be started twice. */ }
  };
  const resume = () => {
    if (resumeRef.current) clearTimeout(resumeRef.current);
    if (enabledRef.current && !busyRef.current && !speakingRef.current) resumeRef.current = setTimeout(startListening, 400);
  };
  const disable = () => {
    enabledRef.current = false; setEnabled(false); stopListening();
    generation.current++; speakingRef.current = false; setSpeaking(false); window.speechSynthesis?.cancel();
    if (resumeRef.current) clearTimeout(resumeRef.current);
  };
  const enable = async () => {
    unlock(); setError("");
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    if (!window.isSecureContext || !Constructor) { setError("이 브라우저에서는 음성 대화를 지원하지 않습니다. 운전 중이면 보류하고 정차 후 확인해 주세요."); return false; }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      const recognition = new Constructor();
      recognition.lang = "ko-KR"; recognition.continuous = false; recognition.interimResults = true;
      recognition.onresult = (event) => {
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          partial += result[0].transcript;
          if (result.isFinal && !busyRef.current && !speakingRef.current) {
            busyRef.current = true; setInterim(result[0].transcript); stopListening();
            void callbackRef.current(result[0].transcript).finally(() => { busyRef.current = false; resume(); });
            return;
          }
        }
        setInterim(partial);
      };
      recognition.onend = () => { setListening(false); resume(); };
      recognition.onerror = (event) => {
        setListening(false);
        if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) { disable(); setError("마이크 권한이나 음성 인식 서비스를 확인해 주세요. 운전 중에는 정차 후 이어가 주세요."); }
        else if (event.error === "network") { disable(); setError("음성 인식 연결이 끊겼습니다. 운전 중이면 대화를 보류해 주세요."); }
      };
      recognitionRef.current?.abort(); recognitionRef.current = recognition;
      enabledRef.current = true; setEnabled(true); startListening(); return true;
    } catch { disable(); setError("마이크 권한을 받지 못했습니다. 정차 후 브라우저 권한을 확인해 주세요."); return false; }
  };
  const setBusy = (value: boolean) => { busyRef.current = value; if (value) stopListening(); else resume(); };
  const notify = () => {
    const context = audioRef.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.04, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.start(); oscillator.stop(context.currentTime + 0.21);
  };
  const say = (text: string) => {
    if (!enabledRef.current || !("speechSynthesis" in window)) return;
    const current = ++generation.current;
    stopListening(); speakingRef.current = true; setSpeaking(true); window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "ko-KR"; utterance.rate = 1;
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.startsWith("ko"));
    if (voice) utterance.voice = voice;
    const complete = () => { if (generation.current === current) { speakingRef.current = false; setSpeaking(false); resume(); } };
    utterance.onend = complete; utterance.onerror = complete;
    window.speechSynthesis.speak(utterance);
  };
  useEffect(() => () => {
    enabledRef.current = false; recognitionRef.current?.abort();
    if (resumeRef.current) clearTimeout(resumeRef.current);
    window.speechSynthesis?.cancel(); void audioRef.current?.close();
  }, []);
  return { enabled, listening, speaking, interim, error, enable, disable, setBusy, unlock, notify, say };
}
