export type ReportTopic = "living" | "road" | "safety";
export const reportTopics: Array<{ id: ReportTopic; label: string; heading: string; examples: string }> = [
  { id: "living", label: "생활불편", heading: "생활 속 불편, 우왓에게 말해요.", examples: "쓰레기 방치부터 생활 시설물 불편까지 함께 확인해요." },
  { id: "road", label: "도로", heading: "도로 위 문제, 우왓에게 말해요.", examples: "포트홀·보도 파손·도로 장애물을 사진과 대화로 확인해요." },
  { id: "safety", label: "안전재난", heading: "안전이 걱정될 때, 우왓에게 말해요.", examples: "침수 우려·낙하 위험 등 주변의 위험 징후를 함께 확인해요." },
];

// Topic-less records belong to the original road service.
export function reportsForTopic<T extends { topic?: ReportTopic }>(reports: T[], topic: ReportTopic): T[] {
  return reports.filter((report) => (report.topic ?? "road") === topic);
}

export function sameConversationTopic(reply: { topic: ReportTopic } | null, topic: ReportTopic): boolean {
  return reply?.topic === topic;
}
