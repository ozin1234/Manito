# K-ROAD 개발·실행

Node.js 24와 apps/web의 pnpm 잠금 파일을 사용한다. `node --run setup`은 KROAD_API_KEY와 로컬 API 연결 파일을 준비한다. GEMINI_API_KEY는 Git 제외 .env에 설정한다. `node --run dev`로 웹과 이 프로젝트의 API를 실행한다. 웹 기본 포트는 5174, API는 8790이다.

`node --run test`로 현재 사진 분석·동의·위치·저장·관리 흐름을 검사한다. `node --run check`는 저장소와 인증정보 패턴만 검사한다. `node --run build`는 일반 웹, `node --run build:cloud`는 Worker 산출물을 만든다.

운영은 Worker + D1 + 비공개 R2다. .openai/hosting.json의 프로젝트 ID와 DB/BUCKET 바인딩을 유지한다. 운영 비밀은 Sites 환경변수로 관리하며, 소스를 푸시하고 같은 커밋의 산출물을 저장·배포한다. 관리자 Origin은 서버에 등록한 KROAD_PUBLIC_ORIGIN을 신뢰 기준으로 사용한다.

지도는 현장 기록·위치 선택·GPS 확인에 사용한다. 별도 지도 서버나 차량용 경로 엔진은 실행하지 않는다. 실제 기기 권한·사진 정확도 검증은 자동 검사와 구분한다.
