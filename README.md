# Manito

새 공모전을 위한 독립 프로젝트입니다. 현재 프로젝트 이름과 협업 기반을 준비했으며, 서비스 주제와 기술 스택은 아직 확정하지 않았습니다.

## 현재 준비된 내용

- 독립 Git 저장소와 기능 브랜치 중심의 협업 규칙
- 환경변수·인증키·원본 데이터의 Git 제외 설정
- 저장소 기본 설정 및 흔한 인증키 패턴을 확인하는 자동 검증
- 프로젝트 기획서, 개발 절차, PR 작성 양식

아직 실행 가능한 서비스, AI 모델, API 서버, 배포 환경은 없습니다. 실제 기능은 주제를 확정한 뒤 구현합니다.

## 시작하기

Python 3.10 이상과 Git이 필요합니다. 기본 검증에는 추가 패키지가 필요하지 않습니다.

```powershell
git clone https://github.com/ozin1234/Manito.git
cd Manito
git switch -c feat/first-prototype
python scripts/check_repository.py
```

## 문서

- [프로젝트 기획서](docs/PROJECT_BRIEF.md)
- [개발 및 Git 관리](docs/DEVELOPMENT.md)
- [환경 확인 기록](docs/ENVIRONMENT.md)
- [작업 규칙](AGENTS.md)

## 개발 원칙

기능 브랜치에서 변경하고 검증 결과를 PR에 남깁니다. 실제 데이터와 시연 데이터를 구분하고, 모의 검증과 실제 기기 검증을 별도로 기록합니다. 주제에 필요한 기술을 선택하며 기존 프로젝트의 코드나 인증키를 자동으로 가져오지 않습니다.
