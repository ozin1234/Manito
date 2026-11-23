# K-ROAD

생활불편·도로·안전재난을 우왓이 설명 입력 없이 현장 사진으로 판단하고, 동의한 현장 기록을 지도에 저장하는 서비스입니다. 춘천시·강릉시의회 공개 민원 목록과 기관용 관리 화면을 연결했습니다. GitHub 저장소 이름은 협업 링크를 보존하기 위해 `Manito`를 유지합니다. 기반 프로젝트의 원본 소스와 DB는 변경하지 않습니다.

공개 민원은 실제 게시판의 제목·게시일·원문 상태·링크를 수집한 목록입니다. 정확한 좌표를 임의로 만들지 않습니다. 기관 관리(`/admin`)는 별도 로그인, 담당 부서 배정, 처리 이력, 버전 충돌 방지, 시민 앱에 공개할 안내를 지원합니다. 현재는 K-ROAD 내부 관리이며 외부 기관 업무 시스템·안전신문고 전송은 연결되지 않았습니다. [수집·관리 화면 실행 및 검증 안내](docs/KROAD_PUBLIC_COMPLAINTS_ADMIN.md)를 참고하세요.

## 구조

| 경로 | 내용 |
| --- | --- |
| `apps/web` | React 19·TypeScript·Vinext/Vite·Leaflet 웹/PWA |
| `services/api` | Node.js 24 지도·제보 API, JSON·사진 파일 저장 |
| `research/evidence` | 최종 완전격자 검정과 대용량 누락 목록 |
| `.local/groad-research` | 인계 ZIP의 검증된 파일, 로컬에서만 보관 |
| `scripts` | 설정 생성·실행·소스 인계·저장소 검증 |

우왓은 Gemini 멀티모달 LLM과 로컬 BM25 근거 검색(RAG)을 사용합니다. 사진만으로 구분하기 어려우면 짧은 확인 질문을 만들고, 최신 초안·위치에 사용자가 동의한 뒤 저장합니다. 키가 없거나 AI가 실패하면 설정·오류 상태를 표시하며 규칙 답변으로 AI 동작을 가장하지 않습니다. 저장된 내용은 기관에 자동 접수되지 않습니다.

## 설치와 실행

Node.js 24, Python 3.10 이상, pnpm 11.25.0을 사용합니다. 웹 의존성은 기존 잠금 파일을 유지합니다.

```powershell
pnpm --dir apps/web install --frozen-lockfile
node scripts/setup.mjs
# 루트 .env에 GEMINI_API_KEY 입력 후 실행
node scripts/dev.mjs
```

기관 관리자 계정은 `node scripts/setup.mjs --admin`으로 생성합니다. 새 계정의 접속 정보는 Git에서 제외되는 `.local/kroad-admin-access.txt`에 저장합니다. 비밀번호는 서버 환경변수에 scrypt 해시로만 저장하며 기존 Gemini·지도 설정은 유지합니다.

기본 주소는 웹 `http://127.0.0.1:5174/`, API `http://127.0.0.1:8790/health`입니다. 기본 실행은 제보 API를 독립적으로 띄웁니다. 지도·주소 검색에는 별도 OSM 타일·Nominatim·OSRM 서비스가 필요합니다.

현재 PC에서 기존 지도 컨테이너를 조회용으로 공유하려면:

```powershell
node scripts/setup.mjs --maps-network groad_independent_default
node scripts/dev.mjs --shared-maps
```

이 모드는 Docker Desktop과 해당 네트워크의 지도 서비스가 필요합니다. Manito API와 제보 볼륨은 `manito-dev` 프로젝트로 새로 생성합니다. 기존 프로젝트의 제보 API와 DB는 사용하지 않습니다. 종료할 때 Manito API만 중지하고 제보 볼륨을 유지합니다.

## Gemini 설정

[Google AI Studio](https://aistudio.google.com/api-keys)에서 키를 만들고 루트 `.env`의 `GEMINI_API_KEY=` 뒤에 입력합니다. `UWAT_MODEL` 기본값은 `gemini-3.8-flash`이며 서버를 재시작해야 적용됩니다. 키를 채팅·Git·웹 코드에 넣지 않습니다. 사진만으로 먼저 판단하며 설명 입력·마이크·음성 읽기는 제공하지 않습니다. 분석 결과와 확인 질문이 준비되면 짧은 알림음을 재생합니다. [설정과 검증 범위](docs/UWAT_GEMINI.md)를 확인하세요.

## 검증

```powershell
python scripts/check_repository.py
node --run test
node --run build
```

- [실행·Git·환경변수](docs/DEVELOPMENT.md)
- [GROAD 인계 기준과 구현 한계](docs/GROAD_BASELINE.md)
- [프로젝트 범위](docs/PROJECT_BRIEF.md)
- [환경 확인 기록](docs/ENVIRONMENT.md)
- [소스 및 연구 자료 해시](docs/GROAD_IMPORT_MANIFEST.json)
- [이번 인계의 검증 기록](docs/VALIDATION_20261123.md)

기존 연구의 최종 검정은 기상·교통·도로 변수 추가에 따른 예측력의 유의한 개선을 입증하지 못했습니다. 연구 근거로 보관하며 시민 제보를 검증된 사고확률로 표시하지 않습니다.
