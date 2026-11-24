import { ExternalLink, MapPin, X } from "lucide-react";
import type { MappedComplaint } from "@/lib/complaint-map";
import type { PublicCaseUpdate } from "@/lib/case-types";
import { caseStatusLabels } from "@/lib/case-types";

export function PublicComplaintDetail({ complaint, update, onClose }: { complaint: MappedComplaint; update?: PublicCaseUpdate; onClose: () => void }) {
  return <aside className="sr-detail kr-complaint-detail" aria-label="공개 민원 상세"><div className="sr-detail-head"><span className="kr-public-badge">공개 민원 · 관련 장소</span><button type="button" className="sr-icon-button" onClick={onClose} aria-label="공개 민원 닫기"><X size={20}/></button></div>
    <div className="sr-detail-body"><small>{complaint.region} · {complaint.postedAt}</small><h2>{complaint.title}</h2><p className="kr-complaint-place"><MapPin size={19}/>{complaint.location.label}</p><p className="kr-location-caveat">제목에 언급된 {complaint.location.precision === "area" ? "동네의 대표 위치" : "장소"}를 표시했어요. 실제 불편 지점이나 사고 발생 위치를 확정한 표시는 아닙니다.</p>
      <div className="kr-complaint-source-status">원문 상태 <strong>{complaint.sourceStatus}</strong><small>수집 당시 상태 · 답변완료가 현장 해결을 뜻하지는 않아요.</small></div>
      {update && <div className="kr-report-progress"><strong>K-ROAD 관리 · {caseStatusLabels[update.status]}</strong><p>{update.message}</p><small>{update.department} · {update.updatedAt.slice(0, 10)}</small></div>}
      <a className="kr-original-link" href={complaint.sourceUrl} target="_blank" rel="noopener noreferrer">민원 원문 보기<ExternalLink size={16}/></a><a className="kr-place-source" href={complaint.location.sourceUrl} target="_blank" rel="noopener noreferrer">위치 출처 · OpenStreetMap</a>
    </div>
  </aside>;
}
