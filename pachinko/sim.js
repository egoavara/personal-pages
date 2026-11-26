// 빠칭코 판 2D 물리. 한 판 전체를 미리 계산해 두고 화면은 그 결과를 재생한다.
// 미리 계산하면 효과음·연출을 물리와 정확히 맞출 수 있고, 같은 시드는 항상 같은 판이 된다.

export const BOARD = { W: 10, H: 17, R: 0.19, SLOTS: 9, SLOT_TOP: 1.5, SPAWN_Y: 15.7, TUBE_X: 5.55 };
const { W, H, R, SLOTS, SLOT_TOP, SPAWN_Y, TUBE_X } = BOARD;
const HW = W / 2, SLOT_W = W / SLOTS;
const PIN_R = 0.09, G = 17, DT = 1 / 240, FPS = 60, SUB = 240 / FPS;
const LIFT_TIME = 1.8, PHASE = 3.0, WARP_TIME = 0.55, MAX_SPEED = 22;

/* ---------- 기믹 배치 ---------- */
export const BUMPERS = [{ x: 0, y: 11.5, r: 0.46 }, { x: -1.9, y: 10.0, r: 0.46 }, { x: 1.9, y: 10.0, r: 0.46 }];
// 계속 도는 풍차 (십자 날개)
export const SPINNERS = [{ x: -3.0, y: 7.2, len: 0.85, w: 2.4 }, { x: 3.0, y: 7.2, len: 0.85, w: -2.4 }];
// 워프홀: 들어가면 반대편 위쪽 출구로 튀어나온다
export const WARPS = [
  { x: -4.4, y: 9.0, ex: 3.7, ey: 14.6, evx: -2.6, evy: -1 },
  { x: 4.4, y: 9.0, ex: -3.7, ey: 14.6, evx: 2.6, evy: -1 },
];
export const WARP_R = 0.34;
// 벽에 붙은 슬링샷 키커 (맞으면 튕겨 낸다)
export const KICKERS = [
  { ax: -HW, ay: 5.7, bx: -4.05, by: 4.55 }, { ax: HW, ay: 5.7, bx: 4.05, by: 4.55 },
  { ax: -0.75, ay: 4.75, bx: 0, by: 5.35 }, { ax: 0.75, ay: 4.75, bx: 0, by: 5.35 },
];
// 자동 플리퍼 (주기적으로 쳐 올린다)
export const FLIPPERS = [
  { x: -2.7, y: 2.8, len: 1.25, rest: -0.5, up: 0.55, phase: 0 },
  { x: 2.7, y: 2.8, len: 1.25, rest: Math.PI + 0.5, up: Math.PI - 0.55, phase: 0.85 },
];
export const FLIP_PERIOD = 1.7;
export function flipperAngle(f, t, tSudden) {
  if (t >= tSudden) return f.rest;
  const u = (((t - f.phase) % FLIP_PERIOD) + FLIP_PERIOD) % FLIP_PERIOD;
  const k = u < 0.07 ? u / 0.07 : u < 0.22 ? 1 : u < 0.5 ? 1 - (u - 0.22) / 0.28 : 0;
  return f.rest + (f.up - f.rest) * k;
}
export const spinnerAngle = (s, t) => s.w * t;

const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - dx * u, py - ay - dy * u);
};
export const PINS = (() => {
  const pins = [];
  for (let r = 0, y = 13.9; y > 3.95; r++, y -= 0.95) {
    const odd = r % 2 === 1;
    for (let x = odd ? -HW : -HW + 0.5; x <= HW + 1e-6; x += 1) {
      if (BUMPERS.some(b => Math.hypot(b.x - x, b.y - y) < b.r + 0.55)) continue;
      if (SPINNERS.some(s => Math.hypot(s.x - x, s.y - y) < s.len + 0.42)) continue;
      if (WARPS.some(s => Math.hypot(s.x - x, s.y - y) < 0.75)) continue;
      if (KICKERS.some(k => distSeg(x, y, k.ax, k.ay, k.bx, k.by) < 0.55)) continue;
      pins.push({ x, y });
    }
  }
  return pins;
})();
export const DIVIDERS = Array.from({ length: SLOTS - 1 }, (_, i) => -HW + (i + 1) * SLOT_W);

