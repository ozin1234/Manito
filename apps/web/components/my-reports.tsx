"use client";

import { CheckCircle2, ChevronRight, ClipboardList, Clock3, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicCaseUpdate } from "@/lib/case-types";
import type { MyReportReceipt } from "@/lib/my-reports";
import { myReportProgress } from "@/lib/my-reports";
import { reportIssueLabel } from "@/lib/report-issue-types";
import { reportTopics } from "@/lib/report-topics";

export function MyReports({ receipts, updates, refreshing, refreshError, unavailable = [], onRefresh, onStart }: {
  receipts: MyReportReceipt[]; updates: PublicCaseUpdate[]; refreshing: boolean; refreshError: string; unavailable?: string[]; onRefresh: () => void; onStart: () => void;
}) {
  const [selected, setSelected] = useState<MyReportReceipt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); }, [selected]);
  const close = () => { dialog.current?.close(); setSelected(null); opener.current?.focus(); };
  const update = selected ? updates.find((row) => row.caseId === selected.id) : undefined;
  const progress = selected && unavailable.includes(selected.id) ? { label: "조회 확인 필요", resolution: "접수증으로 최신 현황을 확인할 수 없어요", step: -1, tone: "waiting", message: "기존 접수증은 보관 중입니다. 상태 새로고침을 다시 시도하거나 접수 번호로 관리자에게 확인해 주세요." } : myReportProgress(update);
  return <section id="my-reports" className="kr-my-reports" aria-labelledby="my-reports-heading">
    <div className="kr-my-heading"><div><h2 id="my-reports-heading">내가 보낸 제보 <span>{receipts.length}</span></h2><p>이 브라우저에서 보낸 사진 제보와 처리 소식을 모았어요.</p></div><button type="button" disabled={refreshing} onClick={onRefresh}><RefreshCw size={16}/>{refreshing ? "확인 중" : "상태 새로고침"}</button></div>
    {refreshError && <p className="kr-my-refresh-error" role="status">{refreshError}</p>}
    {receipts.length ? <div className="kr-my-list">{receipts.map((receipt) => {
      const current = unavailable.includes(receipt.id) ? { label: "조회 확인 필요", resolution: "접수증 확인이 필요해요", tone: "waiting" } : myReportProgress(updates.find((row) => row.caseId === receipt.id));
      return <button key={receipt.id} type="button" className="kr-my-card" onClick={(event) => { opener.current = event.currentTarget; setSelected(receipt); }}>
        <span className={`kr-my-symbol ${current.tone}`}>{current.tone === "resolved" ? <CheckCircle2 size={22}/> : <ClipboardList size={22}/>}</span>
        <span className="kr-my-copy"><small>{reportTopics.find((row) => row.id === (receipt.topic ?? "road"))?.label} · {new Date(receipt.createdAt).toLocaleDateString("ko-KR")}</small><strong>{receipt.title}</strong>{receipt.summary && <span className="kr-my-summary">{receipt.summary}</span>}<span>{receipt.submission ? `${reportIssueLabel(receipt.issueType ?? null)} · ${receipt.submission.confirmation === "multiple_choice" ? "객관식 확인 후 접수" : "사진 AI 자동 접수"}` : "이전 공개 기록"}</span><span>{current.resolution}</span></span>
        <span className={`kr-my-status ${current.tone}`}>{current.label}</span><ChevronRight size={18}/>
      </button>;
    })}</div> : <div className="kr-my-empty"><ClipboardList size={30}/><div><strong>아직 보낸 제보가 없어요.</strong><p>사진을 올리면 AI가 내용을 정리해 관리자에게 접수하고, 이곳에 접수 내역이 표시돼요.</p></div><button type="button" onClick={onStart}>우왓</button></div>}
    <dialog ref={dialog} className="kr-progress-dialog" aria-labelledby="my-progress-title" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      {selected && <div className="kr-progress-content"><div className="kr-progress-head"><span>내 제보 접수·처리 현황</span><button type="button" aria-label="처리 현황 닫기" onClick={close}><X size={21}/></button></div>
        <h2 id="my-progress-title">{selected.title}</h2><p className="kr-progress-date">등록 {new Date(selected.createdAt).toLocaleString("ko-KR")}</p>
        <div className={`kr-progress-current ${progress.tone}`}><strong>{progress.label}</strong><span>{progress.resolution}</span></div>
        <ol className="kr-progress-steps" aria-label="처리 단계">{["접수", "검토", "담당·처리", "조치 안내"].map((label, index) => <li key={label} className={progress.step === index ? "is-current" : ""} aria-current={progress.step === index ? "step" : undefined}><span>{progress.step === index ? <Clock3 size={17}/> : <i/>}</span>{label}</li>)}</ol>
        <section className="kr-intake-content"><h3>접수된 제보 내용</h3><dl><dt>접수처</dt><dd>{selected.submission ? "K-ROAD 관리자 접수함" : "이전 공개 기록"}</dd><dt>접수 번호</dt><dd>{selected.submission?.reference ?? selected.id}</dd><dt>분야·유형</dt><dd>{reportTopics.find((row) => row.id === (selected.topic ?? "road"))?.label} · {reportIssueLabel(selected.issueType ?? null)}</dd><dt>접수 방식</dt><dd>{selected.submission?.confirmation === "multiple_choice" ? "사진 AI 판단 + 객관식 답변" : selected.submission ? "사진 AI 자동 판단" : "이전 버전 기록"}</dd><dt>현장 위치</dt><dd>{selected.locationStatus === "provided" ? "사용자가 지정한 위치 포함" : "위치 확인 필요"}</dd></dl>{selected.description && <p className="kr-intake-description">{selected.description}</p>}{selected.assistant?.reason && <details><summary>AI가 이렇게 판단한 이유</summary><p>{selected.assistant.reason}</p></details>}{selected.assistant?.answers?.length ? <details><summary>내가 선택한 답변</summary>{selected.assistant.answers.map((answer, index) => <p key={index}><strong>{answer.question}</strong><br/>{answer.answer}</p>)}</details> : null}</section>
        <section className="kr-progress-message"><h3>현재 안내</h3><p>{progress.message}</p>{update && <small>{update.department || "담당 부서 미표시"} · {new Date(update.updatedAt).toLocaleString("ko-KR")}</small>}</section>
        <p className="kr-progress-official">사진과 AI 작성 내용이 K-ROAD 관리자 접수함에 전달됩니다. 담당자가 검토·배정·조치 결과를 관리하며, 관리 종료만으로 해결 완료를 뜻하지는 않아요.</p>
        <small className="kr-progress-id">이 브라우저의 접수증으로 조회합니다. 브라우저 데이터를 지우거나 다른 기기로 바꾸면 목록을 이어볼 수 없어요.</small>
      </div>}
    </dialog>
  </section>;
}
