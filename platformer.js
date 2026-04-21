const Platformer = (() => {
  const W = 800, H = 400;

  let state, level, lives, coins, totalCoins, score, frameCount, stateTimer, shakeFrames, hoveredLevel;
  let player, platforms, enemies, collectibles, movingPlatforms, hazards, exitPortal, particles, bouncePads;
  let camX, keys, animFrame;

  const GP_DEAD = 0.2;
  const gpState = { left: false, right: false };
  let gpWasJump = false;

  function pollGamepad() {
    gpState.left = gpState.right = false;
    let jumpNow = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      if (gp.axes[0] < -GP_DEAD) gpState.left  = true;
      if (gp.axes[0] >  GP_DEAD) gpState.right = true;
      if (gp.axes[1] < -0.5 || gp.buttons[0]?.pressed) jumpNow = true;
      break;
    }
    if (jumpNow && !gpWasJump) doJump();
    gpWasJump = jumpNow;
  }

  // ── level definitions ──
  // Each platform: [x, y, w, h]  (world coords)
  // Exit portal at far right of each level

  const LEVELS = [
    {
      name: 'GRASSLANDS', color: '#4caf50', stars: 1, feature: null,
      bg: ['#1a3a1a', '#2d6e2d'], groundColor: '#4caf50', platColor: '#388e3c',
      width: 2200,
      platforms: [
        [0, 340, 400, 60],       // start ground
        [460, 300, 120, 20],
        [640, 260, 100, 20],
        [800, 300, 160, 20],
        [1020, 340, 300, 60],
        [1080, 270, 80, 20],
        [1220, 230, 100, 20],
        [1380, 290, 200, 20],
        [1640, 340, 200, 60],
        [1700, 270, 100, 20],
        [1880, 300, 160, 20],
        [2000, 340, 200, 60],
      ],
      enemies: [
        { x: 200, type: 'basic' },
        { x: 870, type: 'basic' },
        { x: 1100, type: 'basic' },
        { x: 1420, type: 'basic' },
        { x: 1720, type: 'basic' },
      ],
      coins: [
        480, 510, 660, 820, 860, 900, 1090, 1240, 1390, 1430, 1710, 1900, 1940,
      ].map((x, i) => ({ x, y: i % 3 === 0 ? 270 : 210 })),
      moving: [],
      hazards: [],
      exitX: 2080,
    },
    {
      name: 'SKY ISLANDS', color: '#00aaff', stars: 2, feature: 'MOVING PLATS',
      bg: ['#0d1a40', '#1a3a80'], groundColor: '#00aaff', platColor: '#0077cc',
      width: 2600,
      platforms: [
        [0, 340, 300, 60],
        [360, 290, 80, 20],
        [500, 250, 80, 20],
        [640, 210, 100, 20],
        [800, 260, 80, 20],
        [950, 300, 80, 20],
        [1090, 250, 100, 20],
        [1260, 210, 80, 20],
        [1400, 260, 120, 20],
        [1580, 300, 80, 20],
        [1720, 250, 100, 20],
        [1880, 200, 80, 20],
        [2020, 260, 120, 20],
        [2200, 310, 80, 20],
        [2360, 340, 240, 60],
      ],
      enemies: [
        { x: 380, type: 'basic' },
        { x: 820, type: 'fast' },
        { x: 1110, type: 'basic' },
        { x: 1440, type: 'fast' },
        { x: 1740, type: 'fast' },
        { x: 2040, type: 'basic' },
        { x: 2220, type: 'fast' },
      ],
      coins: [
        370, 510, 660, 810, 960, 1110, 1280, 1420, 1600, 1740, 1900, 2040, 2220,
      ].map((x, i) => ({ x, y: 170 + (i % 2) * 30 })),
      moving: [
        { x: 1100, y: 310, w: 90, h: 18, range: 120, speed: 1.2 },
        { x: 1800, y: 270, w: 90, h: 18, range: 100, speed: 1.6 },
      ],
      hazards: [],
      exitX: 2440,
    },
    {
      name: 'LAVA CAVES', color: '#ff4400', stars: 3, feature: 'LAVA',
      bg: ['#200000', '#4a0000'], groundColor: '#cc2200', platColor: '#8b1a00',
      width: 2800,
      platforms: [
        [0, 340, 280, 60],
        [340, 300, 100, 20],
        [500, 260, 80, 20],
        [640, 300, 80, 20],
        [780, 260, 100, 20],
        [940, 300, 80, 20],
        [1080, 250, 120, 20],
        [1270, 300, 80, 20],
        [1420, 260, 80, 20],
        [1560, 310, 80, 20],
        [1700, 270, 100, 20],
        [1860, 300, 80, 20],
        [2000, 260, 100, 20],
        [2160, 300, 80, 20],
        [2300, 260, 120, 20],
        [2460, 310, 80, 20],
        [2560, 340, 240, 60],
      ],
      enemies: [
        { x: 360, type: 'basic' },
        { x: 660, type: 'fast' },
        { x: 800, type: 'armored' },
        { x: 1100, type: 'fast' },
        { x: 1290, type: 'basic' },
        { x: 1580, type: 'armored' },
        { x: 1720, type: 'fast' },
        { x: 2020, type: 'armored' },
        { x: 2320, type: 'fast' },
      ],
      coins: [
        350, 520, 660, 800, 960, 1100, 1290, 1440, 1580, 1720, 1880, 2020, 2180, 2320, 2480,
      ].map((x, i) => ({ x, y: 220 + (i % 3) * 20 })),
      moving: [
        { x: 480, y: 270, w: 80, h: 18, range: 100, speed: 1.4 },
        { x: 1250, y: 270, w: 80, h: 18, range: 110, speed: 1.8 },
        { x: 2140, y: 280, w: 80, h: 18, range: 90, speed: 2 },
      ],
      hazards: [
        [300, 358, 30, 8], [420, 358, 50, 8], [580, 358, 40, 8],
        [730, 358, 40, 8], [870, 358, 60, 8], [1020, 358, 40, 8],
        [1200, 358, 50, 8], [1360, 358, 50, 8], [1510, 358, 40, 8],
        [1650, 358, 50, 8], [1820, 358, 30, 8], [1970, 358, 50, 8],
        [2120, 358, 40, 8], [2280, 358, 50, 8], [2430, 358, 30, 8],
      ],
      exitX: 2630,
    },
    {
      name: 'ICE WORLD', color: '#88ccff', stars: 3, feature: 'WALL JUMP',
      bg: ['#060d1a', '#0d2040'], groundColor: '#88ccff', platColor: '#2266aa',
      features: ['ice'],
      width: 2800,
      platforms: [
        [0, 340, 300, 60],
        [360, 300, 65, 20],
        [490, 255, 60, 20],
        [620, 300, 60, 20],
        [750, 255, 60, 20],
        [870, 340, 90, 60],
        // Wall jump corridor 1: left wall right-edge=1000, right wall left=1060, gap=60px
        [980, 85, 20, 265],
        [1060, 85, 20, 265],
        [945, 65, 155, 22],   // high platform above corridor
        [1120, 190, 70, 20],
        [1260, 135, 70, 20],
        [1410, 190, 80, 20],
        [1550, 245, 65, 20],
        [1690, 180, 80, 20],
        [1820, 340, 80, 60],
        // Wall jump corridor 2: left wall right-edge=1960, right wall left=2030, gap=70px
        [1940, 80, 20, 270],
        [2030, 80, 20, 270],
        [1920, 58, 140, 24],  // very high platform above corridor
        [2095, 165, 70, 20],
        [2230, 215, 80, 20],
        [2390, 265, 80, 20],
        [2540, 340, 260, 60],
      ],
      enemies: [
        { x: 380, type: 'fast' }, { x: 640, type: 'fast' },
        { x: 1140, type: 'fast' }, { x: 1430, type: 'armored' },
        { x: 1710, type: 'fast' }, { x: 2115, type: 'fast' },
        { x: 2250, type: 'armored' },
      ],
      coins: [
        { x: 395, y: 268 }, { x: 510, y: 223 }, { x: 640, y: 268 }, { x: 770, y: 223 },
        { x: 890, y: 308 },
        { x: 1008, y: 195 }, { x: 1008, y: 135 }, { x: 990, y: 30 }, { x: 1025, y: 30 },
        { x: 1155, y: 158 }, { x: 1290, y: 103 }, { x: 1445, y: 158 }, { x: 1585, y: 213 },
        { x: 1965, y: 190 }, { x: 1972, y: 128 }, { x: 1965, y: 22 }, { x: 1998, y: 22 },
        { x: 2120, y: 133 }, { x: 2255, y: 183 }, { x: 2415, y: 233 }, { x: 2565, y: 308 },
      ],
      moving: [],
      hazards: [],
      bouncePads: [],
      exitX: 2620,
    },
    {
      name: 'SHADOW REALM', color: '#aa44ff', stars: 4, feature: 'DARKNESS',
      bg: ['#020205', '#080818'], groundColor: '#330055', platColor: '#1a0030',
      features: ['dark'],
      width: 2600,
      platforms: [
        [0, 340, 260, 60],
        [320, 285, 80, 20], [470, 245, 80, 20], [620, 285, 80, 20],
        [780, 245, 80, 20], [940, 290, 80, 20], [1100, 245, 80, 20],
        [1260, 285, 80, 20], [1420, 235, 100, 20], [1580, 275, 80, 20],
        [1740, 235, 80, 20], [1900, 280, 80, 20], [2060, 240, 80, 20],
        [2220, 290, 80, 20], [2380, 340, 220, 60],
      ],
      enemies: [
        { x: 340, type: 'fast' }, { x: 490, type: 'armored' },
        { x: 640, type: 'fast' }, { x: 800, type: 'armored' },
        { x: 960, type: 'fast' }, { x: 1280, type: 'armored' },
        { x: 1440, type: 'fast' }, { x: 1600, type: 'armored' },
        { x: 1760, type: 'fast' }, { x: 2080, type: 'armored' },
      ],
      coins: [
        { x: 360, y: 253 }, { x: 510, y: 213 }, { x: 660, y: 253 }, { x: 820, y: 213 },
        { x: 980, y: 258 }, { x: 1140, y: 213 }, { x: 1300, y: 253 }, { x: 1460, y: 203 },
        { x: 1620, y: 243 }, { x: 1780, y: 203 }, { x: 1940, y: 248 }, { x: 2100, y: 208 },
        { x: 2260, y: 258 }, { x: 2400, y: 308 },
      ],
      moving: [
        { x: 380, y: 295, w: 80, h: 18, range: 130, speed: 1.6 },
        { x: 700, y: 255, w: 80, h: 18, range: 110, speed: 2.1 },
        { x: 1120, y: 255, w: 80, h: 18, range: 150, speed: 1.9 },
        { x: 1540, y: 245, w: 80, h: 18, range: 130, speed: 2.3 },
        { x: 1920, y: 250, w: 80, h: 18, range: 120, speed: 2 },
        { x: 2200, y: 270, w: 80, h: 18, range: 110, speed: 1.8 },
      ],
      hazards: [
        [305, 356, 12, 8], [455, 356, 12, 8], [605, 356, 12, 8],
        [765, 356, 12, 8], [925, 356, 12, 8], [1085, 356, 12, 8],
        [1245, 356, 12, 8], [1405, 356, 12, 8], [1565, 356, 12, 8],
        [1725, 356, 12, 8], [1885, 356, 12, 8], [2045, 356, 12, 8],
        [2205, 356, 12, 8],
      ],
      bouncePads: [],
      exitX: 2460,
    },
    {
      name: 'NEON BOUNCE', color: '#cc00ff', stars: 5, feature: 'BOUNCE PADS',
      bg: ['#080018', '#160035'], groundColor: '#cc00ff', platColor: '#660088',
      features: ['bounce'],
      width: 2800,
      platforms: [
        [0, 340, 240, 60],
        [320, 270, 70, 20],
        [470, 200, 70, 20],
        [640, 270, 70, 20],
        [800, 340, 100, 60],   // ground bounce-pad zone
        [960, 155, 80, 20],    // high — need bounce
        [1130, 245, 75, 20],
        [1290, 155, 75, 20],   // high again
        [1460, 280, 75, 20],
        [1620, 340, 100, 60],  // ground bounce-pad zone
        [1790, 120, 80, 20],   // VERY HIGH
        [1960, 210, 75, 20],
        [2120, 155, 75, 20],
        [2290, 220, 80, 20],
        [2460, 270, 80, 20],
        [2620, 340, 200, 60],
      ],
      enemies: [
        { x: 340, type: 'fast' }, { x: 490, type: 'basic' },
        { x: 980, type: 'armored' }, { x: 1310, type: 'fast' },
        { x: 1480, type: 'armored' }, { x: 1810, type: 'fast' },
        { x: 1980, type: 'armored' }, { x: 2310, type: 'fast' },
      ],
      coins: [
        { x: 355, y: 238 }, { x: 490, y: 168 }, { x: 660, y: 238 },
        { x: 975, y: 123 }, { x: 1000, y: 123 },
        { x: 1150, y: 213 }, { x: 1305, y: 123 }, { x: 1330, y: 123 },
        { x: 1480, y: 248 }, { x: 1805, y: 88 }, { x: 1830, y: 88 },
        { x: 1975, y: 178 }, { x: 2135, y: 123 }, { x: 2160, y: 123 },
        { x: 2305, y: 188 }, { x: 2475, y: 238 }, { x: 2640, y: 308 },
      ],
      moving: [
        { x: 350, y: 280, w: 75, h: 18, range: 100, speed: 1.5 },
        { x: 1200, y: 265, w: 75, h: 18, range: 90, speed: 1.8 },
        { x: 2050, y: 225, w: 75, h: 18, range: 110, speed: 2 },
      ],
      hazards: [],
      bouncePads: [
        [250, 328, 60, 14],
        [820, 328, 60, 14],
        [1640, 328, 60, 14],
        [2600, 328, 60, 14],
      ],
      exitX: 2700,
    },
  ];

  const ENEMY_DEFS = {
    basic:   { color: '#ff3333', accent: '#ff8888', w: 28, h: 28, speed: 1.2, maxHp: 1 },
    fast:    { color: '#aa00ff', accent: '#dd88ff', w: 24, h: 24, speed: 2.2, maxHp: 1 },
    armored: { color: '#888888', accent: '#cccccc', w: 32, h: 30, speed: 0.9, maxHp: 2 },
  };

  // ── level select helpers ──
  function cardBounds(i) {
    const CW = 200, CH = 145, GAP = 12;
    const sx = (W - (3 * CW + 2 * GAP)) / 2;
    return { x: sx + (i % 3) * (CW + GAP), y: 80 + Math.floor(i / 3) * (CH + GAP), w: CW, h: CH };
  }

  function canvasXY(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? (e.touches[0] || e.changedTouches[0]) : e;
    return {
      mx: (src.clientX - r.left) * (W / r.width),
      my: (src.clientY - r.top)  * (H / r.height),
    };
  }

  function drawSelect() {
    ctx.fillStyle = '#0a140a'; ctx.fillRect(0, 0, W, H);

    // Scrolling grid
    const gOff = (Date.now() / 60) % 50;
    ctx.strokeStyle = 'rgba(76,175,80,0.07)'; ctx.lineWidth = 1;
    for (let x = gOff - 50; x < W + 50; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.shadowColor = '#4caf50'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#4caf50'; ctx.font = 'bold 30px monospace';
    ctx.fillText('CHOOSE LEVEL', W / 2, 44);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px monospace';
    ctx.fillText('Click a card  •  Press 1–6  •  ESC = main menu', W / 2, 64);

    LEVELS.forEach((lv, i) => {
      const b  = cardBounds(i);
      const hov = hoveredLevel === i;
      const cy  = b.y + (hov ? -7 : 0);

      ctx.shadowColor = lv.color; ctx.shadowBlur = hov ? 26 : 8;
      ctx.strokeStyle = lv.color; ctx.lineWidth = hov ? 2.5 : 1.5;
      ctx.fillStyle   = hov ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.roundRect(b.x, cy, b.w, b.h, 10); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = lv.color + (hov ? 'cc' : '88');
      ctx.beginPath(); ctx.roundRect(b.x, cy, b.w, 7, [10, 10, 0, 0]); ctx.fill();

      ctx.shadowColor = lv.color; ctx.shadowBlur = 10;
      ctx.fillStyle = lv.color; ctx.font = 'bold 28px monospace';
      ctx.fillText(i + 1, b.x + b.w / 2, cy + 46); ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px monospace';
      ctx.fillText(lv.name, b.x + b.w / 2, cy + 68);

      ctx.fillStyle = '#ffdd00'; ctx.font = '12px monospace';
      ctx.fillText('★'.repeat(lv.stars) + '☆'.repeat(5 - lv.stars), b.x + b.w / 2, cy + 88);

      if (lv.feature) {
        ctx.fillStyle = lv.color + 'bb'; ctx.font = 'bold 10px monospace';
        ctx.fillText(lv.feature, b.x + b.w / 2, cy + 108);
      }

      if (hov) {
        ctx.shadowColor = lv.color; ctx.shadowBlur = 8;
        ctx.fillStyle = lv.color; ctx.font = 'bold 12px monospace';
        ctx.fillText('▶  PLAY', b.x + b.w / 2, cy + b.h - 10); ctx.shadowBlur = 0;
      }
    });

    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '11px monospace';
    ctx.fillText('ARROWS / SPACE to play  •  wall jump on ICE WORLD', W / 2, H - 12);
    ctx.textAlign = 'left';
  }

  function startSelectedLevel(idx) {
    level    = idx;
    lives    = 3; coins = 0; score = 0; frameCount = 0;
    hoveredLevel = -1;
    canvas.style.cursor = 'default';
    showTouchControls('platformer');
    state = 'playing';
    loadLevel();
  }

  // ── helpers ──
  function rng(a, b) { return Math.random() * (b - a) + a; }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ── init ──
  function initGame() {
    level = 0; lives = 3; coins = 0; score = 0; frameCount = 0;
    loadLevel();
  }

  function loadLevel() {
    const ld = LEVELS[level];
    camX = 0; stateTimer = 0; shakeFrames = 0;
    particles = [];

    player = {
      x: 60, y: 260,
      w: 28, h: 28,
      vx: 0, vy: 0,
      onGround: false,
      touchingWallLeft: false, touchingWallRight: false,
      coyoteTimer: 0,
      jumpsLeft: 2,
      facing: 1,
      animFrame: 0,
      damaged: 0,
      rotation: 0,
    };

    platforms = ld.platforms.map(([x, y, w, h]) => ({ x, y, w, h }));

    movingPlatforms = ld.moving.map(m => ({
      x: m.x, y: m.y, w: m.w, h: m.h,
      originX: m.x, range: m.range, speed: m.speed, dir: 1,
    }));

    hazards = ld.hazards.map(([x, y, w, h]) => ({ x, y, w, h }));

    enemies = ld.enemies.map(e => {
      const def = ENEMY_DEFS[e.type];
      return {
        x: e.x, y: 0,
        w: def.w, h: def.h,
        vx: def.speed, type: e.type,
        color: def.color, accent: def.accent,
        hp: def.maxHp, maxHp: def.maxHp,
        onGround: false,
      };
    });

    bouncePads = (ld.bouncePads || []).map(([x, y, w, h]) => ({ x, y, w, h }));
    collectibles = ld.coins.map(c => ({ x: c.x, y: c.y, r: 9, collected: false, anim: 0 }));
    totalCoins = collectibles.length;

    exitPortal = { x: ld.exitX, y: 240, w: 40, h: 100 };
    state = 'playing';
  }

  // ── particles ──
  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rng(0, Math.PI * 2), spd = rng(1.5, 5);
      particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 2, r: rng(2, 5), color, life: 1, decay: rng(0.03, 0.06) });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.95; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── physics helpers ──
  function resolveVsStatics(ent, plats) {
    ent.touchingWallLeft = false;
    ent.touchingWallRight = false;
    // vertical
    ent.y += ent.vy;
    plats.forEach(p => {
      if (!overlap(ent.x, ent.y, ent.w, ent.h, p.x, p.y, p.w, p.h)) return;
      if (ent.vy > 0) { ent.y = p.y - ent.h; ent.vy = 0; ent.onGround = true; }
      else if (ent.vy < 0) { ent.y = p.y + p.h; ent.vy = 0; }
    });
    // horizontal
    ent.x += ent.vx;
    plats.forEach(p => {
      if (!overlap(ent.x, ent.y, ent.w, ent.h, p.x, p.y, p.w, p.h)) return;
      if (ent.vx > 0) { ent.x = p.x - ent.w; ent.vx = 0; ent.touchingWallRight = true; }
      else if (ent.vx < 0) { ent.x = p.x + p.w; ent.vx = 0; ent.touchingWallLeft = true; }
    });
  }

  // ── update sections ──
  function updatePlayer() {
    const ld = LEVELS[level];
    player.animFrame++;
    if (player.damaged > 0) player.damaged--;

    pollGamepad();

    // Horizontal
    const hasIce = (ld.features || []).includes('ice');
    const accel = hasIce ? 0.55 : 0.8, maxSpd = 5;
    if (keys['ArrowLeft'] || keys['KeyA'] || gpState.left)  { player.vx -= accel; player.facing = -1; }
    else if (keys['ArrowRight'] || keys['KeyD'] || gpState.right) { player.vx += accel; player.facing = 1; }
    else { player.vx *= hasIce ? 0.93 : 0.75; }
    player.vx = Math.max(-maxSpd, Math.min(maxSpd, player.vx));

    // Gravity
    player.vy = Math.min(player.vy + 0.55, 14);

    // Coyote time + rotation snap on landing
    if (player.onGround) {
      player.coyoteTimer = 6; player.jumpsLeft = 2;
      player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
    }
    else if (player.coyoteTimer > 0) player.coyoteTimer--;

    player.onGround = false;

    // Resolve vs static platforms
    const allPlats = [...platforms, ...movingPlatforms];
    resolveVsStatics(player, allPlats);

    // Wall slide — slow descent while pressing against a wall mid-air
    if ((player.touchingWallLeft || player.touchingWallRight) && !player.onGround && player.vy > 0) {
      player.vy = Math.min(player.vy, 2.5);
    }

    // Bounce pads
    bouncePads.forEach(bp => {
      if (overlap(player.x, player.y, player.w, player.h, bp.x, bp.y, bp.w, bp.h)) {
        player.vy = -16;
        player.y = bp.y - player.h;
        player.jumpsLeft = 2;
        burst(player.x + player.w / 2, bp.y, '#ff8800', 14);
        shakeFrames = 3;
      }
    });

    // World bounds
    player.x = Math.max(0, player.x);
    if (player.x + player.w > ld.width) player.x = ld.width - player.w;

    // Fall death
    if (player.y > H + 50) takeDamage(true);

    // Hazards (lava)
    hazards.forEach(hz => {
      if (overlap(player.x, player.y, player.w, player.h, hz.x, hz.y, hz.w, hz.h)) takeDamage(true);
    });

    // Enemy collisions
    enemies.forEach((e, i) => {
      if (!overlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) return;
      const playerBottom = player.y + player.h;
      const enemyTop = e.y;
      if (player.vy > 0 && playerBottom - e.h * 0.35 < enemyTop + 10) {
        // Stomp
        e.hp--;
        player.vy = -9;
        burst(e.x + e.w / 2, e.y, e.color, 12);
        shakeFrames = 5;
        if (e.hp <= 0) { enemies.splice(i, 1); score += 100; }
      } else if (player.damaged === 0) {
        takeDamage(false);
      }
    });

    // Coins
    collectibles.forEach(c => {
      if (c.collected) return;
      if (overlap(player.x, player.y, player.w, player.h, c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)) {
        c.collected = true; coins++; score += 10;
        burst(c.x, c.y, '#ffcc00', 8);
      }
    });

    // Exit portal
    if (overlap(player.x, player.y, player.w, player.h, exitPortal.x, exitPortal.y, exitPortal.w, exitPortal.h)) {
      score += lives * 50;
      if (level >= LEVELS.length - 1) { state = 'win'; }
      else { state = 'levelclear'; stateTimer = 90; }
    }

    // Camera
    const targetCam = player.x - W * 0.35;
    camX += (targetCam - camX) * 0.12;
    camX = Math.max(0, Math.min(LEVELS[level].width - W, camX));
  }

  function takeDamage(resetPos) {
    if (player.damaged > 0) return;
    lives--;
    player.damaged = 90;
    shakeFrames = 18;
    burst(player.x + player.w / 2, player.y + player.h / 2, '#ff4444', 16);
    if (lives <= 0) { state = 'gameover'; return; }
    if (resetPos) { player.x = 60; player.y = 260; player.vx = 0; player.vy = 0; camX = 0; }
  }

  function updateEnemies() {
    const allPlats = [...platforms, ...movingPlatforms];
    enemies.forEach(e => {
      e.vy = (e.vy || 0) + 0.55;
      e.vy = Math.min(e.vy, 14);
      e.onGround = false;
      resolveVsStatics(e, allPlats);

      // Reverse at platform edges
      if (e.onGround) {
        const ahead = { x: e.x + e.vx * 10 + (e.vx > 0 ? e.w : 0), y: e.y + e.h + 4, w: 4, h: 4 };
        const onEdge = !allPlats.some(p => overlap(ahead.x, ahead.y, ahead.w, ahead.h, p.x, p.y, p.w, p.h));
        const hitWall = e.x <= 0 || e.x + e.w >= LEVELS[level].width;
        if (onEdge || hitWall || (e.vx === 0)) e.vx = -e.vx || ENEMY_DEFS[e.type].speed;
      }

      if (e.y > H + 80) e.y = -40;
    });
  }

  function updateMovingPlatforms() {
    movingPlatforms.forEach(mp => {
      mp.x += mp.speed * mp.dir;
      if (mp.x > mp.originX + mp.range || mp.x < mp.originX) mp.dir *= -1;

      // Carry player
      if (player.onGround &&
          overlap(player.x, player.y + player.h - 2, player.w, 4, mp.x, mp.y, mp.w, mp.h)) {
        player.x += mp.speed * mp.dir;
      }
    });
  }

  function doJump() {
    if (state !== 'playing') return;
    // Wall jump — kicks off walls when airborne and coyote time expired
    if (!player.onGround && player.coyoteTimer === 0 &&
        (player.touchingWallLeft || player.touchingWallRight)) {
      player.vy = -12;
      player.vx = player.touchingWallLeft ? 6 : -6;
      burst(player.touchingWallLeft ? player.x : player.x + player.w,
            player.y + player.h / 2, '#00eaff', 10);
      return;
    }
    if (player.coyoteTimer > 0 || player.jumpsLeft > 0) {
      const isDouble = player.coyoteTimer === 0;
      player.vy = isDouble ? -10 : -12;
      player.jumpsLeft = Math.max(0, player.jumpsLeft - 1);
      player.coyoteTimer = 0;
      burst(player.x + player.w / 2, player.y + player.h, '#aaffaa', 6);
    }
  }

  // ── draw ──
  function drawBg() {
    const ld = LEVELS[level];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, ld.bg[0]); grad.addColorStop(1, ld.bg[1]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // Parallax decorations
    if (level === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 12; i++) {
        const bx = ((i * 190 - camX * 0.3) % (W + 200)) - 100;
        ctx.beginPath(); ctx.ellipse(bx, 80 + (i % 3) * 40, 40 + i * 5, 20, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (level === 1) {
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 73 - camX * 0.1) % W + W) % W;
        const sy = (i * 53) % H;
        ctx.beginPath(); ctx.arc(sx, sy, 0.8 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 4) * 0.1})`; ctx.fill();
      }
    }
    if (level === 2) {
      ctx.fillStyle = 'rgba(255,80,0,0.07)';
      for (let i = 0; i < 8; i++) {
        const fx = ((i * 310 - camX * 0.4) % (W + 400)) - 200;
        ctx.beginPath(); ctx.ellipse(fx, H - 20, 60, 30, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (level === 3) {
      // Ice crystals / snowflakes
      ctx.fillStyle = 'rgba(140,210,255,0.06)';
      for (let i = 0; i < 14; i++) {
        const bx = ((i * 170 - camX * 0.2) % (W + 200)) - 100;
        ctx.beginPath(); ctx.arc(bx, 40 + (i % 4) * 50, 18 + (i % 3) * 8, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (level === 4) {
      // Floating purple motes
      for (let i = 0; i < 30; i++) {
        const bx = ((i * 61 - camX * 0.08) % W + W) % W;
        const by = (i * 47) % H;
        ctx.beginPath(); ctx.arc(bx, by, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,60,255,${0.15 + (i % 5) * 0.05})`; ctx.fill();
      }
    }
    if (level === 5) {
      // Neon grid lines
      ctx.strokeStyle = 'rgba(200,0,255,0.06)'; ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const gx = ((i * 80 - camX * 0.15) % (W + 80)) - 40;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let j = 0; j < 6; j++) {
        ctx.beginPath(); ctx.moveTo(0, j * 70); ctx.lineTo(W, j * 70); ctx.stroke();
      }
    }
  }

  function worldToScreen(x) { return x - camX; }

  function drawPlatforms() {
    const ld = LEVELS[level];
    const allPlats = [...platforms, ...movingPlatforms];
    allPlats.forEach(p => {
      const sx = worldToScreen(p.x);
      if (sx + p.w < 0 || sx > W) return;

      // Main body
      ctx.fillStyle = ld.platColor;
      ctx.fillRect(sx, p.y, p.w, p.h);
      // Top highlight
      ctx.fillStyle = ld.groundColor;
      ctx.fillRect(sx, p.y, p.w, 5);
      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx, p.y + p.h, p.w, 4);
    });
  }

  function drawHazards() {
    const ld = LEVELS[level];
    hazards.forEach(hz => {
      const sx = worldToScreen(hz.x);
      if (sx + hz.w < 0 || sx > W) return;
      ctx.fillStyle = '#ff6600';
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 10;
      ctx.fillRect(sx, hz.y, hz.w, hz.h);
      ctx.shadowBlur = 0;
      // Lava shimmer
      ctx.fillStyle = `rgba(255,200,0,${0.3 + 0.3 * Math.sin(frameCount * 0.15 + hz.x * 0.05)})`;
      ctx.fillRect(sx, hz.y, hz.w, hz.h / 2);
    });
  }

  function drawEnemies() {
    enemies.forEach(e => {
      const sx = worldToScreen(e.x);
      if (sx + e.w < -10 || sx > W + 10) return;
      ctx.shadowColor = e.color; ctx.shadowBlur = 10;
      if (e.type === 'basic') {
        ctx.fillStyle = e.color;
        ctx.fillRect(sx, e.y, e.w, e.h);
        ctx.fillStyle = e.accent;
        ctx.fillRect(sx + 4, e.y + 4, e.w - 8, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx + 6, e.y + 6, 5, 5);
        ctx.fillRect(sx + e.w - 11, e.y + 6, 5, 5);
        ctx.fillStyle = '#000000';
        ctx.fillRect(sx + 7, e.y + 7, 3, 3);
        ctx.fillRect(sx + e.w - 10, e.y + 7, 3, 3);
      } else if (e.type === 'fast') {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(sx + e.w / 2, e.y);
        ctx.lineTo(sx, e.y + e.h);
        ctx.lineTo(sx + e.w / 4, e.y + e.h * 0.6);
        ctx.lineTo(sx + e.w / 2, e.y + e.h * 0.85);
        ctx.lineTo(sx + e.w * 3 / 4, e.y + e.h * 0.6);
        ctx.lineTo(sx + e.w, e.y + e.h);
        ctx.closePath(); ctx.fill();
      } else {
        // Armored
        ctx.fillStyle = e.color; ctx.fillRect(sx, e.y, e.w, e.h);
        ctx.fillStyle = e.accent; ctx.fillRect(sx + 4, e.y + 4, e.w - 8, e.h - 8);
        if (e.hp < e.maxHp) {
          ctx.fillStyle = '#ff0000'; ctx.fillRect(sx, e.y - 6, e.w, 4);
          ctx.fillStyle = '#ff6666'; ctx.fillRect(sx, e.y - 6, (e.hp / e.maxHp) * e.w, 4);
        }
      }
      ctx.shadowBlur = 0;
    });
  }

  function drawPlayer() {
    const sx = worldToScreen(player.x);
    const flash = player.damaged > 0 && Math.floor(player.damaged / 6) % 2 === 0;
    if (flash) return;

    const cx = sx + player.w / 2;
    const cy = player.y + player.h / 2;

    // Rotate: spin while airborne, roll along ground
    if (player.onGround) {
      player.rotation += player.vx * 0.055;
    } else {
      player.rotation += (player.facing || 1) * 0.07;
    }

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, player.y + player.h + 3, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wall-slide sparkles
    if ((player.touchingWallLeft || player.touchingWallRight) && !player.onGround) {
      const wx = player.touchingWallLeft ? sx : sx + player.w;
      ctx.fillStyle = '#00eaff';
      for (let i = 0; i < 3; i++) {
        const fy = player.y + (i / 2) * player.h;
        ctx.beginPath();
        ctx.arc(wx + (Math.random() - 0.5) * 6, fy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.rotation);

    const hw = player.w / 2; // 14

    // Outer body
    ctx.fillStyle = '#336600';
    ctx.fillRect(-hw, -hw, player.w, player.w);

    // Glowing border
    ctx.shadowColor = '#aaff00';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#aaff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(-hw + 1, -hw + 1, player.w - 2, player.w - 2);
    ctx.shadowBlur = 0;

    // Inner square
    ctx.fillStyle = '#77cc00';
    ctx.fillRect(-hw + 6, -hw + 6, player.w - 12, player.w - 12);
    ctx.strokeStyle = '#aaff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(-hw + 6, -hw + 6, player.w - 12, player.w - 12);

    // Corner pips
    ctx.fillStyle = '#aaff00';
    const p = 2, s = 3;
    ctx.fillRect(-hw + p, -hw + p, s, s);
    ctx.fillRect( hw - p - s, -hw + p, s, s);
    ctx.fillRect(-hw + p,  hw - p - s, s, s);
    ctx.fillRect( hw - p - s,  hw - p - s, s, s);

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function drawBouncePads() {
    bouncePads.forEach(bp => {
      const sx = worldToScreen(bp.x);
      if (sx + bp.w < 0 || sx > W) return;
      const pulse = 0.6 + 0.4 * Math.sin(frameCount * 0.14);
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(sx, bp.y, bp.w, bp.h);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(sx + 2, bp.y + 2, bp.w - 4, Math.floor(bp.h / 2) - 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('▲', sx + bp.w / 2, bp.y + bp.h - 2);
      ctx.textAlign = 'left';
    });
  }

  function drawCoins() {
    collectibles.forEach(c => {
      if (c.collected) return;
      const sx = worldToScreen(c.x);
      if (sx < -20 || sx > W + 20) return;
      c.anim++;
      const bob = Math.sin(c.anim * 0.08) * 3;
      ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(sx, c.y + bob, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffee88';
      ctx.beginPath(); ctx.arc(sx - 2, c.y + bob - 2, c.r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawExitPortal() {
    const sx = worldToScreen(exitPortal.x);
    if (sx < -50 || sx > W + 50) return;
    const pulse = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20 * pulse;
    ctx.strokeStyle = `rgba(0,255,136,${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, exitPortal.y, exitPortal.w, exitPortal.h);
    ctx.fillStyle = `rgba(0,255,136,${0.15 * pulse})`;
    ctx.fillRect(sx, exitPortal.y, exitPortal.w, exitPortal.h);
    ctx.fillStyle = `rgba(0,255,136,${pulse})`;
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EXIT', sx + exitPortal.w / 2, exitPortal.y + exitPortal.h / 2 + 4);
    ctx.textAlign = 'left'; ctx.shadowBlur = 0;
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.shadowColor = p.color; ctx.shadowBlur = 6; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(worldToScreen(p.x), p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawHUD() {
    const ld = LEVELS[level];
    // Hearts
    for (let i = 0; i < 3; i++) {
      const hx = 12 + i * 24, hy = 10;
      ctx.font = '18px monospace';
      ctx.fillStyle = i < lives ? '#ff4444' : 'rgba(255,255,255,0.2)';
      ctx.fillText('♥', hx, hy + 16);
    }
    // Level name
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${level + 1} — ${ld.name}`, W / 2, 22);
    ctx.textAlign = 'left';
    // Coins
    ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 6;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`⬤ ${coins}`, W - 100, 22);
    ctx.shadowBlur = 0;
    // Score
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '12px monospace';
    ctx.fillText(`${score}`, W - 100, 40);
    // ESC hint
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '11px monospace';
    ctx.fillText('ESC = MENU', W - 100, 58);
    if (level === 0 && frameCount < 300) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ARROWS to move  •  SPACE to jump (double-jump!)', W / 2, H - 12);
      ctx.textAlign = 'left';
    }
    if (level === 3 && frameCount < 420) {
      ctx.fillStyle = 'rgba(0,234,255,0.7)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 6;
      ctx.fillText('ICE: slippery!  •  WALL JUMP: press JUMP while touching a wall', W / 2, H - 12);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }
    if (level === 4 && frameCount < 360) {
      ctx.fillStyle = 'rgba(180,80,255,0.8)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#bb44ff'; ctx.shadowBlur = 6;
      ctx.fillText('SHADOW REALM: enemies lurk in the dark — follow the coins!', W / 2, H - 12);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }
    if (level === 5 && frameCount < 360) {
      ctx.fillStyle = 'rgba(255,140,0,0.8)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 6;
      ctx.fillText('NEON BOUNCE: land on orange pads for mega-jumps!', W / 2, H - 12);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }
  }

  function drawOverlay() {
    if (state === 'levelclear') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#aaff00'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#aaff00'; ctx.font = 'bold 52px monospace';
      ctx.fillText('LEVEL CLEAR!', W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '18px monospace';
      ctx.fillText('Get ready for next level...', W / 2, H / 2 + 30);
      ctx.textAlign = 'left';
    }
    if (state === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 52px monospace';
      ctx.fillText('YOU WIN!', W / 2, 120);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 178);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '16px monospace';
      ctx.fillText(`Coins: ${coins} / ${totalCoins}    Lives left: ${lives}`, W / 2, 212);
      ctx.fillStyle = '#aaff00'; ctx.shadowColor = '#aaff00'; ctx.shadowBlur = 10;
      ctx.font = '20px monospace'; ctx.fillText('SPACE  — level select', W / 2, 278); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '16px monospace';
      ctx.fillText('ESC  — main menu', W / 2, 308);
      ctx.textAlign = 'left';
    }
    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#ff3333'; ctx.font = 'bold 56px monospace';
      ctx.fillText('GAME OVER', W / 2, 120);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 178);
      ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 10;
      ctx.font = '20px monospace'; ctx.fillText('SPACE  — try again', W / 2, 278); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '16px monospace';
      ctx.fillText('ESC  — level select', W / 2, 308);
      ctx.textAlign = 'left';
    }
  }

  // ── main loop ──
  function update() {
    frameCount++;
    if (shakeFrames > 0) shakeFrames--;
    if (state === 'levelclear') {
      stateTimer--;
      updateParticles();
      if (stateTimer <= 0) { level++; loadLevel(); }
      return;
    }
    if (state === 'win' || state === 'gameover') { updateParticles(); return; }
    updateMovingPlatforms();
    updateEnemies();
    updatePlayer();
    updateParticles();
  }

  function draw() {
    if (state === 'select') { drawSelect(); return; }
    ctx.save();
    if (shakeFrames > 0) {
      const m = shakeFrames * 0.5;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBg();
    drawHazards();
    drawBouncePads();
    drawPlatforms();
    drawExitPortal();
    drawCoins();
    drawEnemies();
    drawParticles();
    drawPlayer();
    // Dark-level spotlight overlay
    if ((LEVELS[level].features || []).includes('dark')) {
      const px = worldToScreen(player.x + player.w / 2);
      const py = player.y + player.h / 2;
      const grd = ctx.createRadialGradient(px, py, 28, px, py, 190);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.45, 'rgba(0,0,0,0.65)');
      grd.addColorStop(1, 'rgba(0,0,0,0.97)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    drawHUD();
    drawOverlay();
  }

  function gameLoop() { if (state !== 'select') update(); draw(); animFrame = requestAnimationFrame(gameLoop); }

  // ── input ──
  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Escape') {
      if (state === 'select') { stop(); showMenu(); return; }
      state = 'select'; hideTouchControls(); keys = {}; hoveredLevel = -1;
      canvas.style.cursor = 'default'; return;
    }
    if (state === 'select') {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 6) startSelectedLevel(n - 1);
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (state === 'win')      { state = 'select'; hideTouchControls(); hoveredLevel = -1; return; }
      if (state === 'gameover') { lives = 3; coins = 0; score = 0; frameCount = 0; state = 'playing'; loadLevel(); return; }
      doJump();
    }
  }
  function onKeyUp(e) { delete keys[e.code]; }

  function onCanvasMouseMove(e) {
    if (state !== 'select') { canvas.style.cursor = 'default'; return; }
    const { mx, my } = canvasXY(e);
    hoveredLevel = -1;
    LEVELS.forEach((_, i) => {
      const b = cardBounds(i);
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y - 10 && my <= b.y + b.h) hoveredLevel = i;
    });
    canvas.style.cursor = hoveredLevel >= 0 ? 'pointer' : 'default';
  }

  function onCanvasPointerDown(e) {
    if (state !== 'select') return;
    const { mx, my } = canvasXY(e);
    LEVELS.forEach((_, i) => {
      const b = cardBounds(i);
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y - 10 && my <= b.y + b.h) startSelectedLevel(i);
    });
  }

  function onCanvasTouchDown(e) { e.preventDefault(); onCanvasPointerDown(e); }

  function start() {
    keys = {}; hoveredLevel = -1; state = 'select';
    hideTouchControls();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('mousemove',  onCanvasMouseMove);
    canvas.addEventListener('mousedown',  onCanvasPointerDown);
    canvas.addEventListener('touchstart', onCanvasTouchDown, { passive: false });
    gameLoop();
  }

  function stop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    canvas.removeEventListener('mousemove',  onCanvasMouseMove);
    canvas.removeEventListener('mousedown',  onCanvasPointerDown);
    canvas.removeEventListener('touchstart', onCanvasTouchDown);
    hideTouchControls();
    canvas.style.cursor = 'default';
    keys = {};
  }

  return { start, stop };
})();
