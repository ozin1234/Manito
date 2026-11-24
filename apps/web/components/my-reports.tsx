"use client";

import { CheckCircle2, ChevronRight, ClipboardList, Clock3, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicCaseUpdate } from "@/lib/case-types";
import type { MyReportReceipt } from "@/lib/my-reports";
import { myReportProgress } from "@/lib/my-reports";
import { reportTopics } from "@/lib/report-topics";

export function MyReports({ receipts, updates, refreshing, refreshError, onRefresh, onStart }: {
  receipts: MyReportReceipt[]; updates: PublicCaseUpdate[]; refreshing: boolean; refreshError: string; onRefresh: () => void; onStart: () => void;
}) {
  const [selected, setSelected] = useState<MyReportReceipt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); }, [selected]);
  const close = () => { dialog.current?.close(); setSelected(null); opener.current?.focus(); };
  const update = selected ? updates.find((row) => row.caseId === selected.id) : undefined;
  const progress = myReportProgress(update);
  return <section id="my-reports" className="kr-my-reports" aria-labelledby="my-reports-heading">
    <div className="kr-my-heading"><div><h2 id="my-reports-heading">내가 보낸 민원 <span>{receipts.length}</span></h2><p>이 브라우저에서 보낸 민원의 처리 소식을 모았어요.</p></div><button type="button" disabled={refreshing} onClick={onRefresh}><RefreshCw size={16}/>{refreshing ? "확인 중" : "상태 새로고침"}</button></div>
    {refreshError && <p className="kr-my-refresh-error" role="status">{refreshError}</p>}
    {receipts.length ? <div className="kr-my-list">{receipts.map((receipt) => {
      const current = myReportProgress(updates.find((row) => row.caseId === receipt.id));
      return <button key={receipt.id} type="button" className="kr-my-card" onClick={(event) => { opener.current = event.currentTarget; setSelected(receipt); }}>
        <span className={`kr-my-symbol ${current.tone}`}>{current.tone === "resolved" ? <CheckCircle2 size={22}/> : <ClipboardList size={22}/>}</span>
        <span className="kr-my-copy"><small>{reportTopics.find((row) => row.id === (receipt.topic ?? "road"))?.label} · {new Date(receipt.createdAt).toLocaleDateString("ko-KR")}</small><strong>{receipt.title}</strong><span>{current.resolution}</span></span>
        <span className={`kr-my-status ${current.tone}`}>{current.label}</span><ChevronRight size={18}/>
      </button>;
    })}</div> : <div className="kr-my-empty"><ClipboardList size={30}/><div><strong>아직 내가 보낸 민원이 없어요.</strong><p>우왓에서 사진과 위치를 확인해 보내면, 이곳에서 처리 소식을 볼 수 있어요.</p></div><button type="button" onClick={onStart}>우왓</button></div>}
    <dialog ref={dialog} className="kr-progress-dialog" aria-labelledby="my-progress-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      {selected && <div className="kr-progress-content"><div className="kr-progress-head"><span>내 민원 처리 현황</span><button type="button" aria-label="처리 현황 닫기" onClick={close}><X size={21}/></button></div>
        <h2 id="my-progress-title">{selected.title}</h2><p className="kr-progress-date">등록 {new Date(selected.createdAt).toLocaleString("ko-KR")}</p>
        <div className={`kr-progress-current ${progress.tone}`}><strong>{progress.label}</strong><span>{progress.resolution}</span></div>
        <ol className="kr-progress-steps" aria-label="처리 단계">{["등록", "검토", "담당·처리", "조치 안내"].map((label, index) => <li key={label} className={progress.step === index ? "is-current" : ""} aria-current={progress.step === index ? "step" : undefined}><span>{progress.step === index ? <Clock3 size={17}/> : <i/>}</span>{label}</li>)}</ol>
        <section className="kr-progress-message"><h3>현재 안내</h3><p>{progress.message}</p>{update && <small>{update.department || "담당 부서 미표시"} · {new Date(update.updatedAt).toLocaleString("ko-KR")}</small>}</section>
        <p className="kr-progress-official">기관 공식 접수 전 · 현재는 K-ROAD 관리자의 공개 안내입니다. 관리 종료만으로 문제가 해결됐다고 표시하지 않습니다.</p>
        <small className="kr-progress-id">등록 번호 {selected.id}</small>
      </div>}
    </dialog>
  </section>;
}
