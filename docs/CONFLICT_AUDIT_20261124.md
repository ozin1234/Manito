# K-ROAD 충돌 점검 — 2026-11-24

## Git와 협업 상태

- 원격 refs를 갱신한 뒤 `origin/main`은 `6f462e4`, 점검 시작 기능 브랜치는 `feat/kroad-public-complaints-admin` / `d5108f8`이었다.
- main에만 있는 커밋 0개, 기능 브랜치에만 있는 커밋 6개였다. main은 기능 브랜치의 조상이다.
- `git ls-files --unmerged`는 0건, `git merge-tree --write-tree origin/main HEAD`는 충돌 없이 성공했다. 작업 파일·현재 브랜치를 실제 main으로 병합하지 않고 검사했다.
- GitHub API에서 열린 PR은 0건이었다. 원격 main 직접 푸시·병합은 하지 않는다.

## 발견한 기능 간 문제

기존 대화에서 새 사진이나 위치를 접수한 뒤 AI 생성·근거 검색이 실패하면, 서버가 새 상태를 저장하지 않아 이전 revision과 공개 저장 확인 토큰이 유효하게 남았다. 오래된 확인 요청으로 이전 사진 또는 위치의 기록이 저장될 수 있었다.

모의 오류를 사용해 사진 변경 후 공급자 오류, 위치 변경 후 공급자 오류, 근거 검색 실패, 잘못된 AI 출력의 네 경우를 재현했다. 수정 전에는 오래된 확인 요청이 201로 저장되어 네 테스트가 실패했다.

`services/api/src/assistant.mjs`에서 입력 검증을 통과한 기존 대화의 변경을 접수하면 먼저 revision을 올리고, 확인 토큰·확인 질문·ready 상태를 무효화해 저장한다. 이후 근거 검색과 AI 생성을 진행한다. 실패해도 이전 토큰으로는 409를 반환한다. 재시도는 최신 사진·위치로 진행하고 성공 후 새 확인을 받아 저장한다. 잘못된 좌표처럼 접수 전에 거부한 입력은 기존의 정상 초안을 유지한다.

새 대화에는 이전 확인 토큰이 없으므로, 첫 AI 요청이 실패하면 기존처럼 미완성 세션 파일을 만들지 않는다. revision은 정상 요청 한 번당 한 번 증가하며 API 경로·사진 전용 입력·환경변수·모델 설정은 유지한다.

## 검증과 인계

- 자동 검사: Node 테스트 48개(위 문제의 실패 재현·복구·잘못된 입력 거부 포함), Python 수집 파서 테스트 3개, TypeScript 검사, 저장소 키 패턴 검사.
- API Docker 이미지 재빌드 후 시민 화면·관리자 화면·K-ROAD API·기반 지도 API의 HTTP 200을 확인했다. 사진 전용/알림음 전용 모드와 AI 설정 유지, 시민 기록·공개 진행 안내 조회도 HTTP로 확인했다. 공개 테스트 기록은 생성하지 않았다.
- 위 AI 오류는 모의 응답이며 실제 Gemini의 과부하가 해결됐다는 의미가 아니다. 실제 마이크·GPS·기관 업무 시스템 검증도 수행하지 않았다.
- 변경: `services/api/src/assistant.mjs`, `services/api/test/assistant-conflicts.test.mjs`, 루트 `package.json`, 이 문서.
- 실행 검사: `node --run test`, `node --run check`, `python -X utf8 -m unittest discover -s scripts/tests -v`.
- 새 환경변수·의존성·데이터 마이그레이션은 없다. 팀원은 기능 브랜치의 수정 커밋을 함께 반영하고 API 서버를 재시작한다. 프론트엔드의 기존 확인·저장 API 계약을 그대로 사용한다.
