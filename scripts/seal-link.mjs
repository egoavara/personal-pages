// 숨김 링크를 비밀 문구로 암호화해 secret-links.json 에 추가한다.
// 사용: node scripts/seal-link.mjs <url> [표시 이름]
//  - 비밀 문구는 터미널에서 화면에 보이지 않게 입력받는다(셸 기록에 남지 않음).
//  - 루트 목록 페이지에서 `/` 키(모바일은 맨 아래 문구 세 번 탭)를 누르고 같은 문구를 넣으면 풀린다.
// 암호화: PBKDF2-SHA256(310,000회)로 키를 만들고 AES-256-GCM 으로 {label,url} 을 암호화한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'secret-links.json');
const ITER = 310000;

const [url, label = ''] = process.argv.slice(2);
if (!url) { console.error('사용: node scripts/seal-link.mjs <url> [표시 이름]'); process.exit(1); }

function askHidden(q) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) { let buf = ''; stdin.on('data', (d) => (buf += d)); stdin.on('end', () => resolve(buf.replace(/\r?\n$/, ''))); return; }
    stdout.write(q); stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let s = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); return resolve(s); }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') s = s.slice(0, -1); else s += c;
      }
    };
    stdin.on('data', onData);
  });
}

const pass = await askHidden('비밀 문구: ');
if (process.stdin.isTTY) {
  const again = await askHidden('한 번 더: ');
  if (again !== pass) { console.error('두 문구가 다릅니다.'); process.exit(1); }
}
if (pass.length < 8) { console.error('비밀 문구는 8자 이상으로 해 주세요.'); process.exit(1); }

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify({ label, url }))));

const b64 = (u) => Buffer.from(u).toString('base64');
const list = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
list.push({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) });
writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n');
console.log(`secret-links.json 에 추가했습니다 (총 ${list.length}개). 커밋하고 푸시하면 반영됩니다.`);
