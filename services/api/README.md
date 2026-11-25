# K-ROAD 사진·관리 API

사진 분석·객관식 확인·비공개 관리자 접수·접수증 조회·기관 관리 처리를 담당한다. 로컬 Node 파일 저장과 운영 Worker D1/R2 어댑터는 같은 검증 로직을 사용한다.

- `GET /health`, `GET /v1`: 상태와 API 안내
- `GET /v1/assistant/status`, `POST /v1/assistant/chat`: 사진 분석·선택지·직접 관리자 접수
- `POST /v1/reports/tracking`: 본인의 ID·비밀 접수증으로 비공개 제보 내용과 현재 처리 상태 조회
- `PATCH /v1/reports/{id}/location`: 비밀 접수증으로 본인 제보의 현장 위치 등록·수정. 공개 범위와 처리 상태는 유지
- `GET /v1/reports`, `GET /v1/reports/{id}/photo`: 기존 공개 기록만 조회
- `GET /v1/case-progress`: 공개 자료에 대한 공개 진행 안내만 조회
- `/v1/admin/*`: 인증된 관리자 세션·사진·접수 내용·상태 관리
- `GET /v1/tiles/{z}/{x}/{y}.png`: 출처 표시와 캐시 정책을 지키는 지도
- `POST /v1/assistant/commit`: 이전 공개 저장 방식의 호환 경로. 새 직접 접수 세션에는 사용 불가

기록 직접 작성 API는 제공하지 않는다. AI 판단과 동의 검증을 거친 저장만 허용한다. 새 사진은 일반 목록·사진·공개 진행 API에서 제외한다. 새 환경변수·스키마 변경은 없다. 설정 이름은 루트 docs/ENVIRONMENT.md, 직접 접수 계약은 docs/DIRECT_ADMIN_INTAKE.md에 있다.
