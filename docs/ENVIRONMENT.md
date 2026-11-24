# K-ROAD 환경변수

- KROAD_API_KEY: 서버 내부 API 인증값. 외부 화면·번들·로그에 공개하지 않는다.
- KROAD_API_URL: 로컬 웹이 연결할 API 주소. 운영 Worker는 같은 서버 안에서 API를 처리한다.
- KROAD_REPORTS_DIR: 로컬 파일 저장 경로. 운영은 D1/R2를 사용한다.
- GEMINI_API_KEY: 사진 분석용 서버 비밀.
- UWAT_MODEL: 기본 gemini-3.5-flash-lite.
- UWAT_KNOWLEDGE_PATH: 로컬 검토용 일반 자료 경로. 기본 자료는 소스에 포함된다.
- LAW_API_OC: 공식 조문 재동기화 때 사용하는 서버 설정.
- KROAD_ADMIN_USERNAME, KROAD_ADMIN_PASSWORD_HASH, KROAD_ADMIN_SESSION_SECRET: 기관 관리자 인증.
- KROAD_PUBLIC_ORIGIN: 운영 HTTPS 주소. 현재 https://k-road-manito.hydroai4.chatgpt.site.
- MANITO_WEB_PORT, MANITO_API_PORT: 로컬 포트 설정.

.env.example에는 빈 값만 둔다. 실제 값은 Git 제외 로컬 .env 또는 Sites 서버 환경변수에만 저장한다. 데이터베이스의 DB/R2 바인딩은 환경변수 값으로 대신하지 않는다.
