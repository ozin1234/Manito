import type { SubmittedReport } from "./uwat-types";
import type { PublicCaseUpdate } from "./case-types";

export const MY_REPORTS_KEY = "kroad-my-reports-v1";
export type MyReportReceipt = Pick<SubmittedReport, "id" | "title" | "topic" | "category" | "createdAt"> & Partial<Pick<SubmittedReport, "receiptToken" | "submission" | "summary" | "description" | "issueType" | "locationStatus" | "assistant">>;
export function readMyReports(raw: string | null): MyReportReceipt[] {
  try {
    const rows: unknown = JSON.parse(raw ?? "[]"); if (!Array.isArray(rows)) return [];
    const seen = new Set<string>(), result: MyReportReceipt[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.id) || seen.has(row.id) || typeof row.title !== "string" || !row.title || row.title.length > 150 || !["danger", "near_miss", "caution"].includes(row.category) || !["living", "road", "safety"].includes(row.topic ?? "road") || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) continue;
      if (row.receiptToken !== undefined && !/^[A-Za-z0-9_-]{43}$/.test(row.receiptToken)) continue;
      const item: MyReportReceipt = { id: row.id, title: row.title, topic: row.topic ?? "road", category: row.category, createdAt: row.createdAt };
      if (row.receiptToken) item.receiptToken = row.receiptToken;
      if (typeof row.summary === "string" && row.summary.length <= 500) item.summary = row.summary;
      if (typeof row.description === "string" && row.description.length <= 2000) item.description = row.description;
      if (typeof row.issueType === "string" && row.issueType.length <= 80) item.issueType = row.issueType;
      if (["pending", "provided"].includes(row.locationStatus)) item.locationStatus = row.locationStatus;
      if (row.submission?.destination === "kroad_admin" && row.submission.method === "photo_ai" && ["photo", "multiple_choice"].includes(row.submission.confirmation) && /^KR-[A-F0-9]{8}$/.test(row.submission.reference)) item.submission = { destination: "kroad_admin", method: "photo_ai", confirmation: row.submission.confirmation, reference: row.submission.reference };
      if (row.assistant && typeof row.assistant.reason === "string") item.assistant = { reason: row.assistant.reason.slice(0, 400), answers: Array.isArray(row.assistant.answers) ? row.assistant.answers.filter((answer: { question?: unknown; answer?: unknown }) => typeof answer?.question === "string" && typeof answer.answer === "string").slice(0, 20).map((answer: { question: string; answer: string }) => ({ question: answer.question.slice(0, 300), answer: answer.answer.slice(0, 100) })) : [] };
      seen.add(row.id); result.push(item); if (result.length >= 500) break;
    }
    return result;
  } catch { return []; }
}
export function rememberMyReport(receipts: MyReportReceipt[], report: MyReportReceipt): MyReportReceipt[] {
  return readMyReports(JSON.stringify([report, ...receipts.filter((item) => item.id !== report.id)]));
}
export async function trackMyReports(receipts: MyReportReceipt[]) {
  const own = receipts.filter((item) => item.receiptToken), reports = new Map<string, MyReportReceipt>(), updates: PublicCaseUpdate[] = [], unavailable: string[] = [];
  for (let offset = 0; offset < own.length; offset += 100) {
    const chunk = own.slice(offset, offset + 100);
    const response = await fetch("/api/v1/reports/tracking", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ receipts: chunk.map(({ id, receiptToken }) => ({ id, receiptToken })) }) });
    const data = await response.json() as { reports: Array<{ report: SubmittedReport; progress: PublicCaseUpdate }>; unavailable: string[]; error?: { message?: string } };
    if (!response.ok || !Array.isArray(data.reports) || !Array.isArray(data.unavailable)) throw new Error(data.error?.message ?? "제보 현황을 확인하지 못했습니다.");
    for (const value of data.reports) {
      const receipt = chunk.find((item) => item.id === value.report?.id);
      if (!receipt || value.progress?.caseId !== receipt.id) continue;
      const normalized = rememberMyReport([], { ...value.report, receiptToken: receipt.receiptToken })[0];
      if (normalized) { reports.set(receipt.id, normalized); updates.push(value.progress); }
    }
    unavailable.push(...data.unavailable.filter((id) => chunk.some((item) => item.id === id)));
  }
  return { receipts: receipts.map((receipt) => reports.get(receipt.id) ?? receipt), updates, unavailable };
}
export function myReportProgress(update?: PublicCaseUpdate) {
  if (!update) return { label: "접수 확인 대기", resolution: "처리 안내를 기다리고 있어요", step: 0, tone: "waiting", message: "등록된 접수증의 최신 처리 안내를 기다리고 있습니다." };
  const statuses = {
    unassigned: { label: "접수 완료", resolution: "관리자 확인 대기", step: 0, tone: "waiting" },
    reviewing: { label: "검토 중", resolution: "해결 전 · 검토 중", step: 1, tone: "active" },
    assigned: { label: "담당 배정", resolution: "해결 전 · 담당 배정", step: 2, tone: "active" },
    in_progress: { label: "처리 중", resolution: "해결 전 · 처리 중", step: 2, tone: "active" },
    resolved: { label: "조치 완료 안내", resolution: "관리자 조치 완료 안내 있음", step: 3, tone: "resolved" },
    closed: { label: "관리 종료", resolution: "관리 종료 · 해결 여부 별도 확인", step: -1, tone: "closed" },
  };
  return { ...(statuses[update.status] ?? statuses.unassigned), message: update.message };
}
