// 저장소 안의 모든 하위 index.html 을 찾아 루트 index.html(페이지 목록)을 만든다.
// GitHub Actions 배포 때 자동 실행되며, 로컬에서는 `node scripts/build-index.mjs` 로 미리 볼 수 있다.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', '.github', 'node_modules', 'scripts']);

function findPages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (safeExists(join(p, "index.html"))) out.push(join(p, 'index.html'));
      out.push(...findPages(p));
    }
  }
  return out;
}
function safeExists(p) { try { return statSync(p).isFile(); } catch { return false; } }

function meta(html, re) { const m = html.match(re); return m ? decode(m[1].trim()) : ''; }
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function lastCommitDate(dir) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', dir], { cwd: ROOT, encoding: 'utf8' }).trim();
    return out || '';
  } catch { return ''; }
}

const pages = findPages(ROOT).map((file) => {
  const html = readFileSync(file, 'utf8');
  const dir = relative(ROOT, dirname(file)).split(sep).join('/');
  return {
    href: dir + '/',
    path: dir,
    title: meta(html, /<title>([^<]*)<\/title>/i) || dir,
    desc: meta(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i),
    date: lastCommitDate(dir),
  };
}).sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));

const items = pages.map((p) => `
    <li><a href="${esc(p.href)}">
      <span class="t">${esc(p.title)}</span>
      ${p.desc ? `<span class="d">${esc(p.desc)}</span>` : ''}
      <span class="m">/${esc(p.path)}/${p.date ? ` · ${esc(p.date)}` : ''}</span>
    </a></li>`).join('');

const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Personal Pages</title>
<meta name="description" content="egoavara 의 개인 페이지 모음 (자동 생성)">
<style>
  :root { --bg: #fafaf7; --fg: #1d1d1f; --mute: #6e6e73; --line: #e5e5ea; --card: #fff; --accent: #FEE500; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #000; --fg: #f5f5f7; --mute: #86868b; --line: #2c2c2e; --card: #111; }
  }
  :root[data-theme="dark"] { --bg: #000; --fg: #f5f5f7; --mute: #86868b; --line: #2c2c2e; --card: #111; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); word-break: keep-all;
         font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 72px 16px 96px; }
  h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.03em; }
  h1 span { box-shadow: inset 0 -0.35em 0 var(--accent); }
  .sub { color: var(--mute); margin-top: 10px; }
  ul { list-style: none; margin-top: 40px; display: grid; gap: 14px; }
  a { display: grid; gap: 6px; padding: 20px 22px; border: 1px solid var(--line); border-radius: 16px;
      background: var(--card); color: inherit; text-decoration: none; transition: border-color .2s, transform .2s; }
  a:hover { border-color: var(--fg); transform: translateY(-2px); }
  .t { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .d { color: var(--mute); font-size: 15px; line-height: 1.5; }
  .m { color: var(--mute); font: 12px ui-monospace, Menlo, monospace; }
  footer { margin-top: 48px; color: var(--mute); font-size: 12px; }
</style>
</head>
<body>
<main>
  <h1><span>Personal Pages</span></h1>
  <p class="sub">페이지 ${pages.length}개 · 최근 수정순</p>
  <ul>${items}
  </ul>
  <footer>이 목록은 배포할 때 자동으로 만들어집니다.</footer>
</main>
</body>
</html>
`;

writeFileSync(join(ROOT, 'index.html'), out);
console.log(`index.html: ${pages.length} pages`);
for (const p of pages) console.log(`  /${p.path}/  ${p.title}`);
