export function GET() {
  return Response.json({ name: "K-ROAD API", analysisMode: "photo_only", features: ["사진 분석", "유형·법령 근거", "현장 위치 확인", "공개 동의 후 저장", "관리자 처리"], officialSubmissionConnected: false });
}
