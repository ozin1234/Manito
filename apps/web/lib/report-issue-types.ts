export const reportIssueLabels = {
  trash_scattered: "흩어진 쓰레기",
  trash_pile: "쓰레기 봉투·폐기물 더미",
  streetlight_fault: "가로등 고장",
  facility_damage: "생활 시설물 파손",
  pothole: "포트홀",
  road_damage: "노면·보도 파손",
  road_obstruction: "통행 장애물",
  vehicle_incident: "차량 사고·파손 정황",
  flooding: "침수",
  ice_risk: "결빙 의심",
  rockfall: "낙석·토사",
  safety_facility: "안전 시설 이상",
  other_living: "기타 생활불편",
  other_road: "기타 도로 불편",
  other_safety: "기타 안전 우려",
  none: "확인된 불편 없음",
} as const;

export type ReportIssueType = keyof typeof reportIssueLabels;

export function reportIssueLabel(value: ReportIssueType | null | undefined): string {
  return value ? reportIssueLabels[value] ?? "유형 확인 중" : "유형 확인 중";
}
