"use client";

import { useRef, useState } from "react";

export function GpsAccessHint() {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href;
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      input.current?.select();
      setCopied(document.execCommand("copy"));
    }
  };
  return <div className="gr-gps-access-hint">
    <label>현재 주소<input ref={input} readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>
    <button type="button" onClick={copy}>{copied ? "복사됨" : "주소 복사"}</button>
  </div>;
}
