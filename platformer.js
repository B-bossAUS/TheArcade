const Platformer = (() => {
  const W = 800, H = 400;

  let state, level, lives, coins, totalCoins, score, frameCount, stateTimer, shakeFrames;
  let player, platforms, enemies, collectibles, movingPlatforms, hazards, exitPortal, particles;
  let camX, keys, animFrame;

  // ── level definitions ──
  // Each platform: [x, y, w, h]  (world coords)
  // Exit portal at far right of each level

  const LEVELS = [
    {
      name: 'GRASSLANDS', bg: ['#1a3a1a', '#2d6e2d'], groundColor: '#4caf50', platColor: '#388e3c',
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
      name: 'SKY ISLANDS', bg: ['#0d1a40', '#1a3a80'], groundColor: '#00aaff', platColor: '#0077cc',
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
      name: 'LAVA CAVES', bg: ['#200000', '#4a0000'], groundColor: '#cc2200', platColor: '#8b1a00',
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
  ];

  const ENEMY_DEFS = {
    basic:   { color: '#ff3333', accent: '#ff8888', w: 28, h: 28, speed: 1.2, maxHp: 1 },
    fast:    { color: '#aa00ff', accent: '#dd88ff', w: 24, h: 24, speed: 2.2, maxHp: 1 },
    armored: { color: '#888888', accent: '#cccccc', w: 32, h: 30, speed: 0.9, maxHp: 2 },
  };

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
      w: 24, h: 34,
      vx: 0, vy: 0,
      onGround: false,
      coyoteTimer: 0,
      jumpsLeft: 2,
      facing: 1,
      animFrame: 0,
      damaged: 0,
      stomping: false,
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
      if (ent.vx > 0) { ent.x = p.x - ent.w; ent.vx = 0; }
      else if (ent.vx < 0) { ent.x = p.x + p.w; ent.vx = 0; }
    });
  }

  // ── update sections ──
  function updatePlayer() {
    const ld = LEVELS[level];
    player.animFrame++;
    if (player.damaged > 0) player.damaged--;

    // Horizontal
    const accel = 0.8, maxSpd = 5;
    if (keys['ArrowLeft'] || keys['KeyA']) { player.vx -= accel; player.facing = -1; }
    else if (keys['ArrowRight'] || keys['KeyD']) { player.vx += accel; player.facing = 1; }
    else { player.vx *= 0.75; }
    player.vx = Math.max(-maxSpd, Math.min(maxSpd, player.vx));

    // Gravity
    player.vy = Math.min(player.vy + 0.55, 14);

    // Coyote time
    if (player.onGround) { player.coyoteTimer = 6; player.jumpsLeft = 2; }
    else if (player.coyoteTimer > 0) player.coyoteTimer--;

    player.onGround = false;

    // Resolve vs static platforms
    const allPlats = [...platforms, ...movingPlatforms];
    resolveVsStatics(player, allPlats);

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

    const legSwing = Math.sin(player.animFrame * 0.2) * (Math.abs(player.vx) > 0.5 ? 8 : 0);
    const headBob = player.onGround ? Math.abs(Math.sin(player.animFrame * 0.2)) * 2 : 0;
    const cx = sx + player.w / 2;
    const by = player.y;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, by + player.h + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.strokeStyle = '#226600'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 4, by + player.h - 8); ctx.lineTo(cx - 6 + legSwing * player.facing, by + player.h + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 4, by + player.h - 8); ctx.lineTo(cx + 6 - legSwing * player.facing, by + player.h + 2); ctx.stroke();

    // Body
    ctx.shadowColor = '#aaff00'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#aaff00';
    ctx.fillRect(sx, by + 10 - headBob, player.w, player.h - 14);

    // Arms
    ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, by + 14 - headBob); ctx.lineTo(sx - 8, by + 22 - headBob - legSwing * 0.5 * player.facing); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + player.w, by + 14 - headBob); ctx.lineTo(sx + player.w + 8, by + 22 - headBob + legSwing * 0.5 * player.facing); ctx.stroke();

    // Head
    ctx.fillStyle = '#ffe0a0';
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(cx, by + 4 - headBob, 12, 12, 0, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#000000';
    const eyeOff = player.facing * 3;
    ctx.fillRect(cx + eyeOff - 2, by - headBob, 3, 3);
    ctx.shadowBlur = 0;
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
    // Double-jump tip early on
    if (level === 0 && frameCount < 300) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('ARROWS to move  •  SPACE to jump (double-jump!)', W / 2, H - 12);
      ctx.textAlign = 'left';
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
      ctx.font = '20px monospace'; ctx.fillText('SPACE  — play again', W / 2, 278); ctx.shadowBlur = 0;
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
      ctx.fillText('ESC  — main menu', W / 2, 308);
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
    ctx.save();
    if (shakeFrames > 0) {
      const m = shakeFrames * 0.5;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBg();
    drawHazards();
    drawPlatforms();
    drawExitPortal();
    drawCoins();
    drawEnemies();
    drawParticles();
    drawPlayer();
    ctx.restore();
    drawHUD();
    drawOverlay();
  }

  function gameLoop() { update(); draw(); animFrame = requestAnimationFrame(gameLoop); }

  // ── input ──
  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Escape') { stop(); showMenu(); return; }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (state === 'win') { initGame(); return; }
      if (state === 'gameover') { initGame(); return; }
      doJump();
    }
  }
  function onKeyUp(e) { delete keys[e.code]; }

  function start() {
    keys = {};
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    initGame();
    gameLoop();
  }

  function stop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    keys = {};
  }

  return { start, stop };
})();
