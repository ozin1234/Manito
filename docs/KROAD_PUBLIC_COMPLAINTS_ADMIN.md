# K-ROAD 공개 민원과 기관 관리

서비스 이름은 K-ROAD다. 저장소와 기존 `GROAD_*` 환경변수/API 경로는 호환성을 위해 유지한다. 기반 원본 프로젝트와 데이터는 수정하지 않는다.

현재 우왓은 설명 입력 없이 사진을 먼저 분석하며, 음성 기능은 제거하고 알림음을 유지한다.

## 공개 민원 수집

- 춘천시 [춘천시에 바란다](https://www.chuncheon.go.kr/mayor/civil-complaint/)
- 강릉시의회 [의회에바란다](https://www.gncl.go.kr/kr/bbs?bbs_id=request)
- 추가 조사: [강원특별자치도 민원처리공개목록](https://state.gwd.go.kr/portal/minwon/epeople/counselList), [강릉 새올전자민원](https://eminwon.gangneung.go.kr/), [원주시의회 민원 안내](https://council.wonju.go.kr/content/community/cpPetition.html). 이 세 곳의 자료는 이번 앱 데이터에 포함하지 않았다.

2026-11-23에 춘천시 40페이지, 강릉시의회 12페이지의 공개 목록을 요청했다. robots.txt를 먼저 확인하고 요청 간 최소 1초·20초 타임아웃·응답 크기 제한을 적용했다. 강릉시의회 robots.txt는 404였다. 인증·비공개 게시물·첨부파일·사진·상세 본문은 수집하지 않았다. 검색 결과의 오래된 제목 대신 실제 목록 HTML을 파싱했다.

제목·게시일·원문 처리상태·지역·출처 URL·목록 URL·수집 시각만 보존한다. 작성자·연락처·개인 주거지·직원 처우 등 이번 분야와 관련이 적은 항목을 제외했다. 제목 키워드로 분류한 뒤 관련성을 검토했으며, 이 분류를 LLM 평가 결과라고 주장하지 않는다. 현재 35건(생활불편 11, 도로 12, 안전재난 12), 수집 지역은 춘천·강릉이다. 강원도 전체 민원이나 실시간 현황을 포괄하지 않는다.

화면에는 `강원 공개 민원`으로 출처·날짜·원문 링크를 표시한다. 원문 답변완료는 현장 문제 해결을 의미하지 않는다. 좌표가 없는 글은 지도 핀이나 현재 위험지역으로 만들지 않는다. 일반 사용자 현장 기록과 외부 목록을 저장 단계부터 분리한다. 원문의 긴 본문·사진은 재배포하지 않는다. 공개 서비스 운영 범위를 넓힐 때는 각 기관의 이용조건과 데이터 제공 협약 범위를 확인한다.

```powershell
python -m pip install -r scripts/requirements-crawl.txt
python -X utf8 scripts/crawl_public_complaints.py --pages 40 --council-pages 12 --per-topic 12
```

현재 목록은 `apps/web/data/public-complaints.json`, 동일한 서버용 목록은 `services/api/src/public-complaints.json`, 전달용 표는 `docs/data/gangwon-public-complaints.csv`다. 다음 수집은 당시 공개 목록에 따라 구성과 건수가 달라진다. 수집 실패 시 기존 목록을 덮어쓰지 않는다. 새 목록 반영에는 API 재빌드와 웹 빌드가 필요하다. 자동 정기 수집은 설정하지 않았다.

## 관리자 실행

```powershell
node scripts/setup.mjs --admin
node scripts/dev.mjs --shared-maps
```

웹 `/admin`에서 로그인한다. 새 로컬 계정은 `.local/kroad-admin-access.txt`에서 확인한다. 파일을 공유 저장소에 올리지 않는다. 서버 환경변수:

| 이름 | 역할 |
| --- | --- |
| `KROAD_ADMIN_USERNAME` | 관리자 계정 ID |
| `KROAD_ADMIN_PASSWORD_HASH` | scrypt:salt:hash 형태의 비밀번호 해시 |
| `KROAD_ADMIN_SESSION_SECRET` | 서버 세션 토큰 검증 비밀값 |
| `KROAD_PUBLIC_ORIGIN` | 프록시 배포 시 시민 웹의 정확한 HTTPS origin. 로컬은 생략 가능 |
| 기존 `GROAD_API_KEY`, `GROAD_INDEPENDENT_API_URL`, `GROAD_INDEPENDENT_API_KEY` | 기존 내부 API 인증·연결 |

기관별 SSO·다중 조직 격리는 연결하지 않았다. 현재는 이 설치본의 운영자 계정 하나가 전체 자료를 관리한다. 실제 공공기관의 신원이나 협약을 인증한 계정이라고 표시하지 않는다.

## API와 연동

백엔드는 기존 내부 Bearer 키와 별도의 관리자 세션을 모두 검증한다. 시민 웹 BFF는 로그인 토큰을 HttpOnly·SameSite=Strict 쿠키로 보관하고, 외부 HTTP에서는 관리자 사용을 거부한다(localhost 제외). 변경 요청은 같은 origin과 JSON만 허용한다. 로그인은 분당 8회로 제한한다. 8시간 세션은 서버 파일로 보관하며 로그아웃으로 즉시 폐기하고 비밀번호 해시 변경 시 기존 세션을 거부한다. 운영 배포에는 HTTPS가 필요하다.

- `POST /v1/admin/login`, `GET /v1/admin/session`, `POST /v1/admin/logout`
- `GET /v1/admin/cases` (`topic`, `status`, `q` 필터)
- `GET /v1/admin/cases/{id}`, `PATCH /v1/admin/cases/{id}`
- `GET /v1/case-progress`: 명시적으로 공개한 진행 안내만 반환
- 시민 앱 프록시: `/api/admin/*`, `/api/v1/case-progress`

관리 목록에는 공개 민원과 최근 현장 기록 최대 200건이 함께 보인다. 외부 자료의 `sourceStatus`는 읽기 전용이다. K-ROAD 내부 단계는 미배정→검토→담당 배정→처리→조치 기록→관리 종료다. 허용된 재검토 경로만 사용할 수 있다. `revision`이 다르면 409로 저장을 거부하며, 사용자·시각·변경 전후·담당 부서·내부 메모를 이력으로 남긴다. 단일 API 인스턴스의 파일 저장 방식이며 다중 인스턴스 쓰기에는 트랜잭션 DB 전환이 필요하다.

관리 화면에서 ‘앱에 진행 안내 공개’를 선택한 경우에만 공개 문장을 시민 앱에 제공한다. 담당자명·내부 메모·관리자 세션은 공개하지 않는다. 앱으로 돌아와 창이 활성화되면 공개 진행 상황과 현장 기록을 다시 읽는다. `_management`, `_admin_sessions`는 Manito 전용 보고 저장 볼륨 안의 별도 디렉터리이며 Git과 시민 제보 목록에서 제외된다.

이 연결은 K-ROAD 내부 앱↔관리 화면 연결이다. 외부 행정 시스템 접수·상태 쓰기·긴급 출동은 실행하지 않는다. 협약 후 제공받는 API·기관 인증·관할 범위·개인정보 보관 정책을 확정해 외부 연계 어댑터를 추가해야 한다.

## 검증

자동 검증과 로컬 HTTP 연결 결과는 이 문서 하단에 기록한다. 실제 공공기관 로그인·기관 시스템 연동·실기기 마이크·현장 GPS를 검증한 것으로 해석하지 않는다.

### 2026-11-23 실행 결과

- 1차: 최신 origin/main `6f462e4` 확인, 별도 기능 브랜치 유지. 원본 프로젝트와 공유 지도 컨테이너는 수정하지 않았다. 공개 목록에만 출처·게시일·수집시각을 보존하고 비공개·삭제·답글·본문·첨부·작성자 정보를 제외했다. 지역 범위는 춘천·강릉이다.
- 패키징 검사에서 API 하위 `data/`가 Git/Docker 제외 규칙에 해당하는 것을 발견해, 공개 자료를 추적 가능한 `services/api/src/public-complaints.json`으로 분리했다. 실행 볼륨의 비공개 데이터 제외 규칙은 유지한다. 서버·웹 목록 일치 검사 통과.
- 2차 자동 검사: Node 테스트 37개, Python 파서 테스트 3개 통과. TypeScript 검사와 5단계 production 빌드 통과. 기존 Gemini 대화·사진·확인 토큰·음성 선택·GPS·지도 API 테스트를 포함한다. Gemini 응답은 이 자동 검사에서 모의 처리했다.
- 실제 로컬 HTTP: 시민·관리자 화면 200, 기본 분야 카드 6개 SSR 확인, CSS/JS 자산 5개 200. 실제 로컬 관리자 계정 로그인·HttpOnly/SameSite 쿠키·CSRF 403·비로그인 401·민원 35건 조회·이전 revision 수정 409·로그아웃을 확인했다. 운영 저장소의 관리 상태는 변경하지 않았다.
- 별도 포트의 API와 일회용 저장소: 로그인→검토 상태 저장→공개 안내 조회→내부 메모/담당자 비공개→원문 상태 보존→중복 revision 409→로그아웃 후 토큰 재사용 거부를 HTTP로 확인했다. 운영 시민 화면의 공개 관리 안내는 0건으로 유지했다. 별도 웹 서버 실행은 도구 정책으로 차단되어 시민 웹 인증·조회와 분리 API의 상태 변경을 나누어 검사했다.
- 검증용 API는 종료했다. 자동 승인 검토가 `.local/admin-http-verification-20261123` 폴더 삭제를 정책상 차단하여, 검증 파일은 해당 Git 제외 폴더에 남겨 두었다. 앱 실행 저장소나 원본 데이터로 복사하지 않았다.
- 외부 실제 원문: 춘천시 세 분야 각 1건과 강릉시의회 1건의 원문 HTTP 200 및 제목 일치 확인. 전체 본문 의미나 현장 위험 지속 여부를 검증한 것은 아니다.
- 클라이언트 산출물 20개에서 실제 로컬 인증정보가 노출되지 않음을 검사했다. `.env`와 관리자 접속 정보 파일의 Git 제외 확인. 기존 Gemini는 configured=true, 로컬 `gemini-3.5-flash-lite` 유지.
- 브라우저 시각 검사·실제 휴대폰·공공기관 계정·외부 업무 시스템 연계는 미검증/미연결이다. 로컬 미리보기와 기능 브랜치 업로드를 공개 배포나 협약 완료로 해석하지 않는다.
