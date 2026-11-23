import type { SafetyReport } from "@/components/live-risk-map";
import type { ReportTopic } from "./report-topics";

export type UwatLocation = { lat: number; lng: number; locationSource: "gps" | "map"; locationAccuracyM: number | null; locationCapturedAt: string | null };
export type UwatQuestion = { id: string; kind: "clarify" | "confirm" | "location"; text: string; options: Array<{ id: string; label: string }> };
export type UwatReply = {
  sessionId: string; topic: ReportTopic; revision: number; phase: string; reply: string;
  analysis: { intent: string; uncertainty: string; observations: string[]; category: SafetyReport["category"] | null; title: string; summary: string; description: string; reason: string; ready: boolean };
  question: UwatQuestion | null; location: UwatLocation | null; hasPhoto: boolean;
  sources: Array<{ id: string; title: string; authority: "official" | "product"; url: string | null; checkedAt: string }>;
  model: string; confirmationToken: string | null;
};

export function voiceChoice(text: string, question: UwatQuestion | null): string | null {
  if (!question) return null;
  const value = text.replace(/[\s.,!?。]/g, "");
  if (question.kind === "confirm") {
    if (/^(응|네|예|좋아|좋아요|저장해|저장해줘|지도에저장|지도에저장해줘|동의해|저장해주세요|응저장해줘|네저장해주세요|좋아요저장해주세요)$/.test(value)) return "confirm";
    if (/^(아니|아니요|보류|나중에|나중에확인|잠깐)$/.test(value)) return "defer";
  }
  const suffix = "(?:번|번째)?(?:이요|요|으로|로|으로해줘|로해줘)?";
  const index = new RegExp(`^(1|일|한|첫|첫번째)${suffix}$`).test(value) ? 0 : new RegExp(`^(2|이|두|두번째)${suffix}$`).test(value) ? 1 : new RegExp(`^(3|삼|세|세번째)${suffix}$`).test(value) ? 2 : -1;
  if (index >= 0) return question.options[index]?.id ?? null;
  return question.options.find((option) => option.label.replace(/\s/g, "") === value)?.id ?? null;
}
