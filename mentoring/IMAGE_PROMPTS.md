# 춘식이 이미지 생성 프롬프트 (GPT 이미지 생성용)

이미지는 `mentoring/assets/` 폴더에 **아래 파일명 그대로** 저장하면 페이지에 자동 반영됩니다. 파일이 없으면 점선 박스(자리 표시)가 보입니다.

## 사용 팁
- 가능하면 **춘식이 공식 이미지를 레퍼런스로 첨부**하고 프롬프트를 붙여넣으세요. 캐릭터 일관성이 훨씬 좋아집니다.
- 4장 모두 같은 대화창에서 이어서 생성하면 화풍이 통일됩니다.
- 배경은 **투명 PNG**를 요청했습니다. 투명이 안 되면 "단색 배경"으로 받은 뒤 누끼를 따세요.
- 이미지 안에 **글자는 넣지 않도록** 했습니다. 글씨는 깨지기 쉬워서 페이지 HTML에서 처리합니다.

## 공통 스타일 (모든 프롬프트 앞에 붙이기)

```
Style: cute, soft 3D-rendered mascot illustration in the official Kakao Friends look. Warm cozy lighting, clean rounded shapes, gentle soft shadows, vibrant warm yellow and orange palette with brown accents. No text, no letters, no logos, no watermark. Transparent PNG background. Square 1:1 composition, character centered with some margin.

Character: Chunsik (춘식이), the Kakao Friends orange kitten wearing a roasted sweet potato costume — chubby round body, small ears, tiny cheerful face, short little arms and legs.
```

---

## 1. `chunsik-welcome.png` (1번 슬라이드 · 환영)

```
[공통 스타일]

Scene: Chunsik waving one paw happily and smiling brightly, standing in front of a simple modern office building entrance. A small yellow welcome flag in the other paw. Friendly invitation mood, as if greeting visiting university students.
```

## 2. `chunsik-tour.png` (2번 슬라이드 · 아지트 구경)

```
[공통 스타일]

Scene: Chunsik acting as a tour guide inside a bright, modern, open-plan office with desks and plants in the background. He holds a tiny flag in one paw and points forward with the other, wearing a small visitor name tag. Curious and excited expression.
```

## 3. `chunsik-talk.png` (2번 슬라이드 · 멘토와 대화)

```
[공통 스타일]

Scene: Chunsik sitting at a small round cafe-style table with a laptop and two steaming mugs, chatting warmly as if mentoring someone. A cute speech bubble with simple icons only (a light bulb and a heart) — no text. Relaxed, attentive, friendly mood.
```

## 4. `chunsik-gift.png` (3번 슬라이드 · 월컴기프트)

```
[공통 스타일]

Scene: Chunsik happily holding up a large yellow gift box tied with a brown ribbon, with a few small gift boxes, confetti and sparkles around him. Big smile, cheerful celebration mood. Leave the area around him fairly clean so he stands out on a dark brown background.
```

---

## 파일 배치

```
mentoring/
├── index.html
├── IMAGE_PROMPTS.md
└── assets/
    ├── chunsik-welcome.png
    ├── chunsik-tour.png
    ├── chunsik-talk.png
    └── chunsik-gift.png
```
