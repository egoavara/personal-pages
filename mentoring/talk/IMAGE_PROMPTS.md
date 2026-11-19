# 진로 토크 덱 이미지 프롬프트 (GPT 이미지 생성용)

`mentoring/talk/assets/` 에 **아래 파일명 그대로** 저장하면 슬라이드에 자동으로 들어갑니다. 파일이 없으면 검은 화면 오른쪽 아래에 파일명이 작게 보입니다.

## Codex로 다시 뽑기
현재 이미지 5장은 Codex CLI의 이미지 생성 기능으로 만들었습니다. 한 장만 다시 뽑으려면 `assets/`에서 아래처럼 실행합니다(기본 모델은 ChatGPT 계정에서 지원되지 않아 `-m`을 지정).

```
codex exec -m gpt-6.1-sol --skip-git-repo-check -s workspace-write -C . \
  "Use your image generation tool to create ONE landscape image (1536x1024) and save it as gen-door.png in the current directory (overwrite if exists). Do not modify any other file.

Prompt for the image:
<공통 스타일 + Scene>"
```

## 사용 팁
- 크기는 **가로형 1536×1024**(또는 16:9)로 받으세요. 모두 슬라이드 전체 배경(full-bleed)으로 깔립니다.
- 이미지 위에 큰 흰 글씨가 올라가고 어두운 그라데이션이 덮이므로, **어둡고 여백이 많은** 이미지가 잘 어울립니다.
- 글씨는 넣지 않습니다. 화면 속 모니터·간판 글씨도 깨지기 쉬우니 피하세요.
- 5장을 같은 대화창에서 이어서 뽑으면 톤이 맞습니다.
- `gen-kakao-life.png` 는 직접 찍은 사진(팀, 자리, 사무실)이 있으면 그걸 쓰는 게 제일 좋습니다.

## 공통 스타일 (모든 프롬프트 앞에 붙이기)

```
Style: cinematic, minimal, Apple keynote-like photograph. Very dark, mostly black frame with one soft warm light source; a single accent of warm yellow (#FEE500) light. Shallow depth of field, subtle film grain, calm and quiet mood. Lots of empty negative space. No text, no letters, no logos, no readable screens, no watermark. Landscape 3:2 composition.
```

---

## 1. `gen-title.png` — 표지 "돌아서 왔습니다"

글씨가 화면 가운데에 크게 올라갑니다. 피사체는 아래쪽에 작게.

```
[공통 스타일]

Scene: a lone young person seen from behind, very small at the bottom of the frame, walking along a long winding road at night that curves left and right before reaching a distant warm yellow glow on the horizon. The road is faintly lit. The upper two-thirds of the frame is almost pure black sky.
```

## 2. `gen-fear.png` — "중소기업 가면 끝 아니에요?"

글씨가 가운데에 올라갑니다. 대비만 은은하게.

```
[공통 스타일]

Scene: a university student standing small in the lower center, facing two paths at night: on the far left a huge glossy skyscraper with many lit windows, on the right a small modest low-rise building with a single warm yellow lit window. The student hesitates between them. Most of the frame is dark; the center is clean and empty.
```

## 3. `gen-night.png` — "맨땅에 헤딩"

왼쪽에 글씨가 올라가고 왼쪽이 어둡게 덮입니다. 피사체는 **오른쪽**에.

```
[공통 스타일]

Scene: late at night in a small, almost empty office. On the right third of the frame, one developer sits alone at a desk, lit only by the cool glow of two monitors (screens are blurred, nothing readable) and a small warm desk lamp. A cold cup of coffee and a stack of printed documentation pages on the desk. A wall clock hints it is 3 AM. The left half of the frame is dark and empty.
```

## 4. `gen-kakao-life.png` — "들어와 보니," (직접 찍은 사진 권장)

가로로 긴 사진 상자(1500×620)에 들어갑니다. 위·아래가 잘릴 수 있어요.

```
[공통 스타일, 단 "Very dark" 대신 "warm and bright, but still minimal"]

Scene: a bright, modern open office in the afternoon, warm sunlight through large windows. A few developers collaborate around a desk in the middle distance, slightly out of focus, laughing and pointing at a laptop. Plants and soft yellow accents in the interior. Feels welcoming and energetic.
```

## 5. `gen-door.png` — "첫 회사가 마지막 회사는 아닙니다."

글씨가 가운데에 크게 올라갑니다.

```
[공통 스타일]

Scene: a long dark corridor with a single door at the far end standing half open, warm yellow light spilling out across the floor toward the viewer. Symmetrical, centered vanishing point. The walls and ceiling fade into black.
```

---

## 파일 배치

```
mentoring/talk/
├── index.html
├── IMAGE_PROMPTS.md
└── assets/
    ├── 2021-1-coding-pass.png    # 블로그: 1차 코테 합격 메일
    ├── 2021-2-coding-pass.png    # 블로그: 2차 코테 합격 메일
    ├── 2021-3-hr-pass.png        # 블로그: HR 면접 합격 메일
    ├── 2021-4-reject.png         # 블로그: 기술 면접 불합격 메일
    ├── 2022-blind-banner.png     # 블로그: 2023 블라인드 채용 배너
    ├── 2022-offer.png            # 블로그: 입사 확정 화면
    ├── gen-title.png             # ← GPT로 생성
    ├── gen-fear.png              # ← GPT로 생성
    ├── gen-night.png             # ← GPT로 생성
    ├── gen-kakao-life.png        # ← 직접 찍은 사진 또는 GPT
    └── gen-door.png              # ← GPT로 생성
```
