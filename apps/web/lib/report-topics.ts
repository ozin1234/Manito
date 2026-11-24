export type ReportTopic = "living" | "road" | "safety";
export const reportTopics: Array<{ id: ReportTopic; label: string; heading: string; examples: string }> = [
  { id: "living", label: "생활불편", heading: "생활 속 불편을 모았어요.", examples: "공원과 생활시설, 우리 동네의 불편을 한곳에서 살펴보세요." },
  { id: "road", label: "도로", heading: "매일 지나는 길, 함께 살펴요.", examples: "도로와 보행로의 불편, 주민들이 남긴 이야기를 확인하세요." },
  { id: "safety", label: "안전재난", heading: "작은 위험 신호도 놓치지 않게.", examples: "주변의 안전 우려와 관련 민원을 함께 살펴보세요." },
];

// Topic-less records belong to the original road service.
export function reportsForTopic<T extends { topic?: ReportTopic }>(reports: T[], topic: ReportTopic): T[] {
  return reports.filter((report) => (report.topic ?? "road") === topic);
}

export function sameConversationTopic(reply: { topic: ReportTopic } | null, topic: ReportTopic): boolean {
  return reply?.topic === topic;
}
