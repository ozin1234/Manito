# 개발 및 Git 관리

## 기본 검증

```powershell
python scripts/check_repository.py
```

이 명령은 필수 파일, Git에 들어갈 파일의 흔한 인증키 패턴, 환경변수 예시의 빈 값, 로컬 비밀 파일 제외 설정을 검사한다. GitHub Actions에서도 같은 명령을 실행한다. 서비스 빌드나 모델 성능을 검증하는 명령은 아니며, 기술 스택이 정해지면 해당 검증을 추가한다.

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

현재 실행 서비스가 없으므로 필수 환경변수도 없다. 서비스 구현 시 필요한 이름을 `.env.example`에 빈 값으로 추가하고 설정 방법을 이 문서에 기록한다. 실제 값은 로컬 `.env` 또는 배포 서비스의 비밀 설정에 저장한다.

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
