import type { ReportTopic } from "./report-topics";
export type PublicComplaint = { id: string; topic: ReportTopic; title: string; region: string; postedAt: string; sourceStatus: string; sourceName: string; sourceUrl: string; collectedAt: string };
export type PublicComplaintFeed = { collectedAt: string; coverage: string[]; sources: Array<{ name: string; url: string }>; records: PublicComplaint[] };
export function filterPublicComplaints(records: PublicComplaint[], topic: ReportTopic, region = "all", query = "") {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  return records.filter((row) => row.topic === topic && (region === "all" || row.region === region) && (!q || `${row.title} ${row.region}`.toLocaleLowerCase("ko-KR").includes(q)));
}
