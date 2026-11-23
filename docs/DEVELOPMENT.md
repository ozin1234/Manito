# 개발 및 Git 관리

## 기본 검증

```powershell
python scripts/check_repository.py
```

이 명령은 필수 파일, 흔한 인증키 패턴, 환경변수 예시의 빈 값, 로컬 비밀 파일 제외 설정을 검사한다. 서비스 검증은 `node --run test`와 `node --run build`로 실행한다. GitHub Actions도 저장소 검사·API/GPS 테스트·웹 빌드를 분리해 실행한다.

## 기능 작업 순서

1. `git status`로 진행 중인 변경을 확인한다.
2. `git fetch origin`으로 원격 상태를 확인한다.
3. 변경 사항을 보존한 상태에서 최신 `origin/main` 기준의 기능 브랜치를 사용한다.
4. 필요한 변경을 구현하고 해당 변경에 맞는 검증을 실행한다.
5. `git diff`와 추가할 파일 목록을 확인한 뒤 목적별로 커밋한다.
6. 기능 브랜치를 푸시하고 PR에 검증 결과를 남긴다.

작업 폴더에 보존할 변경이 없고 새 브랜치를 만드는 경우:

```powershell
git fetch origin
git switch -c feat/feature-name origin/main
```

커밋할 때는 필요한 파일을 직접 지정한다.

```powershell
git add path/to/changed-file
git diff --cached
git commit -m "feat: describe the resulting behavior"
git push -u origin feat/feature-name
```

## 환경변수

`node scripts/setup.mjs`는 새 내부 API 키와 기본 포트를 무시되는 루트 `.env`에 생성하고 웹 프록시 설정을 `apps/web/.env.local`에 작성한다. 기존 키를 자동으로 교체하지 않는다. 예시 파일은 빈 값만 둔다.

| 이름 | 용도 |
| --- | --- |
| `MANITO_WEB_PORT` | 웹 포트, 기본 5174 |
| `MANITO_API_PORT` | API 포트, 기본 8790 |
| `GROAD_API_KEY` | 새 Manito 내부 API 인증키, 최소 32자 |
| `MANITO_MAPS_NETWORK` | 선택형 공유 지도 모드의 기존 Docker 네트워크 |
| `OSRM_URL`, `NOMINATIM_URL`, `TILES_URL` | Node 단독 실행의 지도 서비스 주소 |
| `ITS_API_KEY`, `ITS_LINK_SHAPES_PATH` | 선택적 ITS 인증키와 도로선 JSON/GZIP 경로 |
| `OPENAI_API_KEY`, `GROAD_SUMMARY_MODEL` | 동의한 제보 텍스트의 선택적 외부 AI 요약 |

웹은 서버 설정인 `GROAD_INDEPENDENT_API_URL`, `GROAD_INDEPENDENT_API_KEY`를 사용한다. 브라우저 번들에는 키를 넣지 않는다. setup을 다시 실행하면 루트 설정으로 웹 프록시를 맞춘다. 원본 GROAD의 외부 API 키를 자동으로 가져오지 않는다.

## 실행과 데이터

설치·실행 명령은 루트 README를 따른다. Node 단독 실행은 `.local/reports`, Docker 공유 지도 모드는 `manito-dev_reports` 볼륨에 저장한다. 두 저장 방식은 별개이며 자동으로 서로 이전하지 않는다.

개발 종료는 실행한 터미널에서 Ctrl+C를 사용한다. 공유 지도 모드에서는 Manito API만 중지하며 원본 지도·제보 컨테이너와 볼륨은 변경하지 않는다. Manito API를 다시 시작하면 저장 기록이 유지된다.

로컬 주소는 휴대폰 HTTPS 주소가 아니다. 실제 휴대폰 확인은 별도로 수행한다.

## 두 차례 검증

- 1차: 요구사항, 변경 범위, 기존 기능 보존, API 계약, 의존성, 데이터 출처, 환경변수 설정을 점검한다.
- 2차: 관련 빌드·테스트와 핵심 사용 흐름을 실행하고, 실제 외부 API·기기 확인 여부를 구분하여 기록한다.

## 팀원에게 인계할 내용

- 작업 브랜치와 커밋 또는 PR 링크
- 변경한 기능 및 영향을 받는 부분
- 설치·실행·검증 명령
- 새 환경변수 이름과 설정 위치
- DB·데이터·API 계약에 필요한 변경
- 실제 확인한 항목과 아직 확인하지 않은 항목
