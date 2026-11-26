// 빠칭코 판 물리. 충돌·반발은 Rapier(2D, WASM)에 맡기고, 여기서는 판 구성과 게임 규칙만 다룬다.
// 화면에서는 실시간으로 step() 을 부르고, 테스트에서는 같은 step() 을 빠르게 돌린다.
import RAPIER from './vendor/rapier2d.mjs';

export const BOARD = { W: 10, H: 17, SLOTS: 9, SLOT_TOP: 1.5, SPAWN_Y: 15.7, TUBE_X: 5.55 };
const { W, H, SLOTS, SLOT_TOP, SPAWN_Y, TUBE_X } = BOARD;
const HW = W / 2, SLOT_W = W / SLOTS;
export const DT = 1 / 120;
const PIN_R = 0.09, G = 17, LIFT_TIME = 1.8, PHASE = 3.0, WARP_TIME = 0.55, MAX_SPEED = 22, CYCLE = 8;

/* ---------- 기믹 배치 ---------- */
export const BUMPERS = [{ x: 0, y: 11.5, r: 0.46 }, { x: -1.9, y: 10.0, r: 0.46 }, { x: 1.9, y: 10.0, r: 0.46 }];
export const SPINNERS = [{ x: -3.0, y: 7.2, len: 0.85, w: 2.4 }, { x: 3.0, y: 7.2, len: 0.85, w: -2.4 }];
export const WARPS = [
  { x: -4.4, y: 9.0, ex: 3.7, ey: 14.6, evx: -2.6, evy: -1 },
  { x: 4.4, y: 9.0, ex: -3.7, ey: 14.6, evx: 2.6, evy: -1 },
];
export const WARP_R = 0.34;
export const KICKERS = [
  { ax: -HW, ay: 5.7, bx: -4.05, by: 4.55 }, { ax: HW, ay: 5.7, bx: 4.05, by: 4.55 },
  { ax: -0.75, ay: 4.75, bx: 0, by: 5.35 }, { ax: 0.75, ay: 4.75, bx: 0, by: 5.35 },
];
export const FLIPPERS = [
  { x: -2.7, y: 2.8, len: 1.25, rest: -0.5, up: 0.55, phase: 0 },
  { x: 2.7, y: 2.8, len: 1.25, rest: Math.PI + 0.5, up: Math.PI - 0.55, phase: 0.85 },
];
const FLIP_PERIOD = 1.7;
function flipperAngle(f, t, on) {
  if (!on) return f.rest;
  const u = (((t - f.phase) % FLIP_PERIOD) + FLIP_PERIOD) % FLIP_PERIOD;
  const k = u < 0.07 ? u / 0.07 : u < 0.22 ? 1 : u < 0.5 ? 1 - (u - 0.22) / 0.28 : 0;
  return f.rest + (f.up - f.rest) * k;
}
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
const SPOUTS = [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75];

export function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const initPhysics = () => RAPIER.init();
/** 공이 많을수록 조금 작게 만들어 판이 막히지 않게 한다. */
/** 공이 아주 많으면 다 쏟아지는 데만 35초를 넘긴다. 그때는 서든데스를 그만큼 늦춘다. */
export const suddenTime = (n, minTime = 35) => Math.max(minTime, n / 62 + 12);
export const ballRadius = n => Math.max(0.115, Math.min(0.19, 0.19 * Math.sqrt(160 / Math.max(1, n))));

// 공 상태
export const QUEUED = 0, ACTIVE = 1, LIFT = 2, OUT = 3, WARP = 4;

