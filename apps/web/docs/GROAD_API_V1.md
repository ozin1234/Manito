# K-ROAD 독립 API v1

> 2026-11-16: 웹앱은 제보 중심 안전 지도로 전환했습니다. 이 문서의 경로·내비게이션 엔드포인트는 엔진의 기존 인터페이스 설명이며 현재 사용자 화면에는 길찾기 UI가 없습니다. 공공기관 자동 접수도 아직 연결되지 않았습니다.

이 소스는 TMAP API를 호출하지 않습니다. 장소 검색, 자동차 경로, 지도 타일은 운영자가 실행하는 K-ROAD 독립 엔진으로 전달합니다. 엔진이 연결되지 않으면 503 오류를 반환하며 외부 지도·경로 서비스로 자동 대체하지 않습니다.

배포된 웹앱 서버의 비밀 환경 변수 `GROAD_INDEPENDENT_API_URL`과 `GROAD_INDEPENDENT_API_KEY`를 모두 설정해야 합니다. URL은 독립 서버의 HTTPS 주소여야 합니다. 브라우저에는 API 키를 전달하지 않고 같은 사이트의 `/api/v1` 경로를 사용합니다. 자체 엔진 실행 패키지는 `groad_independent` 작업 폴더에 있습니다.

| 엔드포인트 | 기능 |
| --- | --- |
| `GET /api/v1` | 제공처 및 연결 설정 상태 |
| `GET /api/v1/places?q=강릉역&limit=8` | 자체 Nominatim 장소 검색 |
| `POST /api/v1/routes/driving` | 자체 OSRM 자동차 경로 계산 |
| `GET /api/v1/tiles/{z}/{x}/{y}.png` | 자체 지도 타일 프록시 |
| `GET /api/v1/tiles/satellite/{z}/{x}/{y}.png` | ESA WorldCover 2021 위성사진 프록시 |
| `GET /api/v1/tiles/recent/{date}/{z}/{x}/{y}.jpg` | NASA Terra MODIS 일일 관측 영상(최대 9배율) |
| `GET /api/v1/weather?lat=37.7&lng=128.4` | Open-Meteo 15분 간격 지역 기상 모델의 최신 값 |
| `GET /api/v1/traffic/segments?bbox=127.4,37.0,129.4,38.6` | ITS 도로별 실시간 속도. 별도 키가 없으면 비활성 상태 반환 |
| `POST /api/v1/navigation/match` | 연속 GPS 좌표를 도로에 맞춘 추정 위치로 변환 |
| `GET /api/v1/risk/segments` | 2025년 검증 위험구간 사례 |
| `GET /api/v1/reports?limit=100` | 저장된 시민 제보 목록 |
| `POST /api/v1/reports` | 사진·설명·좌표를 로컬 독립 엔진에 저장 |
| `GET /api/v1/reports/{id}/photo` | 제보 사진 보기 |

제보 작성 본문은 `category: "danger" | "near_miss" | "caution"`, `description`(10~2000자), `lat`, `lng`, 선택적 `photoDataUrl`(JPG·PNG·WebP, 3MB 이하), `allowAiProcessing`(기본 `false`)입니다. 사진을 고른 뒤 기기의 현재 GPS를 측정한 경우 `locationSource:"gps"`, `locationAccuracyM`, `locationCapturedAt`(ISO 시각)을 함께 전송합니다. 지도에서 직접 위치를 고른 경우 `locationSource:"map"`으로 표시합니다. 사진의 EXIF 위치는 사용하지 않고 제거합니다. 저장 후 `status:"draft"`, `agencyStatus:"not_submitted"`로 응답하며, 이는 **공공기관 접수 완료가 아닙니다**. 별도 협약과 공식 연계 API가 마련될 때까지 안전신문고에서 제보자가 직접 접수해야 합니다. `OPENAI_API_KEY`가 서버에 설정되고 제보자가 AI 처리에 동의한 경우에만 설명 텍스트를 외부 AI로 전송해 요약합니다. 사진은 AI로 전송하지 않습니다. AI가 없거나 실패하면 `summarySource:"rule_based"`인 자동 정리 초안을 만듭니다. 제보 사진과 내용은 지도 조회자가 볼 수 있으므로 개인정보를 입력하지 않도록 안내해야 합니다.

경로 본문:

```json
{"origin":{"lat":37.874,"lng":127.734},"destination":{"lat":37.765,"lng":128.901},"option":"recommended"}
```

현재 독립 엔진은 `recommended`만 지원합니다. 경로 응답은 `provider: "groad-osrm"`, `trafficAware: false`이며 지도·장소·도로 데이터는 OpenStreetMap 기여자의 ODbL 자료입니다. 지도에 출처를 표시합니다. 거리와 예상 시간은 정적 도로망 기반이며 실시간 교통, 통행료, 음성 안내를 보증하지 않습니다.

앱의 GPS 필터는 부정확한 측정과 위치 점프를 걸러냅니다. `주행 시작` 후 도로 맞춤 추정이 신뢰도 기준을 넘으면 추정 위치로 마커를 표시하고 기기 GPS 정확도를 별도로 보여줍니다. 경로 이탈이 연속 3번 관측되고 30초 재탐색 간격을 만족하면 현재 위치에서 이 API로 경로를 다시 계산합니다. 이는 기기 GPS 칩의 실제 측정 정확도를 높이는 기능이 아닙니다.

`/api/v1/risk/segments`의 2025년 자료는 `isLiveRisk: false`입니다. 위성사진은 무료 공개된 ESA WorldCover 2021 Sentinel-2 합성 영상이며 약 10m 해상도입니다. 현재 시각의 촬영 영상이나 차선 수준 사진이 아닙니다. 웹앱 서버가 ESA 영상 서버에 접속할 수 있어야 합니다. 지도에 ESA/Copernicus 출처를 표시합니다. 교통정보는 별도 `ITS_API_KEY`가 자체 엔진에 설정된 경우 최근 15분 이내의 국토교통부 도로별 속도를 표시합니다. 2026-11-12 로컬 서버에서 실제 ITS 응답과 지도 표시를 확인했습니다. 배포용 소스에는 이 키가 포함되지 않습니다. 2025 표준 노드·링크의 ID와 일치한 도로만 지도에 그립니다. 색상은 30/60km/h 절대 속도 기준입니다. 경로 계산과 ETA에는 아직 반영되지 않습니다.

최근 위성 레이어는 NASA GIBS의 날짜별 Terra MODIS 약 250m 영상입니다. 현재 시각의 도로 사진이 아니며 구름과 촬영 공백이 있습니다. 위성 요청 날짜와 출처를 화면에 표시합니다. 기상 API는 좌표를 한국 범위로 제한하고, Open-Meteo 기상 모델의 온도·강수·적설·날씨 코드·낮밤 값을 전달합니다. 이는 현장 실측값이 아니며, 무료 API의 비상업적 이용 조건과 출처 표시 조건을 따릅니다.
