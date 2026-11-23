# Manito

사진·설명·현재 GPS로 도로 위험을 제보하고 지도에서 확인하는 서비스입니다. 사용자가 선택한 최신 GROAD 제보 앱을 별도 저장소로 인계했습니다. 기존 화면과 G-ROAD 표기는 유지하고 개발 환경과 제보 저장을 분리했습니다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `apps/web` | React 19·TypeScript·Vinext/Vite·Leaflet 웹/PWA |
| `services/api` | Node.js 24 지도·제보 API, JSON·사진 파일 저장 |
| `research/evidence` | 최종 완전격자 검정과 대용량 누락 목록 |
| `.local/groad-research` | 인계 ZIP의 검증된 파일, 로컬에서만 보관 |
| `scripts` | 설정 생성·실행·소스 인계·저장소 검증 |

저장된 제보는 기관에 자동 접수되지 않습니다. AI 요약은 별도 서버 키와 사용자 동의가 있을 때만 사용하며, 기본 요약과 우왓 안내는 규칙 기반입니다.

## 설치와 실행

Node.js 24, Python 3.10 이상, pnpm 11.25.0을 사용합니다. 웹 의존성은 기존 잠금 파일을 유지합니다.

```powershell
pnpm --dir apps/web install --frozen-lockfile
node scripts/setup.mjs
node scripts/dev.mjs
```

기본 주소는 웹 `http://127.0.0.1:5174/`, API `http://127.0.0.1:8790/health`입니다. 기본 실행은 제보 API를 독립적으로 띄웁니다. 지도·주소 검색에는 별도 OSM 타일·Nominatim·OSRM 서비스가 필요합니다.

현재 PC에서 기존 지도 컨테이너를 조회용으로 공유하려면:

```powershell
node scripts/setup.mjs --maps-network groad_independent_default
node scripts/dev.mjs --shared-maps
```

이 모드는 Docker Desktop과 해당 네트워크의 지도 서비스가 필요합니다. Manito API와 제보 볼륨은 `manito-dev` 프로젝트로 새로 생성합니다. 기존 GROAD 제보 API와 DB는 사용하지 않습니다. 종료할 때 Manito API만 중지하고 제보 볼륨을 유지합니다.

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
