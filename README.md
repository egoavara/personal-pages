# personal-pages

https://egoavara.github.io/personal-pages/

- 폴더 안에 `index.html` 을 넣고 `main` 에 push 하면 GitHub Actions(`.github/workflows/pages.yml`)가 배포한다.
- 루트 목록 페이지(`/index.html`)는 배포할 때 `scripts/build-index.mjs` 가 하위 `index.html` 을 모두 찾아 자동으로 만든다. 각 페이지의 `<title>` 과 `<meta name="description">` 이 목록에 그대로 쓰인다.
- 로컬 미리보기: `node scripts/build-index.mjs` 후 루트 `index.html` 열기 (이 파일은 커밋하지 않는다).
