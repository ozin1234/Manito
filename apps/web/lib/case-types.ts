import type { ReportTopic } from "./report-topics";

export const caseStatusLabels = { unassigned: "미배정", reviewing: "검토 중", assigned: "담당 배정", in_progress: "처리 중", resolved: "조치 기록", closed: "관리 종료" };
export type CaseStatus = keyof typeof caseStatusLabels;
export const caseTransitions: Record<CaseStatus, CaseStatus[]> = { unassigned: ["reviewing", "assigned"], reviewing: ["assigned", "in_progress", "closed"], assigned: ["reviewing", "in_progress"], in_progress: ["reviewing", "resolved"], resolved: ["in_progress", "closed"], closed: ["reviewing"] };
export type PublicCaseUpdate = { caseId: string; status: CaseStatus; department: string; message: string; updatedAt: string };
export type ManagedCase = {
  id: string; topic: ReportTopic; title: string; region: string; postedAt: string; origin: "public_board" | "community";
  sourceName: string; sourceStatus: string; sourceUrl: string | null; description?: string; photoUrl?: string | null;
  location?: { lat: number; lng: number };
  management: { revision: number; status: CaseStatus; department: string; assignee: string; updatedAt: string | null; publicUpdate: PublicCaseUpdate | null; history: Array<{ id: string; actor: string; at: string; from: CaseStatus; to: CaseStatus; department: string; assignee: string; note: string; published: boolean; publicMessage?: string }> };
};