export class Game {
  /**
   * @param counts   사람별 공 개수 (0 이면 불참)
   * @param minTime  이 시각(초) 전에는 승부가 나지 않는다. 이때부터 모든 칸이 OUT 인 서든데스가 된다.
   */
  constructor(counts, { minTime = 35, seed = (Math.random() * 2 ** 31) | 0 } = {}) {
    const rnd = this.rnd = mulberry32(seed);
    this.rr = (a, b) => a + rnd() * (b - a);
    this.t = 0; this.stepN = 0; this.events = [];
    const owners = []; counts.forEach((n, o) => { for (let i = 0; i < n; i++) owners.push(o); });
    for (let i = owners.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [owners[i], owners[j]] = [owners[j], owners[i]]; }
    const N = this.N = owners.length, R = this.R = ballRadius(N);
    this.minTime = suddenTime(N, minTime);
    this.owners = owners; this.x = new Float32Array(N); this.y = new Float32Array(N).fill(-9); this.state = new Uint8Array(N);
    this.t0 = new Float32Array(N); this.sx = new Float32Array(N); this.nx = new Int8Array(N); this.lx = new Float32Array(N); this.aux = new Int8Array(N); this.still = new Float32Array(N);
    this.alive = counts.slice(); this.ownersLeft = counts.filter(n => n > 0).length; this.ballsAlive = N; this.active = 0;
    this.order = []; this.winner = -1; this.tEnd = -1; this.sudden = false; this.safe = new Array(SLOTS).fill(false); this.nextPhase = 0;
    this.queue = Array.from({ length: N }, (_, i) => i); this.qHead = 0;
    this.spoutFree = SPOUTS.map(() => 0); this.nextRelease = 0.5; this.releaseGap = Math.max(0.012, Math.min(0.12, 3.6 / Math.max(1, N)));
    this.flipAngle = FLIPPERS.map(f => f.rest); this.flipUp = FLIPPERS.map(() => false); this.spinAngle = SPINNERS.map(() => 0);
    this.KEEP = Math.min(N, 4);

    const world = this.world = new RAPIER.World({ x: 0, y: -G });
    world.timestep = DT;
    this.eq = new RAPIER.EventQueue(true);
    const MAXC = RAPIER.CoefficientCombineRule.Max, EV = RAPIER.ActiveEvents.COLLISION_EVENTS;
    const fixed = (desc, rest = 0.74) => world.createCollider(desc.setRestitution(rest).setRestitutionCombineRule(MAXC).setFriction(0.05));
    for (const p of PINS) fixed(RAPIER.ColliderDesc.ball(PIN_R).setTranslation(p.x, p.y));
    fixed(RAPIER.ColliderDesc.cuboid(0.5, H).setTranslation(-HW - 0.5, H / 2), 0.8);
    fixed(RAPIER.ColliderDesc.cuboid(0.5, H).setTranslation(HW + 0.5, H / 2), 0.8);
    fixed(RAPIER.ColliderDesc.cuboid(W, 0.5).setTranslation(0, H - 0.2), 0.4);
    for (const x of DIVIDERS) fixed(RAPIER.ColliderDesc.capsule(SLOT_TOP / 2, 0.07).setTranslation(x, SLOT_TOP / 2), 0.4);
    this.kind = new Map();   // collider handle -> 기믹
    BUMPERS.forEach((b, i) => this.kind.set(fixed(RAPIER.ColliderDesc.ball(b.r).setTranslation(b.x, b.y).setActiveEvents(EV), 0.9).handle, { type: 'bump', i }));
    KICKERS.forEach((k, i) => {
      const len = Math.hypot(k.bx - k.ax, k.by - k.ay), ang = Math.atan2(k.by - k.ay, k.bx - k.ax);
      const c = fixed(RAPIER.ColliderDesc.capsule(len / 2, 0.08).setTranslation((k.ax + k.bx) / 2, (k.ay + k.by) / 2).setRotation(ang - Math.PI / 2).setActiveEvents(EV), 0.6);
      this.kind.set(c.handle, { type: 'kick', i });
    });
    this.spinBodies = SPINNERS.map(s => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(s.x, s.y).setAngvel(s.w));
      for (let q = 0; q < 2; q++) world.createCollider(RAPIER.ColliderDesc.cuboid(s.len, 0.07).setRotation(q * Math.PI / 2).setRestitution(0.75).setRestitutionCombineRule(MAXC).setFriction(0.1), body);
      return body;
    });
    this.flipBodies = FLIPPERS.map(f => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, f.y).setRotation(f.rest));
      world.createCollider(RAPIER.ColliderDesc.capsule(f.len / 2, 0.1).setTranslation(f.len / 2, 0).setRotation(Math.PI / 2).setRestitution(0.6).setRestitutionCombineRule(MAXC).setFriction(0.2), body);
      return body;
    });
    this.bodies = []; this.ballOf = new Map();
    for (let i = 0; i < N; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -20 - i).setCcdEnabled(true).setCanSleep(false).setLinearDamping(0.03).setAngularDamping(0.5));
      const col = world.createCollider(RAPIER.ColliderDesc.ball(R).setRestitution(0.55).setFriction(0.05).setDensity(1), body);
      body.setEnabled(false); this.bodies.push(body); this.ballOf.set(col.handle, i); this.nx[i] = -1;
    }
  }

  goal(tt) { const T0 = 4; return this.N * Math.pow(this.KEEP / this.N, Math.min(1, Math.max(0, (tt - T0) / (this.minTime - T0)))); }
  // 남은 공 수가 목표 곡선(N개 -> 서든데스 직전 KEEP개)을 따라가도록 SAFE 칸 수를 페이즈마다 조절한다.
  setPhase() {
    const t = this.t; let k = 0;
    if (this.winner >= 0) k = SLOTS;                       // 승부가 난 뒤에는 당첨자 공이 계속 돌게 둔다
    else if (t < this.minTime) {
      const landing = Math.max(1, this.ballsAlive * PHASE / CYCLE);
      k = Math.max(1, Math.min(SLOTS, Math.round((1 - (this.ballsAlive - this.goal(t + PHASE)) / landing) * SLOTS)));
    } else if (!this.sudden) { this.sudden = true; this.events.push({ type: 'sudden' }); }
    const idx = [...Array(SLOTS).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    this.safe = new Array(SLOTS).fill(false); for (let i = 0; i < k; i++) this.safe[idx[i]] = true;
    this.events.push({ type: 'phase', safe: this.safe.slice() });
  }
  // SAFE 칸에 들어간 공이 다시 올라가는 길: 칸 -> 판 아래 -> 옆 튜브 -> 위 -> 투입구
  liftPos(i, k) {
    const side = this.aux[i], sx = this.sx[i], nx = this.lx[i];
    const pts = [[sx, 0.5], [sx, -0.55], [side * TUBE_X, -0.55], [side * TUBE_X, H - 0.45], [nx, H - 0.45], [nx, SPAWN_Y]];
    let total = 0; const len = [];
    for (let j = 1; j < pts.length; j++) { const l = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); len.push(l); total += l; }
    let d = k * total;
    for (let j = 0; j < len.length; j++) {
      if (d <= len[j] || j === len.length - 1) { const u = Math.min(1, d / len[j]); this.x[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u; this.y[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u; return; }
      d -= len[j];
    }
  }
  release(i, x, y, vx, vy) {
    const b = this.bodies[i]; b.setEnabled(true); b.setTranslation({ x, y }, true); b.setLinvel({ x: vx, y: vy }, true); b.setAngvel(0, true);
    this.state[i] = ACTIVE; this.x[i] = x; this.y[i] = y; this.still[i] = 0;
  }
  /** WASM 쪽 메모리는 직접 풀어 줘야 한다. 판을 다시 시작하기 전에 부른다. */
  dispose() { if (this.world) { this.world.free(); this.eq.free(); this.world = null; } }
  park(i, state) { this.bodies[i].setEnabled(false); this.state[i] = state; this.t0[i] = this.t; }

  step() {
    const t = this.t = this.stepN * DT, { rr, events, bodies, state, x, y } = this; this.stepN++;
    if (t >= this.nextPhase) { this.setPhase(); this.nextPhase += PHASE; }
    const flipOn = !this.sudden && this.winner < 0;
    FLIPPERS.forEach((f, i) => {
      const a = this.flipAngle[i] = flipperAngle(f, t, flipOn); this.flipBodies[i].setNextKinematicRotation(a);
      const up = Math.abs(a - f.rest) > 0.2; if (up && !this.flipUp[i]) events.push({ type: 'flip', i }); this.flipUp[i] = up;
    });
    SPINNERS.forEach((s, i) => this.spinAngle[i] = s.w * t);
    // 리프트·워프에서 돌아오는 공
    for (let i = 0; i < this.N; i++) {
      if (state[i] === LIFT) {
        const k = (t - this.t0[i]) / LIFT_TIME;
        if (k >= 1) { state[i] = QUEUED; x[i] = NaN; this.queue.push(i); } else this.liftPos(i, k);
      } else if (state[i] === WARP && t - this.t0[i] >= WARP_TIME) {
        const wp = WARPS[this.aux[i]]; this.release(i, wp.ex, wp.ey, wp.evx + rr(-0.6, 0.6), wp.evy); events.push({ type: 'warpout', i: this.aux[i] });
      }
    }
    // 투입: 투입구가 비어 있으면 대기열에서 하나씩 꺼낸다
    while (this.qHead < this.queue.length && t >= this.nextRelease) {
      let s = -1; const want = this.nx[this.queue[this.qHead]];
      if (want >= 0 && this.spoutFree[want] <= t) s = want;
      else { const o = Math.floor(this.rnd() * SPOUTS.length); for (let k = 0; k < SPOUTS.length; k++) { const c = (o + k) % SPOUTS.length; if (this.spoutFree[c] <= t) { s = c; break; } } }
      if (s < 0) break;
      const i = this.queue[this.qHead++]; this.nx[i] = -1;
      this.spoutFree[s] = t + 0.09; this.nextRelease = Math.max(this.nextRelease + this.releaseGap, t - 0.05);
      this.release(i, SPOUTS[s] + rr(-0.2, 0.2), SPAWN_Y, rr(-1.6, 1.6), rr(-2, 0)); events.push({ type: 'spawn' });
    }
    if (this.qHead > 4096) { this.queue = this.queue.slice(this.qHead); this.qHead = 0; }

    this.world.step(this.eq);

    // 범퍼·키커는 맞는 순간 공을 더 세게 쳐 낸다
    this.eq.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      let g = this.kind.get(h1), bi = this.ballOf.get(h2);
      if (!g) { g = this.kind.get(h2); bi = this.ballOf.get(h1); }
      if (!g || bi === undefined || state[bi] !== ACTIVE) return;
      const body = bodies[bi], p = body.translation(), v = body.linvel(); let nx, ny, min;
      if (g.type === 'bump') { const b = BUMPERS[g.i]; nx = p.x - b.x; ny = p.y - b.y; min = 9; }
      else { const k = KICKERS[g.i], dx = k.bx - k.ax, dy = k.by - k.ay; nx = -dy; ny = dx; if ((p.x - k.ax) * nx + (p.y - k.ay) * ny < 0) { nx = -nx; ny = -ny; } min = 8; }
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const vn = v.x * nx + v.y * ny, add = Math.max(vn, min) - vn;
      body.setLinvel({ x: v.x + nx * add, y: v.y + ny * add }, true); events.push({ type: g.type, i: g.i });
    });

    let active = 0;
    for (let i = 0; i < this.N; i++) {
      if (state[i] !== ACTIVE) continue;
      const body = bodies[i], p = body.translation(); x[i] = p.x; y[i] = p.y; active++;
      // 판 밖으로 튕겨 나갔거나 좌표가 깨진 공은 잃어버리지 않게 투입구로 되돌린다
      if (!(p.x > -HW - 0.6 && p.x < HW + 0.6 && p.y < H + 0.6)) { this.park(i, QUEUED); x[i] = NaN; this.nx[i] = -1; this.queue.push(i); active--; continue; }
      if (p.y < 0.55) {
        const slot = Math.max(0, Math.min(SLOTS - 1, Math.floor((p.x + HW) / SLOT_W))), o = this.owners[i];
        // 서든데스 전에는 마지막 두 사람 중 한 명이 사라지는 일이 없게, 그 공이 들어간 칸을 SAFE 로 뒤집는다.
        if (!this.sudden && this.winner < 0 && !this.safe[slot] && this.ownersLeft === 2 && this.alive[o] === 1) { this.safe[slot] = true; events.push({ type: 'phase', safe: this.safe.slice(), save: slot }); }
        if (this.safe[slot]) {
          this.park(i, LIFT); this.sx[i] = p.x; this.aux[i] = p.x < 0 ? -1 : 1; const sp = Math.floor(this.rnd() * SPOUTS.length); this.nx[i] = sp; this.lx[i] = SPOUTS[sp];
          events.push({ type: 'safe', slot, o });
        } else {
          this.park(i, OUT); x[i] = NaN; y[i] = -9; this.ballsAlive--; this.alive[o]--;
          const gone = this.alive[o] === 0;
          events.push({ type: 'out', slot, o, gone, left: this.alive[o] });
          if (gone) { this.order.push(o); this.ownersLeft--; if (this.ownersLeft === 1 && this.winner < 0) { this.winner = this.alive.findIndex(n => n > 0); this.tEnd = t; this.safe = new Array(SLOTS).fill(true); events.push({ type: 'phase', safe: this.safe.slice() }); events.push({ type: 'win', o: this.winner }); } }
        }
        continue;
      }
      if (!this.sudden) for (let w = 0; w < WARPS.length; w++) {
        const dx = p.x - WARPS[w].x, dy = p.y - WARPS[w].y;
        if (dx * dx + dy * dy < 0.09) { this.park(i, WARP); this.aux[i] = w; x[i] = NaN; events.push({ type: 'warp', i: w }); break; }
      }
      if (state[i] !== ACTIVE || (this.stepN + i) % 4) continue;
      const v = body.linvel(), sp = Math.hypot(v.x, v.y);
      if (sp > MAX_SPEED) body.setLinvel({ x: v.x * MAX_SPEED / sp, y: v.y * MAX_SPEED / sp }, true);
      else if (sp < 0.25) { this.still[i] += DT * 4; if (this.still[i] > 0.4) { body.setLinvel({ x: rr(-2, 2), y: rr(0.5, 2.5) }, true); this.still[i] = 0; } } else this.still[i] = 0;
    }
    this.active = active;
  }
}