const BUCKET = 1, buckets = new Map();
for (const p of PINS) { const k = Math.floor(p.y / BUCKET); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p); }

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// SAFE 칸에 들어간 공이 다시 올라가는 길: 칸 -> 판 아래 -> 옆 튜브 -> 위 -> 투입구
function liftPos(b, k, out) {
  const side = b.side, pts = [[b.sx, 0.5], [b.sx, -0.55], [side * TUBE_X, -0.55], [side * TUBE_X, H - 0.45], [b.nx, H - 0.45], [b.nx, SPAWN_Y]];
  let total = 0; const len = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len.push(l); total += l; }
  let d = k * total;
  for (let i = 0; i < len.length; i++) {
    if (d <= len[i] || i === len.length - 1) { const u = Math.min(1, d / len[i]); out[0] = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u; out[1] = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u; return; }
    d -= len[i];
  }
}

/**
 * @param counts   사람별 공 개수 배열 (0 이면 불참)
 * @param seed     난수 시드
 * @param minTime  이 시각(초) 전에는 승부가 나지 않는다. 이때부터 모든 칸이 OUT 인 서든데스가 된다.
 */
export function simulate(counts, seed, minTime = 35) {
  const rnd = mulberry32(seed), rr = (a, b) => a + rnd() * (b - a);
  const balls = [];
  // st: 0 대기 1 판 위 2 리프트 3 탈락 4 워프 중
  counts.forEach((n, o) => { for (let i = 0; i < n; i++) balls.push({ o, x: 0, y: -9, vx: 0, vy: 0, st: 0, ready: 0, t0: 0, sx: 0, nx: 0, side: 1, still: 0, slot: -1, warp: 0 }); });
  for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [balls[i], balls[j]] = [balls[j], balls[i]]; }
  const N = balls.length, gap = Math.min(0.12, 3.6 / Math.max(1, N));
  balls.forEach((b, i) => { b.ready = 0.5 + i * gap; b.nx = rr(-3.6, 3.6); });

  const alive = counts.map(n => n), order = [];
  let owners = alive.filter(n => n > 0).length, ballsAlive = N;
  const events = [], frames = [];
  let safe = new Array(SLOTS).fill(false), sudden = false, nextPhase = 0, lastSpawn = -1, winner = -1, tEnd = -1;
  const CYCLE = 7, SUDDEN_AT = minTime, tmp = [0, 0];
  const flipPrev = FLIPPERS.map(f => f.rest), flipNow = FLIPPERS.map(f => f.rest), flipUp = FLIPPERS.map(() => false);

  // 남은 공 수가 목표 곡선(N개 -> 서든데스 직전 KEEP개)을 따라가도록 SAFE 칸 수를 페이즈마다 조절한다.
  const KEEP = Math.min(N, 4), T0 = 4;
  const goal = tt => N * Math.pow(KEEP / N, Math.min(1, Math.max(0, (tt - T0) / (SUDDEN_AT - T0))));
  function setPhase(t) {
    let k = 0;
    if (t < SUDDEN_AT) {
      const landing = Math.max(1, ballsAlive * PHASE / CYCLE);
      const p = 1 - (ballsAlive - goal(t + PHASE)) / landing;
      k = Math.max(1, Math.min(SLOTS, Math.round(p * SLOTS)));
    } else if (!sudden) { sudden = true; events.push({ t, type: 'sudden' }); }
    const idx = [...Array(SLOTS).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    safe = new Array(SLOTS).fill(false); for (let i = 0; i < k; i++) safe[idx[i]] = true;
    events.push({ t, type: 'phase', safe: safe.slice() });
  }
  // 움직이는(또는 고정) 막대와 공의 충돌. (px,py) 는 회전축, w 는 각속도.
  function hitBar(b, ax, ay, bx, by, th, px, py, w, e, kick) {
    const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy)));
    const cx = ax + dx * u, cy = ay + dy * u, ex = b.x - cx, ey = b.y - cy, m = R + th, d2 = ex * ex + ey * ey;
    if (d2 >= m * m || d2 === 0) return false;
    const d = Math.sqrt(d2), nx = ex / d, ny = ey / d;
    b.x = cx + nx * m; b.y = cy + ny * m;
    const svx = -w * (cy - py), svy = w * (cx - px), vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (vn < 0) { const j = -(1 + e) * vn + kick; b.vx += j * nx; b.vy += j * ny; return true; }
    return false;
  }

  let step = 0, t = 0;
  for (; t < minTime + 60; step++, t = step * DT) {
    if (t >= nextPhase) { setPhase(t); nextPhase += PHASE; }
    FLIPPERS.forEach((f, i) => {
      flipPrev[i] = flipNow[i]; flipNow[i] = flipperAngle(f, t, sudden ? 0 : SUDDEN_AT);
      const up = Math.abs(flipNow[i] - f.rest) > 0.2;
      if (up && !flipUp[i]) events.push({ t, type: 'flip', i });
      flipUp[i] = up;
    });
    for (const b of balls) {
      if (b.st === 2) {
        const k = (t - b.t0) / LIFT_TIME;
        if (k >= 1) { b.st = 0; b.ready = t; } else { liftPos(b, k, tmp); b.x = tmp[0]; b.y = tmp[1]; }
      } else if (b.st === 4 && t - b.t0 >= WARP_TIME) {
        const wp = WARPS[b.warp]; b.st = 1; b.x = wp.ex; b.y = wp.ey; b.vx = wp.evx + rr(-0.6, 0.6); b.vy = wp.evy; b.still = 0;
        events.push({ t, type: 'warpout', i: b.warp });
      }
      if (b.st === 0 && t >= b.ready && t - lastSpawn >= 0.085) {
        b.st = 1; b.x = b.nx; b.y = SPAWN_Y; b.vx = rr(-1.6, 1.6); b.vy = rr(-2, 0); b.still = 0; b.slot = -1; lastSpawn = t;
        events.push({ t, type: 'spawn' });
      }
    }
    for (const b of balls) {
      if (b.st !== 1) continue;
      b.vy -= G * DT; b.vx *= 0.9996; b.vy *= 0.9996;
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (b.x < -HW + R) { b.x = -HW + R; b.vx = Math.abs(b.vx) * 0.8; } else if (b.x > HW - R) { b.x = HW - R; b.vx = -Math.abs(b.vx) * 0.8; }
      if (b.y > H - 0.7 - R) { b.y = H - 0.7 - R; b.vy = -Math.abs(b.vy) * 0.4; }
      const kb = Math.floor(b.y / BUCKET);
      for (let q = kb - 1; q <= kb + 1; q++) {
        const list = buckets.get(q); if (!list) continue;
        for (const p of list) {
          const dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy, m = R + PIN_R;
          if (d2 >= m * m || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          b.x = p.x + nx * m; b.y = p.y + ny * m;
          if (vn < 0) { b.vx -= 1.74 * vn * nx; b.vy -= 1.74 * vn * ny; b.vx += rr(-0.3, 0.3); if (vn < -2.5) events.push({ t, type: 'pin', v: -vn }); }
        }
      }
      for (let i = 0; i < BUMPERS.length; i++) {
        const p = BUMPERS[i], dx = b.x - p.x, dy = b.y - p.y, m = R + p.r, d2 = dx * dx + dy * dy;
        if (d2 >= m * m || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
        b.x = p.x + nx * m; b.y = p.y + ny * m;
        if (vn < 0) { const kick = Math.max(-vn * 1.0, 9); b.vx += (-vn + kick) * nx; b.vy += (-vn + kick) * ny; events.push({ t, type: 'bump', i }); }
      }
      for (const s of SPINNERS) {
        if (Math.abs(b.x - s.x) > s.len + 0.4 || Math.abs(b.y - s.y) > s.len + 0.4) continue;
        const a = spinnerAngle(s, t);
        for (let q = 0; q < 2; q++) {
          const c = Math.cos(a + q * Math.PI / 2) * s.len, sn = Math.sin(a + q * Math.PI / 2) * s.len;
          hitBar(b, s.x - c, s.y - sn, s.x + c, s.y + sn, 0.07, s.x, s.y, s.w, 0.75, 1.5);
        }
      }
      for (let i = 0; i < KICKERS.length; i++) {
        const k = KICKERS[i];
        if (b.y > 6.2 || b.y < 4) continue;
        if (hitBar(b, k.ax, k.ay, k.bx, k.by, 0.08, 0, 0, 0, 0.6, 8)) events.push({ t, type: 'kick', i });
      }
      if (b.y < 4.6 && b.y > 1.4) FLIPPERS.forEach((f, i) => {
        const a = flipNow[i], w = (flipNow[i] - flipPrev[i]) / DT;
        hitBar(b, f.x, f.y, f.x + Math.cos(a) * f.len, f.y + Math.sin(a) * f.len, 0.1, f.x, f.y, w, 0.6, 0);
      });
      if (!sudden) for (let i = 0; i < WARPS.length; i++) {
        const wp = WARPS[i], dx = b.x - wp.x, dy = b.y - wp.y;
        if (dx * dx + dy * dy < 0.3 * 0.3) { b.st = 4; b.t0 = t; b.warp = i; events.push({ t, type: 'warp', i }); break; }
      }
      if (b.st !== 1) continue;
      const sp = Math.hypot(b.vx, b.vy); if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      // 칸막이: 윗부분은 둥근 머리, 그 아래는 곧은 벽
      if (b.y < SLOT_TOP + R + 0.1 && b.slot < 0) {
        for (const x of DIVIDERS) {
          const dx = b.x - x, dy = b.y - SLOT_TOP, m = R + 0.07, d2 = dx * dx + dy * dy;
          if (d2 >= m * m || d2 === 0 || dy < 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          b.x = x + nx * m; b.y = SLOT_TOP + ny * m; if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; b.vx += rr(-0.4, 0.4); }
        }
        if (b.y < SLOT_TOP) b.slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((b.x + HW) / SLOT_W)));
      } else if (b.slot >= 0 && b.y > SLOT_TOP + 0.05) b.slot = -1;
      if (b.slot >= 0) {
        const l = -HW + b.slot * SLOT_W + R + 0.05, r = l + SLOT_W - 2 * R - 0.1;
        if (b.x < l) { b.x = l; b.vx = Math.abs(b.vx) * 0.4; } else if (b.x > r) { b.x = r; b.vx = -Math.abs(b.vx) * 0.4; }
        if (b.y < 0.55) {
          // 서든데스 전에는 마지막 두 사람 중 한 명이 사라지는 일이 없게, 그 공이 들어간 칸을 SAFE 로 뒤집는다.
          if (!sudden && !safe[b.slot] && owners === 2 && alive[b.o] === 1) { safe[b.slot] = true; events.push({ t, type: 'phase', safe: safe.slice(), save: b.slot }); }
          if (safe[b.slot]) {
            b.st = 2; b.t0 = t; b.sx = b.x; b.nx = rr(-3.6, 3.6); b.side = b.x < 0 ? -1 : 1;
            events.push({ t, type: 'safe', slot: b.slot, o: b.o });
          } else {
            b.st = 3; b.x = 0; b.y = -9; ballsAlive--; alive[b.o]--;
            const gone = alive[b.o] === 0;
            events.push({ t, type: 'out', slot: b.slot, o: b.o, gone, left: alive[b.o] });
            if (gone) { order.push(b.o); owners--; if (owners === 1 && winner < 0) { winner = alive.findIndex(n => n > 0); tEnd = t; events.push({ t, type: 'win', o: winner }); } }
          }
          continue;
        }
      }
      if (b.vx * b.vx + b.vy * b.vy < 0.04) { b.still += DT; if (b.still > 0.35) { b.vx = rr(-1.8, 1.8); b.vy = rr(0.5, 2); b.still = 0; } } else b.still = 0;
    }
    for (let i = 0; i < N; i++) {
      const a = balls[i]; if (a.st !== 1) continue;
      for (let j = i + 1; j < N; j++) {
        const c = balls[j]; if (c.st !== 1) continue;
        const dx = c.x - a.x; if (dx > 2 * R || dx < -2 * R) continue;
        const dy = c.y - a.y, d2 = dx * dx + dy * dy; if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (2 * R - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vn < 0) { const imp = -0.92 * vn; a.vx -= imp * nx; a.vy -= imp * ny; c.vx += imp * nx; c.vy += imp * ny; }
      }
    }
    if (step % SUB === 0) for (const b of balls) frames.push(b.st === 1 || b.st === 2 ? b.x : NaN, b.y);
    if (owners <= 1 && (winner < 0 || t > tEnd + 1.2)) break;
  }
  if (winner < 0) { winner = alive.findIndex(n => n > 0); tEnd = t; }
  return { owners: balls.map(b => b.o), frames: new Float32Array(frames), nFrames: frames.length / (2 * N), nBalls: N, fps: FPS, events, winner, order, tEnd, tSudden: SUDDEN_AT };
}
