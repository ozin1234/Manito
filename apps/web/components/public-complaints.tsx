"use client";

import { Building2, ChevronDown, FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import data from "@/data/public-complaints.json";
import { filterPublicComplaints, type PublicComplaintFeed } from "@/lib/public-complaints";
import { reportTopics, type ReportTopic } from "@/lib/report-topics";
import { caseStatusLabels, type PublicCaseUpdate } from "@/lib/case-types";

const feed = data as PublicComplaintFeed;
export function PublicComplaints({ topic }: { topic: ReportTopic }) {
  const [region, setRegion] = useState("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(4);
  const [updates, setUpdates] = useState<PublicCaseUpdate[]>([]);
  useEffect(() => { setLimit(4); setQuery(""); }, [topic]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetch("/api/v1/case-progress", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ updates: PublicCaseUpdate[] }>; }).then((value) => { if (active && Array.isArray(value.updates)) setUpdates(value.updates); }).catch(() => { /* Original public index remains available if management is offline. */ }); };
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  const rows = filterPublicComplaints(feed.records, topic, region, query);
  const label = reportTopics.find((item) => item.id === topic)!.label;
  return <section className="kr-public" aria-labelledby="public-complaints-heading">
    <div className="kr-public-heading"><div><h2 id="public-complaints-heading">공개 민원 <span>{rows.length}</span></h2><p>우리 지역 {label}에 관한 주민들의 이야기</p></div><span className="kr-collected">수집 {feed.collectedAt.slice(5, 10).replaceAll("-", ".")}</span></div>
    <div className="kr-public-tools"><label className="kr-region-select"><span className="sr-only">지역 선택</span><select value={region} onChange={(event) => { setRegion(event.target.value); setLimit(4); }}><option value="all">지역 전체</option>{feed.coverage.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></label><label className="kr-public-search"><Search size={19}/><input aria-label="공개 민원 검색" placeholder="민원 제목이나 지역 검색" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(4); }}/></label></div>
    {rows.length ? <div className="kr-public-grid">{rows.slice(0, limit).map((row) => { const progress = updates.find((value) => value.caseId === row.id); return <article key={row.id} className="kr-public-card"><span className="kr-public-symbol"><FileText size={21}/></span><div className="kr-public-card-content"><div className="kr-public-meta"><span>{row.region}</span><time dateTime={row.postedAt}>{row.postedAt.replaceAll("-", ".")}</time></div><h3><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" title={row.title}>{row.title}<span className="sr-only"> · 원문 새 창</span></a></h3><div className="kr-public-source"><span>{row.sourceName}</span><small className={row.sourceStatus.includes("처리중") ? "is-processing" : ""}>원문 {row.sourceStatus}</small></div>{progress && <div className="kr-public-progress"><strong>K-ROAD 관리 · {caseStatusLabels[progress.status]}</strong><p>{progress.message}</p><small>{progress.department} · {progress.updatedAt.slice(0, 10)}</small></div>}</div></article>; })}</div> : <div className="kr-public-empty" role="status"><Search size={25}/><strong>조건에 맞는 민원이 없어요.</strong><p>다른 검색어나 지역으로 다시 찾아보세요.</p><button type="button" onClick={() => { setRegion("all"); setQuery(""); setLimit(4); }}>검색 조건 초기화</button></div>}
    {rows.length > limit && <button type="button" className="kr-public-more" onClick={() => setLimit((value) => value + 4)}>민원 더 보기 <span>{Math.min(limit, rows.length)} / {rows.length}</span></button>}
    <p className="kr-public-note">공개 목록의 수집 당시 상태입니다. ‘답변완료’는 현장 문제의 해결을 뜻하지 않아요.</p>
  </section>;
}

export function PublicComplaintSources() {
  return <section className="kr-source-panel" aria-label="공개 민원 출처"><div><Building2 size={18}/><h2>공개 민원 출처</h2></div><p>춘천시와 강릉시의회에 공개된 게시글을 분야별로 모았어요.</p><ul>{feed.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}<span className="sr-only"> · 새 창</span></a></li>)}</ul><small>{feed.collectedAt.slice(0, 10).replaceAll("-", ".")} 수집 · {feed.records.length}건</small></section>;
}
