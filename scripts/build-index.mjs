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

// 숨김 링크 묶음: scripts/seal-link.mjs 로 만든 암호문 하나만 페이지에 넣는다(평문 주소는 저장소에 없음)
const SECRET_FILE = join(ROOT, 'secret-links.json');
const sealedRaw = safeExists(SECRET_FILE) ? JSON.parse(readFileSync(SECRET_FILE, 'utf8')) : null;
const sealed = sealedRaw && !Array.isArray(sealedRaw) && sealedRaw.v === 3 ? sealedRaw : null;
if (sealedRaw && !sealed) console.warn('secret-links.json 이 이전 형식이라 잠긴 카드를 넣지 않았습니다. seal-link.mjs add 로 다시 만드세요.');
// 브라우저 해독용 Argon2id 구현. 버전을 고정하고 SRI 로 파일 변조를 막는다 (package.json 의 hash-wasm 과 같은 버전)
const ARGON2_SRC = 'https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/argon2.umd.min.js';
const ARGON2_SRI = 'sha384-tP0Wy54CKmng7i9EoTlPySD0hBx6Octj0VS6MfwlnUu111MPa+JLm0CCbep6XJ1W';
// 잠금 해제 후 열어 두는 시간(초). 이 시간 동안은 같은 탭에서 다른 페이지에 갔다 와도 다시 문구를 묻지 않는다(sessionStorage).
const UNLOCK_SECONDS = 600;

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
  .lock { display: grid; gap: 6px; padding: 20px 22px; border: 1px dashed var(--line); border-radius: 16px;
          background: var(--card); cursor: pointer; transition: border-color .2s; }
  .lock:hover, .lock:focus-within, .lock:focus-visible { border-color: var(--mute); outline: none; }
  .t { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .d { color: var(--mute); font-size: 15px; line-height: 1.5; }
  .m { color: var(--mute); font: 12px ui-monospace, Menlo, monospace; }
  footer { margin-top: 48px; color: var(--mute); font-size: 12px; user-select: none; }
  #q { margin-top: 8px; width: 100%; max-width: 280px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px;
       background: var(--card); color: var(--fg); font: 13px ui-monospace, Menlo, monospace; outline: none; }
  #q:focus { border-color: var(--mute); }
  #q.no { animation: no .3s; }
  .bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; margin-top: 8px; }
  .bar i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 3px; }
  .lock.open { border-style: solid; cursor: default; }
  .ttl { display: flex; gap: 10px; align-items: center; color: var(--mute); font: 12px ui-monospace, Menlo, monospace; padding: 0 4px; }
  .ttl button { font: inherit; color: var(--mute); background: none; border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .ttl button:hover { color: var(--fg); border-color: var(--mute); }
  @keyframes no { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  #r { margin-top: 14px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1><span>Personal Pages</span></h1>
  <p class="sub">페이지 ${pages.length}개 · 최근 수정순</p>
  <ul id="list">${items}${sealed ? `
    <li id="lk" class="lock" tabindex="0" role="button" aria-label="잠긴 페이지 열기">
      <span class="t">🔒 잠긴 페이지</span>
      <span class="d" id="lkd">비밀 문구를 입력하면 숨긴 링크가 모두 열립니다.</span>
      <span class="m" id="lkm">Argon2id × ${sealed.rounds}단계 + AES-256-GCM</span>
      <input id="q" type="password" autocomplete="off" spellcheck="false" placeholder="비밀 문구 입력 후 Enter" aria-label="비밀 문구" hidden>
      <div class="bar" id="bar" hidden><i id="fill"></i></div>
    </li>` : ''}
  </ul>
  <footer>이 목록은 배포할 때 자동으로 만들어집니다.</footer>${sealed ? `
</main>
<script id="sl" type="application/json">${JSON.stringify(sealed)}</script>
<script>
(function () {
  var box = JSON.parse(document.getElementById('sl').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var q = $('q'), lk = $('lk'), lkd = $('lkd'), lkm = $('lkm'), bar = $('bar'), fill = $('fill');
  var MSG = lkd.textContent, busy = false, opened = false;
  function open() { if (opened || busy) return; if (q.hidden) { q.hidden = false; q.value = ''; } q.focus(); }
  lk.addEventListener('click', open);
  lk.addEventListener('keydown', function (e) { if (e.target === lk && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); open(); }
    if (e.key === 'Escape' && !busy && !opened) { q.hidden = true; lkd.textContent = MSG; }
  });
  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

  // Argon2id 는 화면이 멈추지 않도록 워커에서 돌린다. 라이브러리는 버전 고정 + 무결성 검사 후 불러온다.
  var libText;
  async function lib() {
    if (!libText) {
      var res = await fetch('${ARGON2_SRC}', { integrity: '${ARGON2_SRI}', mode: 'cors' });
      if (!res.ok) throw new Error('lib');
      libText = await res.text();
    }
    return libText;
  }
  var WORKER = 'self.onmessage = async function (e) {' +
    ' var d = e.data, input = new TextEncoder().encode(d.pass.normalize("NFC"));' +
    ' try { for (var i = 1; i <= d.rounds; i++) {' +
    '   input = await hashwasm.argon2id({ password: input, salt: d.salt, parallelism: d.p, iterations: d.t, memorySize: d.m, hashLength: 32, outputType: "binary" });' +
    '   postMessage({ step: i }); }' +
    '   postMessage({ key: input }, [input.buffer]);' +
    ' } catch (err) { postMessage({ error: String(err) }); } };';

  function derive(pass, onStep) {
    return lib().then(function (text) {
      return new Promise(function (ok, no) {
        var url = URL.createObjectURL(new Blob([text, '\\n', WORKER], { type: 'text/javascript' }));
        var w = new Worker(url);
        w.onmessage = function (e) {
          if (e.data.step) onStep(e.data.step);
          else { w.terminate(); URL.revokeObjectURL(url); e.data.key ? ok(e.data.key) : no(new Error(e.data.error)); }
        };
        w.onerror = function (e) { w.terminate(); URL.revokeObjectURL(url); no(e); };
        w.postMessage({ pass: pass, salt: b64(box.salt), m: box.m, t: box.t, p: box.p, rounds: box.rounds });
      });
    });
  }

  function fmt(sec) { return sec < 60 ? Math.round(sec) + '초' : Math.floor(sec / 60) + '분 ' + Math.round(sec % 60) + '초'; }

  async function unlock(pass) {
    var t0 = performance.now(), step = 0, stepAt = t0, avg = 2000, raf;
    bar.hidden = false; fill.style.width = '0%';
    (function tick() {
      var now = performance.now(), part = Math.min(0.95, (now - stepAt) / avg);
      var pct = Math.min(100, (step + part) / box.rounds * 100);
      fill.style.width = pct.toFixed(1) + '%';
      var left = Math.max(0, (box.rounds - step - part) * avg / 1000);
      lkd.textContent = '키를 만드는 중 ' + step + '/' + box.rounds + ' · ' + fmt((now - t0) / 1000) + ' 경과 · 약 ' + fmt(left) + ' 남음';
      raf = requestAnimationFrame(tick);
    })();
    try {
      var raw = await derive(pass, function (i) { step = i; stepAt = performance.now(); avg = (stepAt - t0) / i; });
      cancelAnimationFrame(raf); fill.style.width = '100%';
      var key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
      var aad = new TextEncoder().encode('psl:v3:' + box.kdf + ':' + box.m + ':' + box.t + ':' + box.p + ':' + box.rounds);
      try {
        return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(box.iv), additionalData: aad }, key, b64(box.data))));
      } catch (e) { return null; }
    } finally { cancelAnimationFrame(raf); }
  }

  // 잠금 해제 상태는 이 탭의 sessionStorage 에만 두고, 정해진 시간이 지나면 지운다 (탭을 닫아도 지워진다)
  var SKEY = 'psl:unlocked:' + box.iv, TTL = ${UNLOCK_SECONDS} * 1000, timer = 0;
  function store(v) { try { v ? sessionStorage.setItem(SKEY, JSON.stringify(v)) : sessionStorage.removeItem(SKEY); } catch (e) {} }
  function stored() {
    try { var v = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (v && v.exp > Date.now() && Array.isArray(v.links)) return v; } catch (e) {}
    store(null); return null;
  }

  function show(links, exp) {
    opened = true;
    var frag = document.createDocumentFragment();
    links.forEach(function (l) {
      if (!/^https?:\\/\\//i.test(l.url)) return; // http(s) 링크만 표시
      var li = document.createElement('li'), a = document.createElement('a');
      li.className = 'unlocked';
      a.href = l.url; a.innerHTML = '<span class="t"></span><span class="m"></span>';
      a.firstChild.textContent = l.label || l.url; a.lastChild.textContent = '🔓 ' + l.url;
      li.appendChild(a); frag.appendChild(li);
    });
    var tl = document.createElement('li');
    tl.className = 'unlocked ttl';
    tl.innerHTML = '<span></span><button type="button">지금 잠그기</button>';
    tl.lastChild.addEventListener('click', lock);
    frag.appendChild(tl);
    lk.parentNode.insertBefore(frag, lk);
    lk.hidden = true;
    clearInterval(timer);
    function update() {
      var left = Math.max(0, Math.round((exp - Date.now()) / 1000));
      if (!left) lock(); else tl.firstChild.textContent = '🔓 ' + fmt(left) + ' 뒤 다시 잠깁니다';
    }
    update(); timer = setInterval(update, 1000);
  }

  function lock() {
    clearInterval(timer); store(null); opened = false;
    document.querySelectorAll('.unlocked').forEach(function (el) { el.remove(); });
    lk.hidden = false; q.hidden = true; lkd.textContent = MSG;
  }

  var saved = stored();
  if (saved) show(saved.links, saved.exp);
  // 뒤로 가기로 돌아왔을 때(bfcache) 이미 만료됐으면 잠근다
  window.addEventListener('pageshow', function () { if (opened && !stored()) lock(); });

  q.addEventListener('keydown', async function (e) {
    if (e.key !== 'Enter' || !q.value || busy) return;
    busy = true; q.hidden = true;
    var pass = q.value; q.value = '';
    var links = null, failed = false;
    try { links = await unlock(pass); } catch (err) { failed = true; }
    busy = false; bar.hidden = true;
    if (links) { var exp = Date.now() + TTL; store({ links: links, exp: exp }); show(links, exp); return; }
    lkd.textContent = failed ? '키를 만들지 못했습니다. 인터넷 연결이나 메모리(약 2GB)를 확인해 주세요.' : '문구가 맞지 않습니다. 다시 입력해 주세요.';
    q.hidden = false; q.classList.remove('no'); void q.offsetWidth; q.classList.add('no'); q.focus();
  });
})();
</script>` : `
</main>`}
</body>
</html>
`;

writeFileSync(join(ROOT, 'index.html'), out);
console.log(`index.html: ${pages.length} pages`);
for (const p of pages) console.log(`  /${p.path}/  ${p.title}`);
