"use client";
import { useEffect, useRef, useState } from "react";
import { createAlertSound } from "@/lib/alert-sound";

export function useAlertSound() {
  const sound = useRef<ReturnType<typeof createAlertSound> | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  const unlock = async () => {
    try {
      sound.current ??= createAlertSound(() => {
        const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) throw new Error();
        return new Constructor();
      });
      const active = await sound.current.unlock();
      setReady(active); setError(active ? "" : "알림음을 재생하려면 알림음 확인을 눌러 주세요.");
      return active;
    } catch { setReady(false); setError("알림음을 준비하지 못했습니다. 브라우저 소리 설정을 확인해 주세요."); return false; }
  };
  const notify = () => {
    try { if (sound.current?.notify()) return; } catch { /* Keep the visible result available even if audio fails. */ }
    setReady(false); setError("결과가 준비됐습니다. 알림음은 브라우저 소리 설정을 확인해 주세요.");
  };
  useEffect(() => () => { void sound.current?.dispose().catch(() => {}); }, []);
  return { ready, error, unlock, notify };
}
