# personal-pages

https://egoavara.github.io/personal-pages/

- 폴더 안에 `index.html` 을 넣고 `main` 에 push 하면 GitHub Actions(`.github/workflows/pages.yml`)가 배포한다.
- 루트 목록 페이지(`/index.html`)는 배포할 때 `scripts/build-index.mjs` 가 하위 `index.html` 을 모두 찾아 자동으로 만든다. 각 페이지의 `<title>` 과 `<meta name="description">` 이 목록에 그대로 쓰인다.
- 로컬 미리보기: `node scripts/build-index.mjs` 후 루트 `index.html` 열기 (이 파일은 커밋하지 않는다).
- 숨김 링크: `npm install` 후 `node scripts/seal-link.mjs add <url> [이름]` 으로 링크를 추가한다(`list`, `remove <번호>`, `rekey`, `refresh` 도 있다). 링크 묶음 전체를 비밀 문구 하나로 암호화해 `secret-links.json` 에 넣는다(Argon2id 2000MiB × 3단계 + AES-256-GCM). 목록 페이지의 잠긴 카드를 누르고 문구를 넣으면 진행률이 보이고 6초 안팎 뒤 숨긴 링크가 모두 카드로 나타난다. 암호문은 4KiB 단위로 패딩해 링크 개수와 길이를 감춘다. 해제 상태는 같은 탭의 sessionStorage 에 10분(`UNLOCK_SECONDS`) 동안 유지되고, "지금 잠그기"로 바로 지울 수 있다. 메모리 약 2GB가 필요해 데스크톱 브라우저 기준이다.
