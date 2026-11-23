// Rocket League — Sideswipe-style car soccer for 1 or 2 players
// Side view. Cars drive, rotate in the air, jump, double-jump/flip and boost.
// 3 minute match, first to 10 goals wins, tied = overtime (next goal wins).
const RocketLeague = (() => {
  const W = 800, H = 400, TAU = Math.PI * 2;

  // ── Arena ──────────────────────────────────────────────────────────────────
  const CEIL = 56, FLOOR = 360, WALL_L = 40, WALL_R = 760, GOAL_TOP = 250;
  const BALL_R = 14, CAR_W = 46, CAR_H = 20;

  // ── Rules ──────────────────────────────────────────────────────────────────
  const MATCH_FRAMES = 180 * 60;
  const WIN_SCORE = 10;

  // ── Physics (units are pixels per frame @ 60fps; each frame is 3 sub-steps) ─
  const SUB = 3, HS = 1 / SUB;
  const CAR_GRAV = 0.45, BALL_GRAV = 0.2;
  const JUMP_V = 9.6, DODGE_V = 8, FLIP_FRAMES = 21, FLIP_SPIN = 0.3;
  const AIR_ACC = 0.022, AIR_MAX = 0.14, FAST_FALL = 0.55;
  const GROUND_ACC = 0.45, GROUND_MAX = 6.2, GROUND_FRIC = 0.93;
  const BOOST_ACC = 0.55, BOOST_USE = 0.7, BOOST_REGEN = 0.6;
  const BOOST_GROUND_MAX = 12, MAX_CAR_V = 13;
  const MAX_BALL_V = 15;
  const E_FLOOR = 0.7, E_WALL = 0.8, E_CEIL = 0.6, E_CAR = 0.45;

  const C1 = '#33aaff', C2 = '#ff8a1f';
  const DIFF = {
    easy:   { react: 12, err: 70, lead: 4,  boost: false, flips: false, speed: 0.72 },
    medium: { react: 6,  err: 30, lead: 8,  boost: true,  flips: true,  speed: 0.88 },
    hard:   { react: 2,  err: 10, lead: 12, boost: true,  flips: true,  speed: 1.0  },
  };
  const DIFF_KEYS = ['easy', 'medium', 'hard'];

  const CORNERS = [[-CAR_W / 2, -CAR_H / 2], [CAR_W / 2, -CAR_H / 2], [CAR_W / 2, CAR_H / 2], [-CAR_W / 2, CAR_H / 2]];

  // ── State ──────────────────────────────────────────────────────────────────
  let running = false, animId = null, lastTs = 0, acc = 0, frameN = 0;
  let screen = 'mode';            // 'mode' | 'diff' | 'match'
  let phase = 'countdown';        // 'countdown' | 'play' | 'goal' | 'over'
  let sel = 0, numPlayers = 1, diff = 'medium';
  let cars = [], ball = null, particles = [];
  let scores = [0, 0], timeLeft = MATCH_FRAMES, overtime = false, otFrames = 0;
  let cdFrames = 0, goalFrames = 0, goFlash = 0, lastScorer = 0, winner = -1, shake = 0, soundCd = 0;
  let paused = false, hover = -1;
  let gpXWas = false;
  const keys = {};

  const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight']);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // ── Sound (quiet little synth blips) ───────────────────────────────────────
  let actx = null;
  function audio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
    return actx;
  }
  function tone(freq, dur, type = 'square', vol = 0.035, endFreq = null) {
    const a = audio(); if (!a) return;
    try {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function melody(notes, gap, type, vol) {
    notes.forEach((f, i) => setTimeout(() => { if (running) tone(f, 0.16, type, vol); }, i * gap));
  }

  // ── Match setup ────────────────────────────────────────────────────────────
  function makeCar(team) {
    return {
      team, x: team === 0 ? 190 : 610, y: FLOOR - CAR_H / 2,
      vx: 0, vy: 0, ang: 0, av: 0, facing: team === 0 ? 1 : -1,
      onGround: true, jumps: 0, flipT: 0, boost: 100, boosting: false, jumpPrev: false,
      color: team === 0 ? C1 : C2,
      in: { left: false, right: false, jump: false, fall: false, boost: false },
      ai: (team === 1 && numPlayers === 1) ? { err: 0, errT: 0, jumpCd: 0, last: null } : null,
    };
  }

  function resetKickoff(frames) {
    cars = [makeCar(0), makeCar(1)];
    ball = { x: W / 2, y: 190, vx: 0, vy: 0, rot: 0, trail: [] };
    phase = 'countdown';
    cdFrames = frames;
    goFlash = 0;
    particles = [];
  }

  function startMatch() {
    screen = 'match';
    scores = [0, 0];
    timeLeft = MATCH_FRAMES;
    overtime = false; otFrames = 0;
    winner = -1; paused = false; shake = 0;
    resetKickoff(180);
  }

  function endMatch(w) {
    winner = w;
    phase = 'over';
    melody([523, 659, 784, 1047], 120, 'triangle', 0.04);
  }

  function scoreGoal(team) {
    scores[team]++;
    lastScorer = team;
    phase = 'goal';
    goalFrames = 140;
    shake = 16;
    if (scores[team] >= WIN_SCORE || overtime) winner = team;
    const col = team === 0 ? C1 : C2;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU, s = 1 + Math.random() * 6;
      particles.push({ x: ball.x, y: ball.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 50 + Math.random() * 40, max: 90,
        color: Math.random() < 0.5 ? col : '#ffffff', size: 2 + Math.random() * 3, grav: 0.1 });
    }
    melody([392, 523, 659, 784, 1047], 90, 'square', 0.04);
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function humanInput(c) {
    const k = keys, solo = numPlayers === 1;
    if (c.team === 0) {
      return {
        left: !!(k.KeyA || (solo && k.ArrowLeft)),
        right: !!(k.KeyD || (solo && k.ArrowRight)),
        jump: !!(k.KeyW || (solo && (k.ArrowUp || k.Space))),
        fall: !!(k.KeyS || (solo && k.ArrowDown)),
        boost: !!(k.ShiftLeft || (solo && k.ShiftRight)),
      };
    }
    return { left: !!k.ArrowLeft, right: !!k.ArrowRight, jump: !!k.ArrowUp, fall: !!k.ArrowDown, boost: !!k.ShiftRight };
  }

  // Computer player ----------------------------------------------------------
  function aiInput(c) {
    const d = DIFF[diff], ai = c.ai;
    const inp = { left: false, right: false, jump: false, fall: false, boost: false };
    if (ai.jumpCd > 0) ai.jumpCd--;
    if (--ai.errT <= 0) { ai.errT = 25; ai.err = (Math.random() - 0.5) * 2 * d.err; }

    const atk = c.team === 1 ? -1 : 1;                 // direction of the goal this car attacks
    const px = clamp(ball.x + ball.vx * d.lead, WALL_L + 20, WALL_R - 20);
    const dx = ball.x - c.x, dy = ball.y - c.y, dist = Math.hypot(dx, dy);
    const behind = (c.x - ball.x) * atk <= -4;         // car really is on its own-goal side of the ball

    let tx;
    if (behind) {
      tx = Math.abs(c.x - ball.x) < 90 ? px + atk * 40 : px - atk * 50;  // line up, then drive through the ball
    } else {
      tx = c.team === 1 ? WALL_R - 90 : WALL_L + 90;                  // fall back toward own goal
    }
    tx += ai.err;

    if (c.onGround) {
      const ddx = tx - c.x;
      if (ddx > 10) inp.right = true; else if (ddx < -10) inp.left = true;
      if (d.boost && c.boost > 40 && Math.abs(ddx) > (behind ? 140 : 60) && ddx * c.facing > 0) inp.boost = true;
      if (ai.jumpCd <= 0) {
        if (behind && Math.abs(dx) < 80 && dy < -45) { inp.jump = true; ai.jumpCd = 45; }               // ball is up high
        else if (!behind && Math.abs(dx) < 70 + Math.abs(c.vx) * 5 && dy > -60) { inp.jump = true; ai.jumpCd = 45; }  // hop over the ball, never push it into our own goal
      }
    } else {
      const aim = behind && dist < 230;
      const target = aim ? (c.facing === 1 ? Math.atan2(dy, dx) : Math.atan2(dy, dx) - Math.PI) : 0;
      const diffA = wrapAngle(target - c.ang);
      if (diffA > 0.12) inp.right = true; else if (diffA < -0.12) inp.left = true;
      if (d.boost && aim && Math.abs(diffA) < 0.35 && c.boost > 25) inp.boost = true;
      if (d.flips && behind && c.jumps === 1 && dist < 95 && ai.jumpCd <= 0) {
        inp.jump = true; ai.jumpCd = 60;
        inp.left = atk < 0; inp.right = atk > 0;           // always flip toward the opponent's goal
      }
    }

    // Reaction time: only refresh steering every few frames
    if (ai.last && frameN % d.react !== 0) {
      inp.left = ai.last.left; inp.right = ai.last.right; inp.boost = ai.last.boost;
    } else {
      ai.last = { left: inp.left, right: inp.right, boost: inp.boost };
    }
    return inp;
  }

  // ── Car controls (once per frame) ──────────────────────────────────────────
  function control(c) {
    const i = c.in, sp = c.ai ? DIFF[diff].speed : 1;

    const jumpPressed = i.jump && !c.jumpPrev;
    c.jumpPrev = i.jump;
    if (jumpPressed) {
      if (c.onGround) {
        c.vy = -JUMP_V; c.onGround = false; c.jumps = 1;
        tone(420, 0.08, 'square', 0.025, 640);
      } else if (c.jumps < 2) {
        c.jumps = 2;
        const dir = (i.right && !i.left) ? 1 : (i.left && !i.right) ? -1 : 0;
        if (dir) {                                   // flip: dash sideways while spinning
          c.vx = c.vx * 0.35 + dir * DODGE_V;
          c.vy = Math.min(c.vy, 0) - 2.5;
          c.flipT = FLIP_FRAMES; c.av = dir * FLIP_SPIN;
          tone(300, 0.14, 'sawtooth', 0.025, 700);
        } else {                                     // plain double jump
          c.vy = -JUMP_V * 0.85;
          tone(520, 0.08, 'square', 0.025, 760);
        }
      }
    }

    // Spin
    if (c.flipT > 0) {
      c.flipT--;
      if (c.flipT === 0) c.av *= 0.15;
    } else if (!c.onGround) {
      if (i.left && !i.right) c.av -= AIR_ACC;
      else if (i.right && !i.left) c.av += AIR_ACC;
      else c.av *= 0.93;
      c.av = clamp(c.av, -AIR_MAX, AIR_MAX);
    } else {
      c.av = 0;
    }

    // Drive / fast fall
    if (c.onGround) {
      if (i.left && !i.right) { c.facing = -1; c.vx -= GROUND_ACC * sp; }
      else if (i.right && !i.left) { c.facing = 1; c.vx += GROUND_ACC * sp; }
      else c.vx *= GROUND_FRIC;
    } else if (i.fall) {
      c.vy += FAST_FALL;
    }

    // Boost (refills while on the ground and not boosting)
    if (i.boost && c.boost > 0) {
      c.boosting = true;
      c.boost = Math.max(0, c.boost - BOOST_USE);
      const nx = c.facing * Math.cos(c.ang), ny = c.facing * Math.sin(c.ang);
      c.vx += nx * BOOST_ACC; c.vy += ny * BOOST_ACC;
      for (let k = 0; k < 2; k++) {
        const a = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 0.7, s = 1.5 + Math.random() * 2;
        particles.push({ x: c.x - nx * CAR_W / 2, y: c.y - ny * CAR_W / 2, vx: Math.cos(a) * s + c.vx * 0.3, vy: Math.sin(a) * s + c.vy * 0.3,
          life: 12 + Math.random() * 10, max: 22, color: Math.random() < 0.5 ? '#ffb020' : '#fff2a0', size: 2 + Math.random() * 2.5, grav: 0 });
      }
    } else {
      c.boosting = false;
      if (c.onGround) c.boost = Math.min(100, c.boost + BOOST_REGEN);
    }

    // Speed limits
    const maxG = (c.boosting ? BOOST_GROUND_MAX : GROUND_MAX) * sp;
    if (c.onGround && Math.abs(c.vx) > maxG) c.vx -= Math.sign(c.vx) * Math.min(Math.abs(c.vx) - maxG, 0.35);
    const v = Math.hypot(c.vx, c.vy);
    if (v > MAX_CAR_V) { c.vx *= MAX_CAR_V / v; c.vy *= MAX_CAR_V / v; }
  }

  // ── Collisions ─────────────────────────────────────────────────────────────
  function resolveCarArena(c) {
    const cs = Math.cos(c.ang), sn = Math.sin(c.ang);
    let up = 0, down = 0, left = 0, right = 0, floorHit = false;
    for (const [lx, ly] of CORNERS) {
      const px = c.x + lx * cs - ly * sn, py = c.y + lx * sn + ly * cs;
      if (py > FLOOR) { up = Math.max(up, py - FLOOR); floorHit = true; }
      if (py < CEIL) down = Math.max(down, CEIL - py);
      if (px < WALL_L) {
        if (py < GOAL_TOP) {
          const dx = WALL_L - px, dy = GOAL_TOP - py;
          if (dx <= dy) right = Math.max(right, dx); else down = Math.max(down, dy);
        } else if (px < 0) right = Math.max(right, -px);
      }
      if (px > WALL_R) {
        if (py < GOAL_TOP) {
          const dx = px - WALL_R, dy = GOAL_TOP - py;
          if (dx <= dy) left = Math.max(left, dx); else down = Math.max(down, dy);
        } else if (px > W) left = Math.max(left, px - W);
      }
    }
    c.x += right - left;
    c.y += down - up;
    if (right > 0 && c.vx < 0) c.vx = 0;
    if (left > 0 && c.vx > 0) c.vx = 0;
    if (up > 0 && c.vy > 0) c.vy = 0;
    if (down > 0 && c.vy < 0) c.vy = 0;
    if (floorHit) c.onGround = true;
  }

  function ballArena() {
    const b = ball, r = BALL_R;
    if (b.y + r > FLOOR) {
      b.y = FLOOR - r;
      if (b.vy > 0) b.vy = b.vy > 1.6 ? -b.vy * E_FLOOR : 0;
      b.vx *= Math.pow(0.992, HS);
    }
    if (b.y - r < CEIL) { b.y = CEIL + r; if (b.vy < 0) b.vy = -b.vy * E_CEIL; }

    for (const dir of [1, -1]) {                      // 1 = left wall, -1 = right wall
      const wx = dir === 1 ? WALL_L : WALL_R;
      const inward = (b.x - wx) * dir;
      if (b.y < GOAL_TOP) {
        if (inward < r) { b.x = wx + dir * r; if (b.vx * dir < 0) b.vx = -b.vx * E_WALL; }
      } else if (inward < 0) {                         // inside the goal pocket: roof above it
        if (b.y - r < GOAL_TOP) { b.y = GOAL_TOP + r; if (b.vy < 0) b.vy = -b.vy * 0.4; }
      } else if (inward < r) {                         // goal post corner
        const dx = b.x - wx, dy = b.y - GOAL_TOP, d = Math.hypot(dx, dy);
        if (d < r && d > 0) {
          const nx = dx / d, ny = dy / d;
          b.x = wx + nx * r; b.y = GOAL_TOP + ny * r;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
        }
      }
    }
    // back of the nets
    if (b.x - r < 0) { b.x = r; if (b.vx < 0) b.vx = -b.vx * 0.4; }
    if (b.x + r > W) { b.x = W - r; if (b.vx > 0) b.vx = -b.vx * 0.4; }
  }

  function carBall(c) {
    const b = ball, cs = Math.cos(c.ang), sn = Math.sin(c.ang);
    const dx = b.x - c.x, dy = b.y - c.y;
    const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;       // ball in the car's own frame
    const hw = CAR_W / 2, hh = CAR_H / 2;
    let cx = clamp(lx, -hw, hw), cy = clamp(ly, -hh, hh);
    let nx = lx - cx, ny = ly - cy, dist = Math.hypot(nx, ny);
    if (dist >= BALL_R) return;
    if (dist < 0.0001) {                                          // centre is inside the car: push out the short way
      const px = hw - Math.abs(lx), py = hh - Math.abs(ly);
      if (px < py) { nx = Math.sign(lx) || 1; ny = 0; cx = nx * hw; cy = ly; }
      else { nx = 0; ny = Math.sign(ly) || -1; cx = lx; cy = ny * hh; }
      dist = 0;
    } else { nx /= dist; ny /= dist; }
    const wnx = nx * cs - ny * sn, wny = nx * sn + ny * cs;       // normal in world coords
    const rx = cx * cs - cy * sn, ry = cx * sn + cy * cs;         // contact offset from the car centre
    const cvx = c.vx - c.av * ry, cvy = c.vy + c.av * rx;         // car speed at the contact point (includes spin)
    const pen = BALL_R - dist;
    b.x += wnx * pen; b.y += wny * pen;
    const vn = (b.vx - cvx) * wnx + (b.vy - cvy) * wny;
    if (vn < 0) {
      const j = -(1 + E_CAR) * vn;
      const kick = 1 + (c.flipT > 0 ? 3.5 : 0) + (c.boosting ? 1 : 0);
      b.vx += wnx * (j + kick); b.vy += wny * (j + kick);
      c.vx -= wnx * j * 0.06; c.vy -= wny * j * 0.06;
      if (j > 3.5 && soundCd <= 0) {
        soundCd = 6;
        tone(150 + Math.random() * 60, 0.07, 'triangle', Math.min(0.09, 0.015 + j * 0.006), 70);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * TAU, s = 1 + Math.random() * 3;
          particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 12, max: 12, color: '#ffffff', size: 2, grav: 0 });
        }
      }
    }
    const v = Math.hypot(b.vx, b.vy);
    if (v > MAX_BALL_V) { b.vx *= MAX_BALL_V / v; b.vy *= MAX_BALL_V / v; }
  }

  function carCar() {
    const a = cars[0], b = cars[1];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), R = 21;
    if (d >= R * 2 || d === 0) return;
    const nx = dx / d, ny = dy / d, pen = R * 2 - d;
    a.x -= nx * pen / 2; a.y -= ny * pen / 2;
    b.x += nx * pen / 2; b.y += ny * pen / 2;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const j = -(1 + 0.4) * vn / 2;
      a.vx -= nx * j; a.vy -= ny * j;
      b.vx += nx * j; b.vy += ny * j;
    }
  }

  // ── Physics step ───────────────────────────────────────────────────────────
  function substep() {
    for (const c of cars) {
      c.onGround = false;
      c.vy += CAR_GRAV * HS;
      c.x += c.vx * HS; c.y += c.vy * HS; c.ang += c.av * HS;
      resolveCarArena(c);
    }
    ball.vy += BALL_GRAV * HS;
    ball.vx *= Math.pow(0.9985, HS);
    ball.x += ball.vx * HS; ball.y += ball.vy * HS;
    ball.rot += (ball.vx / BALL_R) * HS;
    ballArena();
    for (const c of cars) carBall(c);
    carCar();
    for (const c of cars) resolveCarArena(c);
  }

  function physics() {
    if (soundCd > 0) soundCd--;
    for (const c of cars) { c.in = c.ai ? aiInput(c) : humanInput(c); control(c); }
    for (let s = 0; s < SUB; s++) substep();
    for (const c of cars) {
      c.ang = wrapAngle(c.ang);
      if (c.onGround) {                               // land, then roll back onto the wheels
        c.jumps = 0; c.flipT = 0; c.av = 0;
        c.ang *= 0.72; if (Math.abs(c.ang) < 0.002) c.ang = 0;
      } else if (c.jumps === 0) c.jumps = 1;
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 7) { ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 9) ball.trail.shift(); }
    else if (ball.trail.length) ball.trail.shift();
  }

  function updateParticles() {
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--; }
    particles = particles.filter(p => p.life > 0);
  }

  function pollGamepadX() {
    let now = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) { if (!gp) continue; if (gp.buttons[0]?.pressed) now = true; break; }
    const fired = now && !gpXWas;
    gpXWas = now;
    return fired;
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update() {
    frameN++;
    const gpX = pollGamepadX();
    if (screen !== 'match') return;
    if (shake > 0) shake = Math.max(0, shake - 0.6);
    if (goFlash > 0) goFlash--;
    if (paused) return;

    if (phase === 'over') {
      updateParticles();
      if (gpX) { stop(); showMenu(); }
      return;
    }
    if (phase === 'countdown') {
      cdFrames--;
      if (cdFrames > 0 && cdFrames % 60 === 0) tone(440, 0.12, 'square', 0.03);
      if (cdFrames <= 0) { phase = 'play'; goFlash = 45; tone(880, 0.3, 'square', 0.04); }
      updateParticles();
      return;
    }

    if (phase === 'goal') {
      goalFrames--;
      if (frameN % 2 === 0) physics();               // slow motion
      updateParticles();
      if (goalFrames <= 0) {
        if (winner >= 0) endMatch(winner); else resetKickoff(120);
      }
      return;
    }

    // phase === 'play'
    physics();
    updateParticles();
    if (!overtime) {
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        if (scores[0] === scores[1]) { overtime = true; melody([330, 330, 440], 140, 'square', 0.04); }
        else { endMatch(scores[0] > scores[1] ? 0 : 1); return; }
      }
    } else otFrames++;

    if (ball.y > GOAL_TOP && ball.x + BALL_R < WALL_L) scoreGoal(1);
    else if (ball.y > GOAL_TOP && ball.x - BALL_R > WALL_R) scoreGoal(0);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  const STARS = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.3, t: Math.random() * TAU }));

  function drawCarShape(color, boosting, big) {
    // Drawn pointing right, wheels down, centred on (0,0). Collision box is 46x20.
    ctx.shadowColor = color; ctx.shadowBlur = big ? 14 : 10;
    ctx.fillStyle = color;
    rrect(-23, -2, 46, 9, 3); ctx.fill();                               // lower body
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-8, -10); ctx.lineTo(9, -10); ctx.lineTo(16, -2); ctx.closePath(); ctx.fill();   // cabin
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(210,240,255,0.85)';
    ctx.beginPath(); ctx.moveTo(-8, -3.5); ctx.lineTo(-4, -8.5); ctx.lineTo(7, -8.5); ctx.lineTo(11, -3.5); ctx.closePath(); ctx.fill();  // window
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-23, 3, 46, 2);   // stripe
    ctx.fillStyle = '#fff6a8'; ctx.fillRect(20, 0, 3, 3);               // headlight
    ctx.fillStyle = '#ff4466'; ctx.fillRect(-23, 0, 2, 3);              // tail light
    ctx.fillStyle = '#111';
    for (const wx of [-13, 13]) { ctx.beginPath(); ctx.arc(wx, 6, 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#bbb';
    for (const wx of [-13, 13]) { ctx.beginPath(); ctx.arc(wx, 6, 1.5, 0, TAU); ctx.fill(); }
    if (boosting) {
      ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffb020';
      const f = 10 + Math.random() * 8;
      ctx.beginPath(); ctx.moveTo(-23, -1); ctx.lineTo(-23 - f, 2); ctx.lineTo(-23, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff2a0';
      ctx.beginPath(); ctx.moveTo(-23, 0); ctx.lineTo(-23 - f * 0.55, 2); ctx.lineTo(-23, 4); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.ang); ctx.scale(c.facing, 1);
    drawCarShape(c.color, c.boosting, false);
    ctx.restore();
  }

  function drawBall() {
    ball.trail.forEach((t, i) => {
      ctx.fillStyle = `rgba(255,255,255,${(i / ball.trail.length) * 0.18})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (0.5 + i / ball.trail.length * 0.5), 0, TAU); ctx.fill();
    });
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#f4f4ff';
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.rotate(ball.rot);
    ctx.fillStyle = '#333';
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 2.8, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawArena() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#06001a'); g.addColorStop(1, '#14004a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    STARS.forEach(s => {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(frameN * 0.03 + s.t)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });

    // grid
    ctx.strokeStyle = 'rgba(130,110,255,0.07)'; ctx.lineWidth = 1;
    for (let x = WALL_L; x <= WALL_R; x += 40) { ctx.beginPath(); ctx.moveTo(x, CEIL); ctx.lineTo(x, FLOOR); ctx.stroke(); }
    for (let y = FLOOR; y >= CEIL; y -= 40) { ctx.beginPath(); ctx.moveTo(WALL_L, y); ctx.lineTo(WALL_R, y); ctx.stroke(); }

    // centre line + circle
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(W / 2, CEIL); ctx.lineTo(W / 2, FLOOR); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(W / 2, FLOOR, 70, Math.PI, TAU); ctx.stroke();

    // goals
    for (const side of [0, 1]) {
      const x0 = side === 0 ? 0 : WALL_R, col = side === 0 ? '51,170,255' : '255,138,31';
      ctx.fillStyle = `rgba(${col},0.16)`; ctx.fillRect(x0, GOAL_TOP, WALL_L, FLOOR - GOAL_TOP);
      ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = 1;
      for (let y = GOAL_TOP; y <= FLOOR; y += 12) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + WALL_L, y); ctx.stroke(); }
      for (let x = x0; x <= x0 + WALL_L; x += 10) { ctx.beginPath(); ctx.moveTo(x, GOAL_TOP); ctx.lineTo(x, FLOOR); ctx.stroke(); }
    }

    // below the floor
    ctx.fillStyle = '#0a0524'; ctx.fillRect(0, FLOOR, W, H - FLOOR);

    // outline
    ctx.strokeStyle = '#8fa8ff'; ctx.lineWidth = 3; ctx.shadowColor = '#6a7dff'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, FLOOR); ctx.lineTo(0, GOAL_TOP); ctx.lineTo(WALL_L, GOAL_TOP); ctx.lineTo(WALL_L, CEIL);
    ctx.lineTo(WALL_R, CEIL); ctx.lineTo(WALL_R, GOAL_TOP); ctx.lineTo(W, GOAL_TOP); ctx.lineTo(W, FLOOR);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
    ctx.shadowBlur = 0;
    // goal posts glow in team colours
    ctx.lineWidth = 4;
    ctx.strokeStyle = C1; ctx.shadowColor = C1; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(0, GOAL_TOP); ctx.lineTo(WALL_L, GOAL_TOP); ctx.stroke();
    ctx.strokeStyle = C2; ctx.shadowColor = C2;
    ctx.beginPath(); ctx.moveTo(WALL_R, GOAL_TOP); ctx.lineTo(W, GOAL_TOP); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function fmtTime(frames) {
    const s = Math.ceil(frames / 60);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function drawBoostBar(x, align, c) {
    const w = 180, bx = align === 'left' ? x : x - w;
    ctx.textAlign = align; ctx.font = 'bold 10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('BOOST', x, 372);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; rrect(bx, 377, w, 10, 5); ctx.fill();
    const frac = c.boost / 100;
    if (frac > 0.01) {
      ctx.fillStyle = frac < 0.25 ? '#ff4455' : c.color;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = c.boosting ? 12 : 4;
      rrect(bx, 377, Math.max(10, w * frac), 10, 5); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawHUD() {
    // scores
    ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillStyle = C1;
    ctx.fillText(numPlayers === 1 ? 'YOU' : 'PLAYER 1', 20, 16);
    ctx.font = 'bold 34px monospace'; ctx.shadowColor = C1; ctx.shadowBlur = 10;
    ctx.fillText(scores[0], 20, 47);
    ctx.textAlign = 'right'; ctx.font = 'bold 12px monospace'; ctx.fillStyle = C2; ctx.shadowBlur = 0;
    ctx.fillText(numPlayers === 1 ? 'CPU' : 'PLAYER 2', W - 20, 16);
    ctx.font = 'bold 34px monospace'; ctx.shadowColor = C2; ctx.shadowBlur = 10;
    ctx.fillText(scores[1], W - 20, 47);
    ctx.shadowBlur = 0;

    // timer
    ctx.textAlign = 'center';
    if (overtime) {
      ctx.fillStyle = Math.floor(frameN / 20) % 2 ? '#ff4455' : '#ff9aa5';
      ctx.font = 'bold 22px monospace'; ctx.fillText('OVERTIME', W / 2, 30);
      ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('NEXT GOAL WINS  ' + fmtTime(otFrames + 59), W / 2, 48);
    } else {
      ctx.fillStyle = timeLeft < 600 ? '#ff6677' : '#ffffff';
      ctx.font = 'bold 28px monospace'; ctx.fillText(fmtTime(timeLeft), W / 2, 34);
      ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('FIRST TO ' + WIN_SCORE, W / 2, 49);
    }

    if (cars.length) { drawBoostBar(20, 'left', cars[0]); drawBoostBar(W - 20, 'right', cars[1]); }
    ctx.textAlign = 'center'; ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(numPlayers === 1 ? 'WASD or ARROWS  ·  SHIFT = boost  ·  ESC = menu' : 'P1: A D W S L-SHIFT   |   P2: ← → ↑ ↓ R-SHIFT', W / 2, 385);
  }

  function bigText(text, y, size, color, glow) {
    ctx.textAlign = 'center'; ctx.font = `bold ${size}px monospace`;
    ctx.fillStyle = color; ctx.shadowColor = glow || color; ctx.shadowBlur = 24;
    ctx.fillText(text, W / 2, y); ctx.shadowBlur = 0;
  }

  function drawOverlays() {
    if (phase === 'countdown' && cdFrames > 0) {
      const n = Math.ceil(cdFrames / 60), t = (cdFrames % 60) / 60;
      ctx.save(); ctx.globalAlpha = 0.4 + 0.6 * t;
      bigText(String(n), 250, 90 + (1 - t) * -10 + t * 20, '#ffffff', '#6a7dff');
      ctx.restore();
    }
    if (goFlash > 0) { ctx.save(); ctx.globalAlpha = goFlash / 45; bigText('GO!', 235, 80, '#66ff99'); ctx.restore(); }
    if (phase === 'goal') {
      const col = lastScorer === 0 ? C1 : C2;
      bigText('GOAL!', 190, 76, col);
      ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#fff';
      const who = numPlayers === 1 ? (lastScorer === 0 ? 'YOU SCORE!' : 'CPU SCORES') : 'PLAYER ' + (lastScorer + 1) + ' SCORES!';
      ctx.fillText(who, W / 2, 222);
    }
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      bigText('PAUSED', 190, 54, '#ffffff', '#6a7dff');
      ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('P = resume    ESC = back to menu', W / 2, 225);
    }
    if (phase === 'over') {
      ctx.fillStyle = 'rgba(3,0,16,0.78)'; ctx.fillRect(0, 0, W, H);
      const col = winner === 0 ? C1 : C2;
      ctx.textAlign = 'center'; ctx.font = '14px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('FULL TIME', W / 2, 100);
      const txt = numPlayers === 1 ? (winner === 0 ? 'YOU WIN!' : 'CPU WINS') : 'PLAYER ' + (winner + 1) + ' WINS!';
      bigText(txt, 170, 56, col);
      ctx.font = 'bold 44px monospace'; ctx.fillStyle = '#fff';
      ctx.fillText(scores[0] + '  -  ' + scores[1], W / 2, 235);
      ctx.font = '15px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('ENTER = play again      ESC = menu', W / 2, 300);
    }
  }

  function drawMatch() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawArena();
    cars.forEach(drawCar);
    drawBall();
    drawParticles();
    ctx.restore();
    drawHUD();
    drawOverlays();
  }

  // ── Start / difficulty screens ─────────────────────────────────────────────
  function buttons() {
    if (screen === 'mode') return [{ x: 90, y: 120, w: 290, h: 130 }, { x: 420, y: 120, w: 290, h: 130 }];
    return [0, 1, 2].map(i => ({ x: 50 + i * 240, y: 130, w: 220, h: 110 }));
  }

  function drawMenuScreens() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#030010'); g.addColorStop(1, '#0f0036');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    STARS.forEach(s => {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(frameN * 0.04 + s.t)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });

    ctx.textAlign = 'center';
    ctx.shadowColor = C1; ctx.shadowBlur = 20 + Math.sin(frameN * 0.06) * 8;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 40px monospace';
    ctx.fillText('ROCKET LEAGUE', W / 2, 62);
    ctx.shadowBlur = 0;
    ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(screen === 'mode' ? 'Car soccer  ·  3 minutes  ·  first to 10 goals wins' : 'CHOOSE THE CPU DIFFICULTY', W / 2, 88);

    const bs = buttons();
    if (screen === 'mode') {
      const data = [
        { t: '1 PLAYER', s: 'vs the computer', col: C1, n: 1 },
        { t: '2 PLAYERS', s: 'same keyboard', col: C2, n: 2 },
      ];
      data.forEach((d, i) => {
        const b = bs[i], on = sel === i;
        ctx.shadowColor = d.col; ctx.shadowBlur = on ? 28 : 8;
        ctx.strokeStyle = d.col; ctx.lineWidth = on ? 3 : 1.5;
        ctx.fillStyle = on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
        rrect(b.x, b.y - (on ? 6 : 0), b.w, b.h, 14); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        const cy = b.y - (on ? 6 : 0);
        ctx.save(); ctx.translate(b.x + b.w / 2 - (d.n === 2 ? 38 : 0), cy + 38); ctx.scale(1.2, 1.2); drawCarShape(C1, false, true); ctx.restore();
        if (d.n === 2) { ctx.save(); ctx.translate(b.x + b.w / 2 + 38, cy + 38); ctx.scale(-1.2, 1.2); drawCarShape(C2, false, true); ctx.restore(); }
        else { ctx.save(); ctx.translate(b.x + b.w / 2 + 70, cy + 38); ctx.scale(-0.9, 0.9); ctx.globalAlpha = 0.45; drawCarShape('#aaaaaa', false, false); ctx.restore(); }
        ctx.textAlign = 'center';
        ctx.fillStyle = d.col; ctx.font = 'bold 24px monospace'; ctx.fillText(d.t, b.x + b.w / 2, cy + 88);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px monospace'; ctx.fillText(d.s, b.x + b.w / 2, cy + 108);
      });
      ctx.font = '12px monospace'; ctx.textAlign = 'center';
      const lines = [
        ['P1:  A / D move + rotate  ·  W jump (press again = flip)  ·  S fast fall  ·  L-SHIFT boost', C1],
        ['P2:  ← / → move + rotate  ·  ↑ jump (press again = flip)  ·  ↓ fast fall  ·  R-SHIFT boost', C2],
      ];
      lines.forEach((l, i) => { ctx.fillStyle = l[1]; ctx.fillText(l[0], W / 2, 295 + i * 20); });
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('Boost refills while you are on the ground.   Pick with A/D or ←/→ + ENTER, or click.   ESC = menu', W / 2, 350);
    } else {
      const data = [
        { t: 'EASY', s: 'slow & forgiving', col: '#66ff99' },
        { t: 'MEDIUM', s: 'a fair fight', col: '#ffd24a' },
        { t: 'HARD', s: 'fast, boosts & flips', col: '#ff5566' },
      ];
      data.forEach((d, i) => {
        const b = bs[i], on = sel === i, by = b.y - (on ? 6 : 0);
        ctx.shadowColor = d.col; ctx.shadowBlur = on ? 28 : 8;
        ctx.strokeStyle = d.col; ctx.lineWidth = on ? 3 : 1.5;
        ctx.fillStyle = on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
        rrect(b.x, by, b.w, b.h, 14); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.fillStyle = d.col; ctx.font = 'bold 28px monospace'; ctx.fillText(d.t, b.x + b.w / 2, by + 56);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px monospace'; ctx.fillText(d.s, b.x + b.w / 2, by + 82);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('Pick with A/D or ←/→ + ENTER, or click.   ESC = back', W / 2, 300);
    }
    ctx.textAlign = 'left';
  }

  function draw() {
    if (screen === 'match') drawMatch(); else drawMenuScreens();
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop(ts) {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts; acc += dt;
    while (acc >= 1 / 60) { update(); acc -= 1 / 60; }
    draw();
  }

  // ── Menu choosing ──────────────────────────────────────────────────────────
  function choose(i) {
    audio();
    if (screen === 'mode') {
      if (i === 0) { numPlayers = 1; screen = 'diff'; sel = 1; }
      else { numPlayers = 2; startMatch(); }
    } else if (screen === 'diff') {
      diff = DIFF_KEYS[i]; startMatch();
    }
  }

  function onKeyDown(e) {
    if (BLOCK.has(e.code)) e.preventDefault();
    const wasDown = keys[e.code];
    keys[e.code] = true;
    if (wasDown) return;
    const code = e.code;

    if (code === 'Escape') {
      if (screen === 'diff') { screen = 'mode'; sel = 0; return; }
      stop(); showMenu(); return;
    }
    if (screen !== 'match') {
      const n = screen === 'mode' ? 2 : 3;
      if (code === 'ArrowLeft' || code === 'KeyA') sel = (sel + n - 1) % n;
      else if (code === 'ArrowRight' || code === 'KeyD') sel = (sel + 1) % n;
      else if (code === 'Enter' || code === 'Space') choose(sel);
      else if (code === 'Digit1' || code === 'Numpad1') choose(0);
      else if (code === 'Digit2' || code === 'Numpad2') choose(1);
      else if ((code === 'Digit3' || code === 'Numpad3') && n === 3) choose(2);
      return;
    }
    if (code === 'KeyP' && (phase === 'play' || phase === 'goal' || phase === 'countdown')) { paused = !paused; return; }
    if (phase === 'over' && (code === 'Enter' || code === 'Space' || code === 'KeyR')) startMatch();
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onBlur() { Object.keys(keys).forEach(k => delete keys[k]); if (screen === 'match' && phase === 'play') paused = true; }

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }
  function onMove(e) {
    if (screen === 'match') { canvas.style.cursor = 'default'; return; }
    const p = canvasPos(e);
    hover = buttons().findIndex(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y - 6 && p.y <= b.y + b.h);
    if (hover >= 0) sel = hover;
    canvas.style.cursor = hover >= 0 ? 'pointer' : 'default';
  }
  function onClick(e) {
    if (screen === 'match') { if (phase === 'over') startMatch(); return; }
    const p = canvasPos(e);
    const i = buttons().findIndex(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y - 6 && p.y <= b.y + b.h);
    if (i >= 0) choose(i);
  }

  // ── Cleanup / public API ───────────────────────────────────────────────────
  function stop() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('click', onClick);
    canvas.style.cursor = 'default';
    Object.keys(keys).forEach(k => delete keys[k]);
  }

  function start() {
    stop();
    running = true;
    hideTouchControls();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    screen = 'mode'; sel = 0; paused = false; frameN = 0; acc = 0;
    cars = []; ball = null; particles = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    gpXWas = false;
    for (const gp of pads) { if (!gp) continue; if (gp.buttons[0]?.pressed) gpXWas = true; break; }
    lastTs = performance.now();
    animId = requestAnimationFrame(loop);
  }

  return { start, stop };
})();
