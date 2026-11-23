"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import data from "@/data/public-complaints.json";
import { filterPublicComplaints, type PublicComplaintFeed } from "@/lib/public-complaints";
import { reportTopics, type ReportTopic } from "@/lib/report-topics";
import { caseStatusLabels, type PublicCaseUpdate } from "@/lib/case-types";

const feed = data as PublicComplaintFeed;
export function PublicComplaints({ topic }: { topic: ReportTopic }) {
  const [region, setRegion] = useState("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(6);
  const [updates, setUpdates] = useState<PublicCaseUpdate[]>([]);
  useEffect(() => { setLimit(6); setQuery(""); }, [topic]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetch("/api/v1/case-progress", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ updates: PublicCaseUpdate[] }>; }).then((value) => { if (active && Array.isArray(value.updates)) setUpdates(value.updates); }).catch(() => { /* Original public index remains available if management is offline. */ }); };
    refresh(); window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  const rows = filterPublicComplaints(feed.records, topic, region, query);
  const label = reportTopics.find((item) => item.id === topic)!.label;
  return <section className="kr-public" aria-labelledby="public-complaints-heading">
    <div className="kr-public-heading"><div><span className="sr-kicker">강원 공개 민원</span><h2 id="public-complaints-heading">우리 지역 {label} <span>{rows.length}</span></h2></div><span className="kr-collected">{feed.collectedAt.slice(0, 10).replaceAll("-", ".")} 수집</span></div>
    <div className="kr-public-tools"><label><span className="sr-only">지역 선택</span><select value={region} onChange={(event) => { setRegion(event.target.value); setLimit(6); }}><option value="all">수집 지역 전체</option>{feed.coverage.map((value) => <option key={value}>{value}</option>)}</select></label><label className="kr-public-search"><Search size={17}/><input aria-label="공개 민원 검색" placeholder="내용으로 찾아보기" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(6); }}/></label></div>
    {rows.length ? <div className="kr-public-grid">{rows.slice(0, limit).map((row) => { const progress = updates.find((value) => value.caseId === row.id); return <article key={row.id} className="kr-public-card"><div className="kr-public-meta"><span>{row.region}</span><time dateTime={row.postedAt}>{row.postedAt.replaceAll("-", ".")}</time></div><h3><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{row.title}<ArrowUpRight size={17}/><span className="sr-only"> · 원문 새 창</span></a></h3><div className="kr-public-source"><span>{row.sourceName}</span><small>원문 · {row.sourceStatus}</small></div>{progress && <div className="kr-public-progress"><strong>K-ROAD 관리 · {caseStatusLabels[progress.status]}</strong><p>{progress.message}</p><small>{progress.department} · {progress.updatedAt.slice(0, 10)}</small></div>}</article>; })}</div> : <p className="kr-public-empty" role="status">선택한 조건에 맞는 공개 민원이 없습니다.</p>}
    {rows.length > limit && <button type="button" className="kr-public-more" onClick={() => setLimit((value) => value + 6)}>민원 더 보기 <span>{Math.min(limit, rows.length)} / {rows.length}</span></button>}
    <p className="kr-public-note">춘천시·강릉시의회 공개 목록을 분야별로 모았습니다. 원문 처리상태는 수집 시점 기준이며 현장 위험의 지속 여부를 뜻하지 않습니다.</p>
  </section>;
}
