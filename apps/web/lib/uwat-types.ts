import type { SafetyReport } from "@/components/report-map";
import type { ReportTopic } from "./report-topics";
import type { ReportIssueType } from "./report-issue-types";

export type UwatLocation = { lat: number; lng: number; locationSource: "gps" | "map"; locationAccuracyM: number | null; locationCapturedAt: string | null };
export type UwatQuestion = { id: string; kind: "clarify" | "confirm" | "location"; text: string; options: Array<{ id: string; label: string }> };
export type UwatReply = {
  sessionId: string; topic: ReportTopic; revision: number; phase: string; reply: string;
  analysis: { intent: string; suggestedTopic: ReportTopic | null; issueType: ReportIssueType | null; uncertainty: string; observations: string[]; category: SafetyReport["category"] | null; title: string; summary: string; description: string; reason: string; ready: boolean };
  question: UwatQuestion | null; location: UwatLocation | null; hasPhoto: boolean;
  sources: Array<{ id: string; title: string; authority: "official" | "product"; url: string | null; checkedAt: string }>;
  legalReferences: Array<{ id: string; title: string; authority: "official"; url: string; checkedAt: string; appliesWhen: string; text: string }>;
  model: string; confirmationToken: string | null;
};
