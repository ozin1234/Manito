# G-ROAD 독립 지도·경로 엔진 준비본

TMAP 앱키를 사용하지 않는 **자체 운영 서버 구성**입니다. 한국 OpenStreetMap 원본에서 강원 및 인접 도로 범위를 추출하고, OSRM 자동차 경로 엔진, Nominatim 장소 검색, 래스터 지도 타일 서버를 한 PC 또는 Linux 서버에서 실행합니다. G-ROAD API 키는 이 서버가 검증하는 독립 키이며 TMAP 키와 무관합니다.

## 현재 상태

API 코드와 검증 테스트를 준비했고, 로컬 Docker에서 강원 도로망 그래프, 자체 지도 타일 DB, 장소 검색 DB를 생성했습니다. 춘천~강릉 자동차 경로와 강릉역 장소 검색, 강릉 주변 지도 PNG를 자체 엔진과 웹앱 API를 통해 확인했습니다. 위성사진은 공개 ESA WorldCover 2021 영상 타일로 로컬 웹앱에서 확인했습니다. 2025 표준 도로 선형 27,342개를 ITS 속도 링크 ID와 결합했습니다. 2026-11-12 로컬 ITS 실시간 응답 3,238건 중 822건의 링크 ID가 연결됐고, 웹앱의 지도 색상 선과 속도 목록을 확인했습니다. 이 패키지에는 ITS 비밀 키가 없으므로 새 서버에서는 별도 설정이 필요합니다. 실제 도로 주행 검증은 아직 하지 않았습니다. 기존 공개 G-ROAD 웹앱과 운영 API는 별도 소유 계정에 있어 이 로컬 변경이 아직 반영되지 않았습니다.

현재 로컬 웹앱 소스는 `GROAD_INDEPENDENT_API_URL`과 `GROAD_INDEPENDENT_API_KEY`로 이 API만 호출합니다. 엔진이 없거나 응답하지 않으면 연결 오류를 보여줍니다. 공개 웹앱에서 사용하려면 TLS로 접근 가능한 서버에 이 엔진을 운영해야 합니다. 로컬 `127.0.0.1`은 배포된 웹앱 서버에서 접근할 수 없습니다. 기존 별도 운영 API 게이트웨이는 아직 별도 관리 대상입니다.

## 시작

