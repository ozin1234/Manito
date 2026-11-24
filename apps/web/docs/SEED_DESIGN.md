# SEED Design 적용

K-ROAD 제보 화면의 주요 버튼·위험 등급 배지·입력 필드는 당근의 [SEED Design React v3](https://seed-design.io/react/getting-started/installation/manual)를 사용합니다. 의존성은 `@seed-design/react`와 `@seed-design/css` 3.3.0입니다.

`app/layout.tsx`에서 `@seed-design/css/all.css`를 불러오고 `<html data-seed data-seed-color-mode="light-only">`를 설정합니다. `components/seed-ui.tsx`는 네이티브 SEED ActionButton, Badge, TextField를 K-ROAD에서 쉽게 쓰도록 감싼 얇은 어댑터입니다. 디자인 시스템의 원래 스타일과 접근성 속성을 유지하고, 위험·아차·주의의 제품 색상은 `app/seed-theme.css`에서만 정합니다.

```tsx
import { SeedBadge, SeedButton, SeedTextarea, SeedTextInput } from "@/components/seed-ui";

<SeedBadge tone="critical">위험지역</SeedBadge>
<SeedButton variant="brandSolid" onClick={openReport}>제보하기</SeedButton>
<SeedTextInput label="현장 위치" value={location} onChange={onLocationChange} />
<SeedTextarea label="현장 내용" value={description} onChange={onDescriptionChange} />
```

SEED 패키지는 Apache-2.0 라이선스입니다. 배포물에 해당 패키지의 라이선스 고지 조건을 유지합니다.
