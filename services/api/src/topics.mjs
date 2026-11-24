import { ApiError } from "./errors.mjs";

export const REPORT_TOPICS = Object.freeze({
  living: { label: "생활불편", examples: "쓰레기 방치, 악취, 생활 시설물 불편" },
  road: { label: "도로", examples: "포트홀, 보도 파손, 도로 장애물" },
  safety: { label: "안전재난", examples: "침수 우려, 낙하 위험, 안전 시설물 이상" },
});

export function validateTopic(value = "road") {
  if (typeof value !== "string" || !Object.hasOwn(REPORT_TOPICS, value))
    throw new ApiError("INVALID_TOPIC", "생활불편·도로·안전재난 중 분야를 선택해 주세요.", 400);
  return value;
}
