# personal-pages

https://egoavara.github.io/personal-pages/

- 폴더 안에 `index.html` 을 넣고 `main` 에 push 하면 GitHub Actions(`.github/workflows/pages.yml`)가 배포한다.
- 루트 목록 페이지(`/index.html`)는 배포할 때 `scripts/build-index.mjs` 가 하위 `index.html` 을 모두 찾아 자동으로 만든다. 각 페이지의 `<title>` 과 `<meta name="description">` 이 목록에 그대로 쓰인다.
- 로컬 미리보기: `node scripts/build-index.mjs` 후 루트 `index.html` 열기 (이 파일은 커밋하지 않는다).
- 숨김 링크: `node scripts/seal-link.mjs <url> [이름]` 으로 비밀 문구와 함께 암호화해 `secret-links.json` 에 넣는다. 목록 페이지에서 `/` 키(모바일은 맨 아래 문구 세 번 탭)를 누르고 문구를 입력하면 풀려서 이동한다. 저장소에는 암호문만 남는다.
