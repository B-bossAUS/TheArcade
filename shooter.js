const SpaceShooter = (() => {
  const W = 800, H = 400;
  const PLAYER_SPEED = 5;
  const BULLET_SPD = 10;
  const EBULLET_SPD = 3;

  let state, level, lives, score, hiScore, frameCount, shakeFrames;
  let player, bullets, eBullets, enemies, boss, powerupDrops, particles;
  let activePowerup, powerupTimer, fireTimer, stateTimer;
  let gridDir, gridDropPending;
  let keys = {};
  let animFrame = null;

  // ── Canvas d-pad (mobile) ─────────────────────────────────────────────────
  const DP = { cx: 718, cy: 332, sz: 34, gap: 10 };
  const dpTouch = { up: false, down: false, left: false, right: false };

  function dpBtns() {
    const { cx, cy, sz, gap } = DP;
    return {
      up:    { x: cx - sz / 2,   y: cy - sz - gap, w: sz, h: sz },
      down:  { x: cx - sz / 2,   y: cy + gap,       w: sz, h: sz },
      left:  { x: cx - sz - gap, y: cy - sz / 2,    w: sz, h: sz },
      right: { x: cx + gap,      y: cy - sz / 2,    w: sz, h: sz },
    };
  }

  function updateTouchDirs(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = W / rect.width, sy = H / rect.height;
    const btns = dpBtns();
    dpTouch.up = dpTouch.down = dpTouch.left = dpTouch.right = false;
    for (const t of e.touches) {
      const tx = (t.clientX - rect.left) * sx;
      const ty = (t.clientY - rect.top)  * sy;
      for (const [dir, b] of Object.entries(btns)) {
        if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h)
          dpTouch[dir] = true;
      }
    }
  }

  function drawDpad() {
    const btns = dpBtns();
    const arrows = { up: '▲', down: '▼', left: '◀', right: '▶' };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [dir, b] of Object.entries(btns)) {
      const active = dpTouch[dir];
      ctx.save();
      ctx.fillStyle   = active ? 'rgba(255,102,0,0.3)' : 'rgba(255,255,255,0.07)';
      ctx.strokeStyle = active ? '#ff8833' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = active ? '#ff8833' : 'transparent';
      ctx.shadowBlur  = active ? 8 : 0;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle  = active ? '#ff8833' : 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = 0;
      ctx.font = '13px sans-serif';
      ctx.fillText(arrows[dir], b.x + b.w / 2, b.y + b.h / 2);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  const SHOOT_STARS = Array.from({ length: 120 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.5 + 0.2,
    vy: Math.random() * 0.8 + 0.2,
    layer: Math.random() > 0.6 ? 2 : 1,
  }));

  const ENEMY_DEFS = {
    basic: { hp: 1, color: '#ff6600', accent: '#ffaa44', w: 28, h: 22, pts: 10, fireRate: 180 },
    fast:  { hp: 1, color: '#ff00cc', accent: '#ff88ee', w: 22, h: 18, pts: 20, fireRate: 0 },
    tank:  { hp: 4, color: '#44ff88', accent: '#aaffcc', w: 34, h: 28, pts: 50, fireRate: 100 },
  };

  const LEVEL_CONFIGS = [
    [{ type: 'basic', rows: 3, cols: 8 }],
    [{ type: 'fast', rows: 2, cols: 8 }, { type: 'basic', rows: 2, cols: 8 }],
    [{ type: 'fast', rows: 2, cols: 8 }, { type: 'basic', rows: 1, cols: 7 }, { type: 'tank', rows: 1, cols: 5 }],
  ];

  const POWERUP_COLORS = { triple: '#00ff88', rapid: '#ffcc00', shield: '#00aaff', bomb: '#ff3333' };
  const POWERUP_LABELS = { triple: '3X', rapid: '>>',  shield: '()' , bomb: '!!' };

  // ── helpers ──
  function rng(min, max) { return Math.random() * (max - min) + min; }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ── init ──
  function initGame() {
    level = 1; lives = 3; score = 0; frameCount = 0;
    hiScore = parseInt(localStorage.getItem('shooterHi') || '0');
    initLevel();
  }

  function initLevel() {
    player = { x: W / 2 - 18, y: H - 55, w: 36, h: 36, shield: false };
    bullets = []; eBullets = []; enemies = []; powerupDrops = []; particles = [];
    boss = null; activePowerup = null; powerupTimer = 0; fireTimer = 0;
    shakeFrames = 0; stateTimer = 0; gridDir = 1; gridDropPending = false;

    if (level > LEVEL_CONFIGS.length) {
      state = 'boss_warning';
      stateTimer = 100;
      spawnBoss();
    } else {
      state = 'playing';
      spawnEnemyGrid();
    }
  }

  function spawnEnemyGrid() {
    const config = LEVEL_CONFIGS[level - 1];
    let rowOffset = 0;
    config.forEach(({ type, rows, cols }) => {
      const def = ENEMY_DEFS[type];
      const spacingX = def.w + 14;
      const spacingY = def.h + 12;
      const totalW = cols * spacingX - 14;
      const startX = (W - totalW) / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          enemies.push({
            x: startX + c * spacingX,
            y: 28 + (rowOffset + r) * spacingY,
            w: def.w, h: def.h,
            hp: def.hp, maxHp: def.hp,
            type, color: def.color, accent: def.accent,
            pts: def.pts,
            fireTimer: Math.random() * def.fireRate,
            fireRate: def.fireRate,
          });
        }
      }
      rowOffset += rows;
    });
  }

  function spawnBoss() {
    boss = {
      x: W / 2 - 60, y: -90, w: 120, h: 80,
      hp: 200, maxHp: 200, phase: 1,
      shootTimer: 0, vx: 1.8, targetY: 55,
      exploding: false, explodeTimer: 0,
    };
  }

  // ── particles ──
  function explode(x, y, big) {
    const n = big ? 55 : 16;
    const cols = big
      ? ['#ff4400', '#ff8800', '#ffcc00', '#ffffff', '#ff6666']
      : ['#ff6600', '#ffcc00', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = rng(0, Math.PI * 2), spd = rng(1, big ? 8 : 4);
      particles.push({
        x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - (big ? 2 : 0),
        r: rng(2, big ? 7 : 4),
        color: cols[Math.floor(Math.random() * cols.length)],
        life: 1, decay: rng(0.018, big ? 0.012 : 0.03),
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── power-ups ──
  function dropPowerup(x, y) {
    if (Math.random() > 0.22) return;
    const types = ['triple', 'rapid', 'shield', 'bomb'];
    const t = types[Math.floor(Math.random() * types.length)];
    powerupDrops.push({ x: x - 12, y, w: 24, h: 24, type: t, color: POWERUP_COLORS[t], vy: 1.2 });
  }

  function activatePowerup(type) {
    if (type === 'bomb') {
      enemies.forEach(e => { explode(e.x + e.w / 2, e.y + e.h / 2, false); score += e.pts; });
      enemies = [];
      if (boss) { boss.hp = Math.max(1, boss.hp - 80); }
      shakeFrames = 12;
      return;
    }
    if (type === 'shield') player.shield = true;
    activePowerup = type;
    powerupTimer = 600;
  }

  // ── player hit ──
  function hitPlayer() {
    if (player.shield || activePowerup === 'shield') {
      player.shield = false; activePowerup = null; powerupTimer = 0;
      shakeFrames = 8; explode(player.x + 18, player.y + 18, false); return;
    }
    lives--;
    shakeFrames = 22;
    explode(player.x + 18, player.y + 18, true);
    if (lives <= 0) {
      if (score > hiScore) { hiScore = score; localStorage.setItem('shooterHi', hiScore); }
      state = 'gameover';
    } else {
      player.x = W / 2 - 18;
      eBullets = [];
    }
  }

  // ── shoot ──
  function playerShoot() {
    const cx = player.x + player.w / 2;
    const by = player.y;
    if (activePowerup === 'triple') {
      bullets.push({ x: cx, y: by, vx: -2.8, vy: -BULLET_SPD });
      bullets.push({ x: cx, y: by, vx: 0,    vy: -BULLET_SPD });
      bullets.push({ x: cx, y: by, vx: 2.8,  vy: -BULLET_SPD });
    } else {
      bullets.push({ x: cx, y: by, vx: 0, vy: -BULLET_SPD });
    }
  }

  function enemyShoot(e) {
    eBullets.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: EBULLET_SPD + level * 0.3 });
  }

  function bossShoot() {
    const cx = boss.x + boss.w / 2;
    const by = boss.y + boss.h;
    const spread = boss.phase === 1 ? 3 : 5;
    for (let i = 0; i < spread; i++) {
      // Math.PI/2 = straight down; spread fans outward from there
      const angle = Math.PI / 2 + (i - (spread - 1) / 2) * 0.28;
      eBullets.push({ x: cx, y: by, vx: Math.cos(angle) * EBULLET_SPD * 1.2, vy: Math.sin(angle) * EBULLET_SPD * 1.2 });
    }
    if (boss.phase === 2) {
      eBullets.push({ x: boss.x,          y: by - 20, vx: -2.5, vy: 2.5 });
      eBullets.push({ x: boss.x + boss.w, y: by - 20, vx:  2.5, vy: 2.5 });
    }
  }

  // ── update sections ──
  function updatePlayer() {
    if (keys['ArrowLeft']  || keys['KeyA'] || dpTouch.left)  player.x = Math.max(0,             player.x - PLAYER_SPEED);
    if (keys['ArrowRight'] || keys['KeyD'] || dpTouch.right) player.x = Math.min(W - player.w,  player.x + PLAYER_SPEED);
    if (keys['ArrowUp']    || keys['KeyW'] || dpTouch.up)    player.y = Math.max(H * 0.38,      player.y - PLAYER_SPEED);
    if (keys['ArrowDown']  || keys['KeyS'] || dpTouch.down)  player.y = Math.min(H - player.h,  player.y + PLAYER_SPEED);
    const fRate = activePowerup === 'rapid' ? 7 : 15;
    fireTimer++;
    if (fireTimer >= fRate) { fireTimer = 0; playerShoot(); }
    if (powerupTimer > 0) { powerupTimer--; if (powerupTimer === 0) { activePowerup = null; player.shield = false; } }
  }

  function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].x += bullets[i].vx; bullets[i].y += bullets[i].vy;
      if (bullets[i].y < -10 || bullets[i].x < -10 || bullets[i].x > W + 10) bullets.splice(i, 1);
    }
    for (let i = eBullets.length - 1; i >= 0; i--) {
      eBullets[i].x += eBullets[i].vx; eBullets[i].y += eBullets[i].vy;
      if (eBullets[i].y > H + 10 || eBullets[i].x < -10 || eBullets[i].x > W + 10) { eBullets.splice(i, 1); continue; }
      if (overlap(eBullets[i].x - 4, eBullets[i].y - 4, 8, 8, player.x + 4, player.y + 4, player.w - 8, player.h - 8)) {
        eBullets.splice(i, 1); hitPlayer();
      }
    }
  }

  function updateEnemies() {
    // Grid movement (Space Invaders style)
    let leftEdge = W, rightEdge = 0;
    enemies.forEach(e => { leftEdge = Math.min(leftEdge, e.x); rightEdge = Math.max(rightEdge, e.x + e.w); });

    const gridSpd = 0.6 + level * 0.25;
    if (rightEdge >= W - 8 && gridDir === 1) { gridDir = -1; gridDropPending = true; }
    if (leftEdge <= 8 && gridDir === -1) { gridDir = 1; gridDropPending = true; }

    enemies.forEach(e => {
      e.x += gridSpd * gridDir;
      if (gridDropPending) e.y += 18;

      // Enemy shooting
      if (e.fireRate > 0) {
        e.fireTimer++;
        if (e.fireTimer >= e.fireRate) { e.fireTimer = 0; if (Math.random() < 0.4) enemyShoot(e); }
      }

      // Enemy reaches player zone → game over
      if (e.y + e.h >= H - 60) { state = 'gameover'; if (score > hiScore) { hiScore = score; localStorage.setItem('shooterHi', hiScore); } }
    });
    gridDropPending = false;

    // Bullet vs enemy collisions
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const b = bullets[bi], e = enemies[ei];
        if (!b || !e) continue;
        if (overlap(b.x - 3, b.y - 6, 6, 12, e.x, e.y, e.w, e.h)) {
          bullets.splice(bi, 1);
          e.hp--;
          if (e.hp <= 0) {
            score += e.pts;
            explode(e.x + e.w / 2, e.y + e.h / 2, false);
            dropPowerup(e.x + e.w / 2, e.y + e.h / 2);
            enemies.splice(ei, 1);
          }
          break;
        }
      }
    }

    if (enemies.length === 0 && state === 'playing') {
      level++;
      state = 'levelclear';
      stateTimer = 120;
    }
  }

  function updateBoss() {
    if (!boss) return;

    // Entry animation
    if (boss.y < boss.targetY) {
      boss.y += 1.5;
      return;
    }

    // Phase check
    if (boss.hp < boss.maxHp / 2 && boss.phase === 1) boss.phase = 2;

    const bossSpd = boss.phase === 1 ? boss.vx : boss.vx * 1.6;
    boss.x += bossSpd;
    if (boss.x <= 0) boss.vx = Math.abs(boss.vx);
    if (boss.x + boss.w >= W) boss.vx = -Math.abs(boss.vx);

    // Boss shoot
    const shootInterval = boss.phase === 1 ? 60 : 38;
    boss.shootTimer++;
    if (boss.shootTimer >= shootInterval) { boss.shootTimer = 0; bossShoot(); }

    // Bullets hit boss
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (overlap(b.x - 3, b.y - 6, 6, 12, boss.x, boss.y, boss.w, boss.h)) {
        bullets.splice(i, 1);
        boss.hp--;
        if (boss.hp <= 0) {
          boss.hp = 0;
          boss.exploding = true;
          if (score > hiScore) { hiScore = score; localStorage.setItem('shooterHi', hiScore); }
        }
      }
    }

    if (boss.exploding) {
      boss.explodeTimer++;
      if (boss.explodeTimer % 8 === 0) explode(boss.x + rng(0, boss.w), boss.y + rng(0, boss.h), true);
      shakeFrames = 6;
      if (boss.explodeTimer >= 80) { score += 500; state = 'win'; }
    }

    // Boss body collision
    if (overlap(player.x + 4, player.y + 4, player.w - 8, player.h - 8, boss.x, boss.y, boss.w, boss.h)) hitPlayer();
  }

  function updatePowerupDrops() {
    for (let i = powerupDrops.length - 1; i >= 0; i--) {
      const p = powerupDrops[i];
      p.y += p.vy;
      if (p.y > H) { powerupDrops.splice(i, 1); continue; }
      if (overlap(p.x, p.y, p.w, p.h, player.x, player.y, player.w, player.h)) {
        activatePowerup(p.type);
        powerupDrops.splice(i, 1);
      }
    }
  }

  function updateStars() {
    SHOOT_STARS.forEach(s => {
      s.y += s.vy * s.layer;
      if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    });
  }

  // ── draw ──
  function drawBg() {
    ctx.fillStyle = '#020010'; ctx.fillRect(0, 0, W, H);
    SHOOT_STARS.forEach(s => {
      const a = 0.3 + s.r * 0.25;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
    });
  }

  function drawPlayer() {
    const px = player.x, py = player.y;
    // Shield ring
    if (player.shield || activePowerup === 'shield') {
      ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.ellipse(px + player.w / 2, py + player.h / 2, 26, 26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Engine flame
    const flicker = 6 + Math.sin(frameCount * 0.3) * 3;
    ctx.fillStyle = '#ffaa00'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(px + 18, py + player.h + flicker / 2, 5, flicker, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Body
    ctx.shadowColor = '#ff8833'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff6600';
    ctx.beginPath(); ctx.moveTo(px + 18, py); ctx.lineTo(px, py + player.h); ctx.lineTo(px + 18, py + player.h - 10); ctx.lineTo(px + player.w, py + player.h); ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.fillStyle = '#ffcc66'; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(px + 18, py + 14, 6, 9, 0, 0, Math.PI * 2); ctx.fill();
    // Wings
    ctx.fillStyle = '#cc4400';
    ctx.fillRect(px, py + 18, 10, 7); ctx.fillRect(px + player.w - 10, py + 18, 10, 7);
    ctx.shadowBlur = 0;
  }

  function drawEnemy(e) {
    const def = ENEMY_DEFS[e.type];
    ctx.shadowColor = e.color; ctx.shadowBlur = 10;
    if (e.type === 'basic') {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y); ctx.lineTo(e.x, e.y + e.h); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.accent;
      ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, e.y + e.h * 0.6, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'fast') {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y); ctx.lineTo(e.x, e.y + e.h); ctx.lineTo(e.x + e.w / 4, e.y + e.h * 0.6); ctx.lineTo(e.x + e.w / 2, e.y + e.h * 0.9); ctx.lineTo(e.x + e.w * 3/4, e.y + e.h * 0.6); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = e.accent; ctx.fillRect(e.x + 4, e.y + 4, e.w - 8, e.h - 8);
      ctx.fillStyle = e.color; ctx.fillRect(e.x + 9, e.y + 9, e.w - 18, e.h - 18);
      // HP pips
      for (let h = 0; h < e.maxHp; h++) {
        ctx.fillStyle = h < e.hp ? '#ffffff' : '#333333';
        ctx.fillRect(e.x + 4 + h * 7, e.y - 6, 5, 3);
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawBoss() {
    if (!boss) return;
    const bx = boss.x, by = boss.y, bw = boss.w, bh = boss.h;
    const phase2 = boss.phase === 2;
    ctx.shadowColor = phase2 ? '#ff0066' : '#aa00ff'; ctx.shadowBlur = 20;
    // Body
    ctx.fillStyle = phase2 ? '#880033' : '#550088';
    ctx.fillRect(bx, by, bw, bh);
    // Core
    ctx.fillStyle = phase2 ? '#ff0066' : '#cc44ff';
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, 22, 22, 0, 0, Math.PI * 2); ctx.fill();
    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, 10, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = phase2 ? '#ff0000' : '#000088';
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Wings
    ctx.fillStyle = phase2 ? '#660022' : '#330066';
    ctx.beginPath(); ctx.moveTo(bx, by + 20); ctx.lineTo(bx - 30, by + bh); ctx.lineTo(bx, by + bh); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx + bw, by + 20); ctx.lineTo(bx + bw + 30, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    // Health bar
    const barW = 300, barH = 12;
    const barX = (W - barW) / 2, barY = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = '#330000'; ctx.fillRect(barX, barY, barW, barH);
    const pct = boss.hp / boss.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#ff4444' : '#ff0000';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`BOSS  ${boss.hp} / ${boss.maxHp}${boss.phase === 2 ? '  ⚡ PHASE 2' : ''}`, W / 2, barY + barH + 12);
    ctx.textAlign = 'left';
  }

  function drawBullets() {
    bullets.forEach(b => {
      ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#aaffee';
      ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
      ctx.shadowBlur = 0;
    });
    eBullets.forEach(b => {
      ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff8888';
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function drawPowerupDrops() {
    powerupDrops.forEach(p => {
      ctx.shadowColor = p.color; ctx.shadowBlur = 14;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#000000'; ctx.shadowBlur = 0;
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(POWERUP_LABELS[p.type], p.x + p.w / 2, p.y + p.h / 2 + 4);
      ctx.textAlign = 'left';
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawHUD() {
    // Lives
    for (let i = 0; i < lives; i++) {
      const lx = 12 + i * 26, ly = H - 30;
      ctx.fillStyle = '#ff6600'; ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(lx + 9, ly); ctx.lineTo(lx, ly + 16); ctx.lineTo(lx + 9, ly + 11); ctx.lineTo(lx + 18, ly + 16); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Score
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px monospace';
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
    ctx.fillText(`${score}`, W - 120, 28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px monospace';
    ctx.fillText(`BEST ${hiScore}`, W - 120, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '11px monospace';
    ctx.fillText('ESC = MENU', W - 120, 62);

    // Level badge
    if (state !== 'boss_warning' && state !== 'win' && state !== 'gameover') {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '12px monospace';
      const lvlLabel = level > LEVEL_CONFIGS.length ? 'BOSS' : `LVL ${level}`;
      ctx.fillText(lvlLabel, W / 2 - 20, H - 10);
    }

    // Active power-up
    if (activePowerup) {
      const barW = 100;
      const pct = powerupTimer / 600;
      ctx.fillStyle = POWERUP_COLORS[activePowerup]; ctx.shadowColor = POWERUP_COLORS[activePowerup]; ctx.shadowBlur = 8;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(activePowerup.toUpperCase(), W / 2 - 60, H - 18);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(W / 2 - 60, H - 14, barW, 6);
      ctx.fillStyle = POWERUP_COLORS[activePowerup]; ctx.fillRect(W / 2 - 60, H - 14, barW * pct, 6);
    }
  }

  function drawOverlay() {
    if (state === 'boss_warning') {
      const alpha = 0.5 + 0.5 * Math.sin(frameCount * 0.2);
      ctx.fillStyle = `rgba(255,0,0,${alpha * 0.3})`; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,80,80,${alpha})`; ctx.font = 'bold 48px monospace';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 30;
      ctx.fillText('⚠  WARNING  ⚠', W / 2, H / 2 - 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,200,200,0.8)'; ctx.font = '20px monospace';
      ctx.fillText('BOSS INCOMING', W / 2, H / 2 + 20);
      ctx.textAlign = 'left';
    }

    if (state === 'levelclear') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 25;
      ctx.fillStyle = '#00ff88'; ctx.font = 'bold 50px monospace';
      ctx.fillText(`LEVEL ${level - 1} CLEAR`, W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '18px monospace';
      ctx.fillText('Get ready...', W / 2, H / 2 + 30);
      ctx.textAlign = 'left';
    }

    if (state === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 54px monospace';
      ctx.fillText('YOU WIN!', W / 2, 130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 188);
      if (score >= hiScore && score > 0) {
        ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 12;
        ctx.font = 'bold 18px monospace'; ctx.fillText('NEW BEST!', W / 2, 222); ctx.shadowBlur = 0;
      }
      ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10;
      ctx.font = '20px monospace'; ctx.fillText('SPACE  — play again', W / 2, 285); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '16px monospace';
      ctx.fillText('M  or  ESC  — main menu', W / 2, 315);
      ctx.textAlign = 'left';
    }

    if (state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#ff3333'; ctx.font = 'bold 58px monospace';
      ctx.fillText('GAME OVER', W / 2, 130);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 190);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '18px monospace';
      ctx.fillText(`Best: ${hiScore}`, W / 2, 222);
      ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 10;
      ctx.font = '20px monospace'; ctx.fillText('SPACE  — try again', W / 2, 285); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '16px monospace';
      ctx.fillText('M  or  ESC  — main menu', W / 2, 315);
      ctx.textAlign = 'left';
    }
  }

  // ── main loop ──
  function update() {
    frameCount++;
    if (shakeFrames > 0) shakeFrames--;
    updateStars();

    if (state === 'boss_warning') {
      stateTimer--;
      if (stateTimer <= 0) state = 'boss_entering';
      return;
    }
    if (state === 'boss_entering') {
      updateBoss(); updateBullets(); updatePowerupDrops(); updateParticles();
      if (boss && boss.y >= boss.targetY) state = 'boss';
      return;
    }
    if (state === 'levelclear') {
      stateTimer--;
      if (stateTimer <= 0) initLevel();
      updateParticles();
      return;
    }
    if (state === 'win' || state === 'gameover') { updateParticles(); return; }
    if (state === 'playing') { updatePlayer(); updateBullets(); updateEnemies(); updatePowerupDrops(); updateParticles(); }
    if (state === 'boss') { updatePlayer(); updateBullets(); updateBoss(); updatePowerupDrops(); updateParticles(); }
  }

  function draw() {
    ctx.save();
    if (shakeFrames > 0) {
      const m = shakeFrames * 0.6;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.clearRect(-20, -20, W + 40, H + 40);
    drawBg();
    drawPowerupDrops();
    enemies.forEach(drawEnemy);
    drawBoss();
    if (state !== 'gameover' && state !== 'win') drawPlayer();
    drawBullets();
    drawParticles();
    ctx.restore();
    drawHUD();
    drawOverlay();
    drawDpad();
  }

  function gameLoop() {
    update(); draw();
    animFrame = requestAnimationFrame(gameLoop);
  }

  // ── input ──
  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyM') { stop(); showMenu(); return; }
    if (e.code === 'Space') {
      if (state === 'win') { level = 1; lives = 3; score = 0; initLevel(); }
      else if (state === 'gameover') initGame();
    }
    if (e.code === 'KeyM') { stop(); showMenu(); }
  }
  function onKeyUp(e) { delete keys[e.code]; }

  function onTouchStart(e) { e.preventDefault(); updateTouchDirs(e); }
  function onTouchMove(e)  { e.preventDefault(); updateTouchDirs(e); }
  function onTouchEnd(e)   { e.preventDefault(); updateTouchDirs(e); }

  function start() {
    keys = {};
    dpTouch.up = dpTouch.down = dpTouch.left = dpTouch.right = false;
    hideTouchControls();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    initGame();
    gameLoop();
  }

  function stop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove',  onTouchMove);
    canvas.removeEventListener('touchend',   onTouchEnd);
    dpTouch.up = dpTouch.down = dpTouch.left = dpTouch.right = false;
    keys = {};
  }

  return { start, stop };
})();
