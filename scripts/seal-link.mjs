// 숨김 링크 묶음을 비밀 문구 하나로 암호화해 secret-links.json 에 저장한다.
//
// 사용 (npm install 후):
//   node scripts/seal-link.mjs add <url> [표시 이름]   링크 추가 (파일이 없으면 새 문구로 새로 만든다)
//   node scripts/seal-link.mjs list                    링크 목록 보기
//   node scripts/seal-link.mjs remove <번호>           링크 삭제 (번호는 list 기준, 1부터)
//   node scripts/seal-link.mjs rekey                   비밀 문구 바꾸기
//   node scripts/seal-link.mjs refresh                 같은 문구로 다시 저장 (저장 형식이 바뀌었을 때)
//   비밀 문구는 화면에 보이지 않게 입력받는다(셸 기록에 남지 않음).
//
// 암호화 (v3)
//  - 키 유도: Argon2id 를 3단계 이어서 돌린다. 각 단계는 메모리 2000MiB · 반복 1회 · 병렬 1이고
//    (RFC 9106 의 첫 번째 권장값 t=1, m=2GiB 수준), 앞 단계 출력이 다음 단계의 입력이 된다.
//    한 번 시도에 메모리 약 2GB와 약 6초(브라우저 기준)가 들고, 단계로 나눠 브라우저에서 진행률을 보여줄 수 있다.
//  - 암호: AES-256-GCM. 링크 목록 전체(JSON 배열)를 한 덩어리로 암호화하고, KDF 파라미터를 AAD 로 묶는다.
//  - AES-256 은 양자 환경(Grover)에서도 128비트 강도가 남아 양자내성 대칭 암호로 분류된다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';
import { argon2id } from 'hash-wasm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'secret-links.json');
const KDF = { kdf: 'argon2id-chain', m: 2000 * 1024, t: 1, p: 1, rounds: 3 }; // m 은 KiB 단위

const enc = new TextEncoder();
const b64 = (u) => Buffer.from(u).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const aadOf = (k) => enc.encode(`psl:v3:${k.kdf}:${k.m}:${k.t}:${k.p}:${k.rounds}`);

function askHidden(q) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) { let buf = ''; stdin.on('data', (d) => (buf += d)); stdin.on('end', () => resolve(buf.split(/\r?\n/)[0])); return; }
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

async function askNewPass() {
  const pass = await askHidden('새 비밀 문구: ');
  if (process.stdin.isTTY) {
    const again = await askHidden('한 번 더: ');
    if (again !== pass) { console.error('두 문구가 다릅니다.'); process.exit(1); }
  }
  if (pass.length < 12) { console.error('비밀 문구는 12자 이상으로 해 주세요. 무작위 단어 5~6개를 권장합니다.'); process.exit(1); }
  return pass;
}

async function deriveKey(pass, salt, k) {
  let input = enc.encode(pass.normalize('NFC'));
  const t0 = Date.now();
  for (let i = 1; i <= k.rounds; i++) {
    input = await argon2id({ password: input, salt, parallelism: k.p, iterations: k.t, memorySize: k.m, hashLength: 32, outputType: 'binary' });
    process.stdout.write(`\r키를 만드는 중 ${i}/${k.rounds} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  }
  process.stdout.write('\n');
  return crypto.subtle.importKey('raw', input, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function open(pass, box) {
  const key = await deriveKey(pass, unb64(box.salt), box);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: aadOf(box) }, key, unb64(box.data));
    return { key, salt: unb64(box.salt), links: JSON.parse(new TextDecoder().decode(plain)) };
  } catch { console.error('비밀 문구가 맞지 않습니다.'); process.exit(1); }
}

// 암호문 길이로 링크 개수·주소 길이를 짐작하지 못하도록 평문을 BLOCK 바이트 단위로 공백을 채워 늘린다.
// (JSON.parse 는 뒤쪽 공백을 무시한다) 링크 20개 안팎까지는 모두 같은 크기로 보인다.
const BLOCK = 4096;
function pad(json) {
  const bytes = enc.encode(json);
  const size = Math.ceil((bytes.length + 1) / BLOCK) * BLOCK;
  const out = new Uint8Array(size).fill(0x20);
  out.set(bytes);
  return out;
}

function checkUrl(url) {
  let u; try { u = new URL(url); } catch { console.error('올바른 URL 이 아닙니다.'); process.exit(1); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') { console.error('http(s) 주소만 넣을 수 있습니다.'); process.exit(1); }
}

async function save(key, salt, links) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(KDF) }, key, pad(JSON.stringify(links))));
  writeFileSync(FILE, JSON.stringify({ v: 3, ...KDF, salt: b64(salt), iv: b64(iv), data: b64(data) }, null, 2) + '\n');
  console.log(`secret-links.json 을 저장했습니다 (링크 ${links.length}개). 커밋하고 푸시하면 반영됩니다.`);
}

function load() {
  if (!existsSync(FILE)) return null;
  const box = JSON.parse(readFileSync(FILE, 'utf8'));
  if (Array.isArray(box) || box.v !== 3) {
    console.log('이전 형식의 secret-links.json 입니다. 지우고 새 문구로 새로 만듭니다.');
    return null;
  }
  return box;
}

const [cmd, ...args] = process.argv.slice(2);
const usage = () => { console.error('사용: node scripts/seal-link.mjs add <url> [이름] | list | remove <번호> | rekey | refresh'); process.exit(1); };

if (cmd === 'add') {
  const [url, label = ''] = args;
  if (!url) usage();
  checkUrl(url);
  const box = load();
  if (!box) {
    const pass = await askNewPass();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    await save(await deriveKey(pass, salt, KDF), salt, [{ label, url }]);
  } else {
    const { key, salt, links } = await open(await askHidden('비밀 문구: '), box);
    links.push({ label, url });
    await save(key, salt, links);
  }
} else if (cmd === 'list' || cmd === 'remove' || cmd === 'refresh') {
  const box = load();
  if (!box) { console.error('저장된 링크가 없습니다.'); process.exit(1); }
  const { key, salt, links } = await open(await askHidden('비밀 문구: '), box);
  if (cmd === 'list') {
    links.forEach((l, i) => console.log(`${i + 1}. ${l.label || '(이름 없음)'}  ${l.url}`));
  } else if (cmd === 'refresh') {
    // 같은 문구·같은 키로 다시 저장한다 (패딩 같은 저장 형식이 바뀌었을 때 사용)
    await save(key, salt, links);
  } else {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 1 || n > links.length) { console.error(`1~${links.length} 사이 번호를 넣어 주세요.`); process.exit(1); }
    const [gone] = links.splice(n - 1, 1);
    console.log(`삭제: ${gone.label || gone.url}`);
    await save(key, salt, links);
  }
} else if (cmd === 'rekey') {
  const box = load();
  if (!box) { console.error('저장된 링크가 없습니다.'); process.exit(1); }
  const { links } = await open(await askHidden('지금 비밀 문구: '), box);
  const pass = await askNewPass();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await save(await deriveKey(pass, salt, KDF), salt, links);
} else usage();
