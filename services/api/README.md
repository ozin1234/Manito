# K-ROAD 사진·관리 API

사진 분석·선택지·위치 확인·최신 초안 공개 동의·기록 저장·기관 관리 처리를 담당한다. 로컬 Node 파일 저장과 운영 Worker의 D1/R2 어댑터는 같은 검증 로직을 사용한다.

- GET /health, GET /v1: 상태와 현재 API 안내
- GET /v1/assistant/status, POST /v1/assistant/chat: 사진 분석과 확인 질문
- POST /v1/assistant/commit: 최신 위치·초안·토큰·공개 동의를 확인하고 저장
- GET /v1/reports, GET /v1/reports/{id}/photo: 공개 기록과 사진 조회
- GET /v1/case-progress: 명시적으로 공개한 진행 안내
- /v1/admin/*: 별도 인증이 필요한 관리자 세션·민원 처리
- GET /v1/tiles/{z}/{x}/{y}.png: 출처 표시와 캐시 정책을 지키는 기본 지도

기록 직접 작성 API는 제공하지 않는다. 사진 분석·위치 확인·동의 절차를 거친 저장만 허용한다. 설정 이름은 루트 docs/ENVIRONMENT.md에 있다. 공공기관 공식 접수는 별도다.
