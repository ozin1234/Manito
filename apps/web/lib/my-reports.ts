import type { SafetyReport } from "../components/report-map";
import type { PublicCaseUpdate } from "./case-types";

export const MY_REPORTS_KEY = "kroad-my-reports-v1";
export type MyReportReceipt = Pick<SafetyReport, "id" | "title" | "topic" | "category" | "createdAt">;
export function readMyReports(raw: string | null): MyReportReceipt[] {
  try {
    const rows: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(rows)) return [];
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const item = row as MyReportReceipt;
      if (typeof item.id !== "string" || !/^[0-9a-f-]{36}$/.test(item.id) || seen.has(item.id) ||
        typeof item.title !== "string" || item.title.length > 150 || !["danger", "near_miss", "caution"].includes(item.category) ||
        !["living", "road", "safety"].includes(item.topic ?? "road") || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) return false;
      seen.add(item.id); return true;
    }).slice(0, 500);
  } catch { return []; }
}
export function rememberMyReport(receipts: MyReportReceipt[], report: SafetyReport): MyReportReceipt[] {
  const receipt: MyReportReceipt = { id: report.id, title: report.title, topic: report.topic ?? "road", category: report.category, createdAt: report.createdAt };
  return [receipt, ...receipts.filter((item) => item.id !== report.id)].slice(0, 500);
}
export function myReportProgress(update?: PublicCaseUpdate) {
  if (!update) return { label: "확인 대기", resolution: "해결 여부 미확인", step: 0, tone: "waiting", message: "K-ROAD에 등록했어요. 공개된 처리 안내를 기다리고 있습니다." };
  const statuses = {
    unassigned: { label: "확인 대기", resolution: "해결 여부 미확인", step: 0, tone: "waiting" },
    reviewing: { label: "검토 중", resolution: "해결 전 · 검토 중", step: 1, tone: "active" },
    assigned: { label: "담당 배정", resolution: "해결 전 · 담당 배정", step: 2, tone: "active" },
    in_progress: { label: "처리 중", resolution: "해결 전 · 처리 중", step: 2, tone: "active" },
    resolved: { label: "조치 완료 안내", resolution: "관리자 조치 완료 안내 있음", step: 3, tone: "resolved" },
    closed: { label: "관리 종료", resolution: "관리 종료 · 해결 여부 별도 확인", step: -1, tone: "closed" },
  };
  return { ...statuses[update.status], message: update.message };
}