1. Docker Desktop 또는 Linux Docker를 실행합니다. 지도 DB와 도로 그래프를 저장할 여유 공간과 메모리가 필요합니다.
2. `.env.example`을 `.env`로 복사하고 `GROAD_API_KEY`에 별도로 받은 키를 넣습니다. 키를 Git에 올리지 않습니다.
3. Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap.ps1`을 실행합니다. 한국 PBF 다운로드, 강원 범위 추출, OSRM 그래프 생성, 타일 DB 가져오기, 컨테이너 시작을 수행합니다. 경로 API만 먼저 확인하려면 마지막에 `-RoutesOnly`를 붙입니다. 이 모드에서는 장소 검색과 지도 타일이 아직 제공되지 않습니다. Linux에서는 같은 Osmium·OSRM 명령과 타일 import를 Docker로 실행한 후 `docker compose up -d --build`를 실행합니다.
4. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke.ps1`로 춘천~강릉 실제 자동차 경로를 확인합니다. 전체 구성을 실행했다면 Nominatim의 첫 가져오기가 끝난 후 장소 검색과 지도 타일도 확인합니다. 교통 속도를 연결하려면 [국가교통정보센터](https://www.its.go.kr/)에서 별도 키를 발급받아 `.env`의 `ITS_API_KEY`에 설정하고 API 컨테이너를 다시 시작합니다.

지도 타일은 처음 요청할 때 렌더링에 수십 초가 걸릴 수 있습니다. 전체 구성 실행 후 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/warm-tiles.ps1`로 위험 구간의 기본 배율 타일을 미리 캐시에 넣습니다.

`scripts/bootstrap.ps1`은 한국 OSM 원본을 내려받고 별도 그래프·DB를 생성합니다. 가져오기 중에는 Docker를 중지하지 않는 것이 좋습니다. 완료 표식을 저장해 재실행 때 OSRM·타일 가져오기를 건너뜁니다. 원본 데이터 갱신 시에는 기존 DB와 그래프의 갱신 절차를 별도로 계획해야 합니다.

## 엔드포인트

모든 `/v1/*` 호출에 `Authorization: Bearer <GROAD_API_KEY>`를 넣습니다. 키는 서버 측에만 둡니다.

- `GET /v1/places?q=강릉역&limit=8`: 자체 장소 DB 검색.
- `POST /v1/routes/driving`: `{ "origin":{"lat":37.874,"lng":127.734}, "destination":{"lat":37.765,"lng":128.901}, "option":"recommended" }` 자동차 경로. OSM 정적 도로망 기반이며 실시간 교통·통행료는 제공하지 않습니다.
- `POST /v1/navigation/replan`: 현재 위치를 `origin`으로 넣어 목적지까지 다시 계산합니다. 주행 앱이 GPS 위치와 경로 이탈 여부를 판단해 호출합니다.
- `POST /v1/navigation/match`: 시각·정확도를 포함한 GPS 좌표 2~20개를 도로에 맞춰 추정합니다. 응답 `isEstimated:true`는 실제 GPS 측정 정확도가 향상됐다는 뜻이 아닙니다.
- `GET /v1/risk/segments?band=위험&limit=3`: 2025 검증 사례. `isLiveRisk:false`입니다.
- `GET /v1/tiles/{z}/{x}/{y}.png`: 자체 지도 타일. 서버 키가 필요하므로 앱 서버를 통한 프록시로 제공합니다.
- `GET /v1/tiles/satellite/{z}/{x}/{y}.png`: ESA WorldCover 2021 Sentinel-2 합성 영상. 별도 위성영상 원본 서버 연결이 필요합니다. 8~14 배율의 약 10m 해상도이며 실시간 사진이 아닙니다. 로컬 Docker에서 원본 서버로 외부 접속이 차단되면 웹앱 서버 프록시를 사용합니다.
- `GET /v1/traffic/segments?bbox=127.4,37.0,129.4,38.6`: 국가교통정보센터 ITS의 도로 구간별 속도. `.env`에 별도 `ITS_API_KEY`가 없으면 `available:false`를 반환합니다. 원본 생성 시각이 최근 15분 이내인 자료만 화면에 표시합니다.
- 교통 지도 색상은 표준 노드·링크 2025 도로 형상과 ITS 링크 ID가 일치한 구간에만 표시합니다. 빨강은 30km/h 미만, 주황은 30~59km/h, 초록은 60km/h 이상입니다. 이는 절대 속도 구분이며 도로별 법정 속도 대비 혼잡 등급은 아닙니다. 표시할 수 있는 선형은 응답당 최대 600개로 제한합니다. 경로와 ETA는 여전히 실시간 교통을 반영하지 않습니다.
- `GET /health`: 프로세스 상태. 도로 데이터 준비 상태는 보증하지 않습니다.

### 시민 제보 저장 API

사진을 촬영·선택한 뒤 앱이 현재 위치를 얻으면 `locationSource:"gps"`, `locationAccuracyM`, `locationCapturedAt`을 좌표와 함께 저장합니다. 사진 EXIF 좌표는 사용하지 않습니다. GPS 권한이 없으면 지도에서 고른 좌표를 `locationSource:"map"`으로 저장합니다.

- `GET /v1/reports?limit=100`: 로컬 독립 엔진에 저장된 시민 제보를 최신순으로 조회합니다.
- `POST /v1/reports`: `{ "category":"danger", "description":"도로에 큰 포트홀이 있어 차량이 급정거합니다.", "lat":37.764, "lng":128.9, "photoDataUrl":"data:image/jpeg;base64,...", "allowAiProcessing":false }`. 분류는 `danger`, `near_miss`, `caution`이고 사진은 선택사항입니다. JPG·PNG·WebP, 해독 후 최대 3MB입니다. 사진은 브라우저에서 캔버스로 다시 인코딩해 EXIF/GPS 메타데이터를 제거한 후 전송해야 합니다.
- `GET /v1/reports/{id}/photo`: 저장된 사진을 받습니다. 웹앱은 `/api/v1/reports`와 `/api/v1/reports/{id}/photo`를 프록시합니다. 지도 조회자가 제보 내용과 사진을 볼 수 있으므로 제보 전 개인정보가 포함되지 않았는지 확인해야 합니다.
- 응답의 `status:"draft"`와 `agencyStatus:"not_submitted"`는 **공공기관 접수가 아니라 G-ROAD 로컬 저장**을 의미합니다. 실제 안전신문고·시청에 자동 전송하는 API는 연결되지 않았습니다. 공식 접수는 제보자가 안전신문고에서 별도로 완료해야 합니다. 그 전에는 `기관 전달`이나 `처리 중`으로 표시하면 안 됩니다.
- 기존 직접 저장 API의 선택적 텍스트 요약은 `GEMINI_API_KEY`와 `allowAiProcessing:true`가 있을 때 Gemini를 사용합니다. 이 직접 API는 사진을 모델에 보내지 않으며 실패 시 기존 규칙 요약을 유지합니다. 별도 우왓 대화 API는 사진·문맥·RAG 근거를 모델에 보내고 실패 시 명시적 오류를 반환합니다. 상세 계약은 [우왓 구현 인계](../../docs/UWAT_GEMINI.md)를 확인하세요.
- 제보 데이터는 Manito 전용 Docker `manito-dev_reports`(공유 지도 모드) 볼륨에 유지됩니다. 이전 또는 백업 시 이 볼륨도 포함해야 합니다. 서비스 공개 전에는 로그인·남용 방지·개인정보 검토 절차와 기관 협약이 필요합니다.

브라우저에서 직접 호출할 CORS를 제공하지 않습니다. 운영 서버가 이 API를 호출하고, 모바일·웹 앱은 운영 서버에 요청하도록 합니다. API 서비스만 `127.0.0.1:8788`에 묶여 있고 OSRM, Nominatim, 타일 DB 포트는 외부에 열지 않습니다. 외부 서버 운영 시 TLS 역방향 프록시와 인증 호출 한도를 별도로 설정해야 합니다.

## GPS와 재탐색

`src/gps.mjs`는 정확도 80m 초과, 오래된 측정, 비현실적인 순간 이동을 버리고 통과한 GPS를 가볍게 평활화합니다. `src/geo.mjs`는 경로에서 떨어진 거리와 기기 정확도를 함께 고려하고, 연속 3회 이탈과 30초 간격을 만족할 때 재탐색을 권합니다. 위치 추적은 기기 브라우저의 `watchPosition`이 담당하며, 도로 맞춤은 `navigation/match`가 담당합니다. 안전에 직접 영향을 주는 안내이므로 실제 도로 주행 전 다양한 기기와 환경에서 검증해야 합니다.

## 데이터와 한계

도로·장소·지도 데이터는 [OpenStreetMap](https://www.openstreetmap.org/copyright) 기여자의 ODbL 데이터입니다. G-ROAD가 자체 서버에서 처리하더라도 원천 데이터의 소유권을 주장할 수 없고 지도에 출처를 표시해야 합니다. 한국 원본은 [Geofabrik](https://download.geofabrik.de/asia/south-korea.html)에서 받습니다. 위성사진은 [ESA WorldCover의 공개 Sentinel-2 합성 영상](https://esa-worldcover.org/en/data-access)을 사용하며 화면에 출처를 표시합니다. 이 패키지에는 위성 이미지 원본 파일이 없으며 오프라인 사용에는 별도 다운로드와 타일 구축이 필요합니다. 실시간 교통 속도는 [국가교통정보센터](https://www.data.go.kr/data/15040463/openapi.do)의 별도 키를 발급받아야 활성화됩니다. TMAP 키로 대체할 수 없습니다. OSM의 공개 타일 서버를 대량 저장하는 방식은 허용되지 않습니다.

테스트: `node --test`
