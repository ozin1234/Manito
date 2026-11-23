"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { reportTopics } from "@/lib/report-topics";
import { caseStatusLabels, caseTransitions, type CaseStatus, type ManagedCase } from "@/lib/case-types";

type Session = { authenticated: boolean; configured: boolean; user?: string };
async function api<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/${path}`, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 완료하지 못했습니다.");
  return data;
}
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function AgencyAdmin() {
  const [session, setSession] = useState<Session | null>(null), [rows, setRows] = useState<ManagedCase[]>([]);
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [query, setQuery] = useState(""), [topic, setTopic] = useState("all"), [filter, setFilter] = useState("all"), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ManagedCase | null>(null), [status, setStatus] = useState<CaseStatus>("unassigned");
  const [department, setDepartment] = useState(""), [assignee, setAssignee] = useState(""), [note, setNote] = useState(""), [publish, setPublish] = useState(false), [publicMessage, setPublicMessage] = useState("");
  const refresh = async () => { const result = await api<{ cases: ManagedCase[] }>("cases"); setRows(result.cases); return result.cases; };
  useEffect(() => { void api<Session>("session").then(async (value) => { setSession(value); if (value.authenticated) await refresh(); }).catch((cause) => setError(cause.message)); }, []);
  const select = (row: ManagedCase) => { setSelected(row); setStatus(row.management.status); setDepartment(row.management.department); setAssignee(row.management.assignee); setNote(""); setPublish(false); setPublicMessage(""); setError(""); setMessage(""); };
  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const value = await api<Session>("login", "POST", { username, password }); setPassword(""); setSession({ ...value, configured: true }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError("");
    try { await api("logout", "POST", {}); setSession({ authenticated: false, configured: true }); setRows([]); setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "로그아웃에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ case: ManagedCase }>(`cases/${selected.id}`, "PATCH", { revision: selected.management.revision, status, department, assignee, note, publish, publicMessage });
      const updated = result.case as ManagedCase; setRows((current) => current.map((row) => row.id === updated.id ? updated : row)); select(updated);
      setMessage(publish ? "처리 이력을 저장하고 앱에 진행 안내를 공개했습니다." : "내부 처리 이력을 저장했습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "변경 내용을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const filtered = rows.filter((row) => (topic === "all" || row.topic === topic) && (filter === "all" || row.management.status === filter) && (!query.trim() || `${row.title} ${row.region} ${row.management.department}`.toLowerCase().includes(query.trim().toLowerCase())));
  return <div className="kr-admin"><header className="kr-admin-header"><a href="/" className="kr-admin-brand">K-ROAD <span>기관 관리</span></a><div><a href="/"><ArrowLeft size={16}/>시민 화면</a>{session?.authenticated && <><span>{session.user}</span><button type="button" disabled={busy} onClick={() => void logout()}><LogOut size={16}/>로그아웃</button></>}</div></header>
    <main><div className="kr-admin-heading"><div><span>AGENCY WORKSPACE</span><h1>민원을 확인하고, 처리 과정을 이어갑니다.</h1><p>공개 민원과 우왓 현장 기록을 한곳에서 관리합니다.</p></div><ShieldCheck size={36}/></div>
      <p className="kr-admin-context">기관 연계 준비 · K-ROAD 내부 관리 공간입니다. 원문 기관의 처리상태는 수정하지 않으며, 안전신문고 접수·기관 업무 시스템 전송은 연결되지 않았습니다.</p>
      {error && <p className="kr-admin-error" role="alert">{error}</p>}{message && <p className="kr-admin-success" role="status">{message}</p>}
      {!session?.authenticated ? <section className="kr-admin-login"><h2>기관 관리자 로그인</h2><p>발급받은 관리자 계정으로 접속해 주세요.</p>{session && !session.configured && <p>서버 관리자 계정 설정이 필요합니다. 설치 문서의 관리자 초기 설정을 진행해 주세요.</p>}<form onSubmit={(event) => void login(event)}><label>아이디<input autoComplete="username" value={username} maxLength={80} required onChange={(event) => setUsername(event.target.value)}/></label><label>비밀번호<input type="password" autoComplete="current-password" value={password} maxLength={256} required onChange={(event) => setPassword(event.target.value)}/></label><button disabled={busy || Boolean(session && !session.configured)}>{busy ? "확인 중…" : "로그인"}</button></form></section> : <>
        <div className="kr-admin-stats">{(["unassigned", "reviewing", "in_progress", "resolved"] as CaseStatus[]).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(filter === value ? "all" : value); setPage(1); }}><span>{caseStatusLabels[value]}</span><strong>{rows.filter((row) => row.management.status === value).length}</strong></button>)}</div>
        <div className="kr-admin-toolbar"><input aria-label="민원·지역·부서 검색" placeholder="제목, 지역, 담당 부서 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/><select aria-label="관리 분야" value={topic} onChange={(event) => { setTopic(event.target.value); setPage(1); }}><option value="all">모든 분야</option>{reportTopics.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select><select aria-label="처리상태 필터" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="all">모든 처리상태</option>{Object.entries(caseStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const values = await refresh(); if (selected) { const current = values.find((row) => row.id === selected.id); if (current) select(current); } } catch (cause) { setError(cause instanceof Error ? cause.message : "새로 불러오지 못했습니다."); } finally { setBusy(false); } }}><RefreshCw size={16}/>새로고침</button></div>
        <div className="kr-admin-workspace"><section className="kr-admin-list" aria-label="민원 관리 목록"><div className="kr-admin-list-heading"><strong>민원 목록</strong><span>{filtered.length}건</span></div>{filtered.slice((page - 1) * 12, page * 12).map((row) => <button type="button" key={row.id} className={selected?.id === row.id ? "selected" : ""} disabled={busy} onClick={() => select(row)}><span className="kr-admin-row-meta">{row.region} · {reportTopics.find((item) => item.id === row.topic)?.label}<small>{caseStatusLabels[row.management.status]}</small></span><strong>{row.title}</strong><span>{row.sourceName} · {row.postedAt.slice(0, 10)}</span></button>)}{!filtered.length && <p>조건에 맞는 민원이 없습니다.</p>}<div className="kr-admin-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(filtered.length / 12))}</span><button type="button" disabled={page * 12 >= filtered.length} onClick={() => setPage((value) => value + 1)}>다음</button></div></section>
          <section className="kr-admin-detail" aria-label="선택 민원 처리">{selected ? <><div className="kr-admin-detail-top"><span>{selected.origin === "public_board" ? "공개 게시판 수집" : "우왓 현장 기록"}</span><small>버전 {selected.management.revision}</small></div><h2>{selected.title}</h2><p>{selected.sourceName} · {selected.postedAt.slice(0, 10)}</p><p className="kr-admin-origin-status">원문 상태: {selected.sourceStatus}{selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기<ArrowUpRight size={15}/></a>}</p>{selected.description && <p>{selected.description}</p>}{selected.photoUrl && <img className="kr-admin-photo" src={selected.photoUrl} alt={`${selected.title} 현장 사진`}/>}{selected.location && <p>현장 좌표: {selected.location.lat.toFixed(5)}, {selected.location.lng.toFixed(5)}</p>}
            <form onSubmit={(event) => void save(event)}><div className="kr-admin-fields"><label>내부 처리상태<select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)}>{[selected.management.status, ...caseTransitions[selected.management.status]].map((value) => <option value={value} key={value}>{caseStatusLabels[value]}</option>)}</select></label><label>담당 부서<input value={department} maxLength={80} onChange={(event) => setDepartment(event.target.value)} placeholder="담당 부서 입력"/></label><label>담당자<input value={assignee} maxLength={80} onChange={(event) => setAssignee(event.target.value)} placeholder="내부 업무용 담당자"/></label></div><label>내부 처리 메모<textarea value={note} maxLength={2000} minLength={2} required onChange={(event) => setNote(event.target.value)} placeholder="검토 내용과 변경 사유를 기록해 주세요. 앱에는 공개하지 않습니다."/></label><label className="kr-admin-publish"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)}/>앱에 진행 안내 공개</label>{publish && <label>앱에 공개할 안내<textarea value={publicMessage} minLength={10} maxLength={500} required onChange={(event) => setPublicMessage(event.target.value)} placeholder="개인정보를 제외하고 시민에게 안내할 내용을 입력해 주세요."/></label>}<button className="kr-admin-save" disabled={busy}>{busy ? "저장 중…" : "처리 이력 저장"}</button></form>
            {selected.management.publicUpdate && <div className="kr-admin-published"><strong>현재 앱에 공개된 안내</strong><p>{selected.management.publicUpdate.message}</p><small>{caseStatusLabels[selected.management.publicUpdate.status]} · {date(selected.management.publicUpdate.updatedAt)}</small></div>}
            <div className="kr-admin-history"><h3>변경 이력</h3>{selected.management.history.length ? [...selected.management.history].reverse().map((event) => <article key={event.id}><strong>{caseStatusLabels[event.from]} → {caseStatusLabels[event.to]}</strong><small>{date(event.at)} · {event.actor}</small><p>{event.note}</p><span>{event.department || "미배정"}{event.assignee ? ` · ${event.assignee}` : ""}{event.published ? " · 앱 안내 공개" : " · 내부 기록"}</span></article>) : <p>아직 등록된 처리 이력이 없습니다.</p>}</div>
          </> : <div className="kr-admin-select"><ShieldCheck size={35}/><h2>관리할 민원을 선택해 주세요.</h2><p>담당 배정부터 처리 이력과 앱 안내 공개까지 이어집니다.</p></div>}</section></div>
      </>}
    </main>
  </div>;
}
