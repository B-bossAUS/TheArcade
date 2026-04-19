// Gravity Changer — gravity-flip runner game
const GravityChanger = (() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const W = 800, H = 400;
  const LANE_H = H;           // full canvas for 1p; half for 2p per player
  const RUNNER_X = 130;
  const RUNNER_W = 14;
  const RUNNER_H = 28;
  const SPIKE_W = 22;
  const SPIKE_H = 18;
  const PLAT_W = 72;
  const PLAT_H = 10;
  const GRAVITY_ACCEL = 0.72;
  const JUMP_VEL = 0;           // no jump; only gravity flip
  const FLIP_LOCK = 18;         // frames before you can flip again

  // ── State ──────────────────────────────────────────────────────────────────
  let mode = '1p';             // '1p' | '2p'
  let running = false;
  let animId = null;

  // Screen state: 'title' | 'game' | 'gameover'
  let screen = 'title';

  let players = [];
  let obstacles = [];
  let tick = 0;
  let score = 0;
  let speed = 0;
  let spawnGap = 0;
  let nextSpawn = 0;
  let hovTitleBtn = -1;   // for title hover
  let hovGOBtn = -1;      // for game-over hover

  // ── Player factory ─────────────────────────────────────────────────────────
  function makePlayer(laneTop, laneH, color, keys) {
    return {
      laneTop, laneH, color, keys,
      y: laneTop + laneH - 6 - RUNNER_H,  // feet resting on floor
      vy: 0,
      gravDir: 1,           // 1 = pulled down, -1 = pulled up
      flipLock: 0,
      dead: false,
      legPhase: 0,
      onGround: false,
      onCeiling: false,
      onPlatform: false,
    };
  }

  // ── Math helpers ───────────────────────────────────────────────────────────
  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ── Obstacle factory ───────────────────────────────────────────────────────
  /*
    type: 'spike_top' | 'spike_bot' | 'platform'
    x: world x (scrolls with speed)
    For platform: y is absolute within a lane (relative coords added per-player in draw)
    For spikes they attach to ceiling/floor of the lane.
  */
  function spawnObstacle() {
    const r = Math.random();
    const x = W + 40;

    if (r < 0.12) {
      // Platform in middle third of lane
      obstacles.push({ type: 'platform', x, laneOffset: 0.38 + Math.random() * 0.24 });
    } else {
      // Pick spike pattern
      const pat = Math.random();
      if (pat < 0.28) {
        // Single bottom spike
        obstacles.push({ type: 'spike_bot', x });
      } else if (pat < 0.52) {
        // Single top spike
        obstacles.push({ type: 'spike_top', x });
      } else if (pat < 0.70) {
        // Alternating pair
        obstacles.push({ type: 'spike_bot', x });
        obstacles.push({ type: 'spike_top', x: x + 55 });
      } else if (pat < 0.85) {
        // Double close together
        obstacles.push({ type: 'spike_bot', x });
        obstacles.push({ type: 'spike_bot', x: x + 30 });
      } else {
        // Triple alternating cluster
        obstacles.push({ type: 'spike_bot', x });
        obstacles.push({ type: 'spike_top', x: x + 44 });
        obstacles.push({ type: 'spike_bot', x: x + 88 });
      }
    }
  }

  // ── Geometry per player lane ────────────────────────────────────────────────
  function laneFloor(p) { return p.laneTop + p.laneH - 6; }
  function laneCeiling(p) { return p.laneTop + 6; }
  function laneMiddle(p) { return p.laneTop + p.laneH / 2; }

  // ── Update one player ───────────────────────────────────────────────────────
  function updatePlayer(p) {
    if (p.dead) return;

    // Flip gravity input
    if (p.keys.flip && p.flipLock <= 0) {
      p.gravDir *= -1;
      p.vy = 0;
      p.flipLock = FLIP_LOCK;
    }
    if (p.flipLock > 0) p.flipLock--;

    // Apply gravity
    p.vy += GRAVITY_ACCEL * p.gravDir;
    p.y += p.vy;

    p.onGround = false;
    p.onCeiling = false;
    p.onPlatform = false;

    // Floor collision
    const floor = laneFloor(p);
    if (p.gravDir === 1 && p.y + RUNNER_H >= floor) {
      p.y = floor - RUNNER_H;
      p.vy = 0;
      p.onGround = true;
    }
    // Ceiling collision
    const ceiling = laneCeiling(p);
    if (p.gravDir === -1 && p.y <= ceiling) {
      p.y = ceiling;
      p.vy = 0;
      p.onCeiling = true;
    }

    // Prevent going out of lane entirely
    if (p.y < p.laneTop) { p.y = p.laneTop; p.vy = 0; }
    if (p.y + RUNNER_H > p.laneTop + p.laneH) { p.y = p.laneTop + p.laneH - RUNNER_H; p.vy = 0; }

    // Platform & obstacle collisions
    for (const obs of obstacles) {
      // obs.x is the canvas x of the obstacle (runner is always at RUNNER_X on canvas)
      if (obs.type === 'platform') {
        const py = p.laneTop + p.laneH * obs.laneOffset;
        // Stand on top (gravity down)
        if (p.gravDir === 1 &&
            p.vy >= 0 &&
            rectOverlap(RUNNER_X, p.y, RUNNER_W, RUNNER_H, obs.x, py, PLAT_W, PLAT_H) &&
            p.y + RUNNER_H - p.vy <= py + 2) {
          p.y = py - RUNNER_H;
          p.vy = 0;
          p.onPlatform = true;
        }
        // Hang from bottom (gravity up)
        if (p.gravDir === -1 &&
            p.vy <= 0 &&
            rectOverlap(RUNNER_X, p.y, RUNNER_W, RUNNER_H, obs.x, py, PLAT_W, PLAT_H) &&
            p.y - p.vy >= py + PLAT_H - 2) {
          p.y = py + PLAT_H;
          p.vy = 0;
          p.onPlatform = true;
        }
      } else {
        // Spike collision — use forgiving inner hitbox
        let sx, sy, sw, sh;
        if (obs.type === 'spike_bot') {
          sx = obs.x + 3; sy = laneFloor(p) - SPIKE_H + 4; sw = SPIKE_W - 6; sh = SPIKE_H - 4;
        } else {
          sx = obs.x + 3; sy = laneCeiling(p) + 2;          sw = SPIKE_W - 6; sh = SPIKE_H - 4;
        }
        if (rectOverlap(RUNNER_X + 2, p.y + 2, RUNNER_W - 4, RUNNER_H - 4, sx, sy, sw, sh)) {
          p.dead = true;
        }
      }
    }

    // Leg animation
    if (p.onGround || p.onPlatform || p.onCeiling) {
      p.legPhase += 0.22 * speed / 6.5;
    }
  }

  // ── Draw one player (stick figure) ─────────────────────────────────────────
  function drawPlayer(p) {
    const ctx = canvas.getContext('2d');
    const cx = RUNNER_X + RUNNER_W / 2;
    const cy = p.y + RUNNER_H / 2;
    const flip = p.gravDir; // 1 = normal, -1 = upside down

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, flip);

    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;

    // Head
    ctx.beginPath();
    ctx.arc(0, -13, 5, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 4);
    ctx.stroke();

    // Arms
    const armSwing = Math.sin(p.legPhase) * 5;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(-8, 0 + armSwing);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(8, 0 - armSwing);
    ctx.stroke();

    // Legs
    const leg1 = Math.sin(p.legPhase) * 7;
    const leg2 = Math.sin(p.legPhase + Math.PI) * 7;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-4, 12 + leg1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(4, 12 + leg2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Draw a spike ────────────────────────────────────────────────────────────
  // baseY = y of the wide base edge; tipY = y of the sharp point
  function drawSpike(ctx, x, baseY, tipY) {
    ctx.save();
    ctx.fillStyle = '#ffaa22';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x,             baseY);
    ctx.lineTo(x + SPIKE_W,   baseY);
    ctx.lineTo(x + SPIKE_W / 2, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Draw a platform ─────────────────────────────────────────────────────────
  function drawPlatform(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#22cc66';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(x, y, PLAT_W, PLAT_H, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Main draw ───────────────────────────────────────────────────────────────
  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, W, H);

    if (screen === 'title') { drawTitle(ctx); return; }
    if (screen === 'gameover') { drawGameOver(ctx); return; }

    // Draw each player's lane
    players.forEach((p, pi) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, p.laneTop, W, p.laneH);
      ctx.clip();

      // Lane divider line (subtle scrolling)
      const scrollOff = (tick * speed * 0.3) % 40;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -scrollOff;
      ctx.beginPath();
      ctx.moveTo(0, laneMiddle(p));
      ctx.lineTo(W, laneMiddle(p));
      ctx.stroke();
      ctx.setLineDash([]);

      // Floor & ceiling lines
      ctx.strokeStyle = p.color + '55';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, laneFloor(p));
      ctx.lineTo(W, laneFloor(p));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, laneCeiling(p));
      ctx.lineTo(W, laneCeiling(p));
      ctx.stroke();

      // Player label (2p mode)
      if (mode === '2p') {
        ctx.fillStyle = p.color + 'aa';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`P${pi + 1}`, 8, p.laneTop + 16);
      }

      // Obstacles
      for (const obs of obstacles) {
        if (obs.type === 'platform') {
          drawPlatform(ctx, obs.x, p.laneTop + p.laneH * obs.laneOffset);
        } else if (obs.type === 'spike_bot') {
          // base at floor, tip points up into lane
          drawSpike(ctx, obs.x, laneFloor(p), laneFloor(p) - SPIKE_H);
        } else {
          // base at ceiling, tip points down into lane
          drawSpike(ctx, obs.x, laneCeiling(p), laneCeiling(p) + SPIKE_H);
        }
      }

      // Player
      if (!p.dead) drawPlayer(p);

      // Dead overlay
      if (p.dead) {
        ctx.fillStyle = 'rgba(180,0,0,0.18)';
        ctx.fillRect(0, p.laneTop, W, p.laneH);
        ctx.fillStyle = p.color;
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 16;
        ctx.fillText('DEAD', W / 2, laneMiddle(p) + 8);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });

    // 2p lane separator
    if (mode === '2p') {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
    }

    // HUD
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 18px monospace';
    ctx.shadowColor = '#aa44ff';
    ctx.shadowBlur = 12;
    ctx.fillText(`SCORE  ${score}`, W / 2, 22);
    ctx.shadowBlur = 0;
  }

  // ── Title screen ────────────────────────────────────────────────────────────
  function drawTitle(ctx) {
    // Glow title
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px monospace';
    ctx.shadowColor = '#aa44ff';
    ctx.shadowBlur = 28 + Math.sin(tick * 0.05) * 8;
    ctx.fillStyle = '#cc77ff';
    ctx.fillText('GRAVITY', W / 2, 120);
    ctx.fillText('CHANGER', W / 2, 178);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '14px monospace';
    ctx.fillText('Flip gravity — dodge spikes — survive', W / 2, 220);

    // Buttons
    const btns = ['1 PLAYER', '2 PLAYERS'];
    btns.forEach((label, i) => {
      const bx = W / 2 - 100 + i * 210 - 10;
      const by = 260;
      const bw = 160;
      const bh = 44;
      const hov = hovTitleBtn === i;
      ctx.strokeStyle = '#aa44ff';
      ctx.lineWidth = hov ? 2.5 : 1.5;
      ctx.fillStyle = hov ? 'rgba(170,68,255,0.22)' : 'rgba(170,68,255,0.08)';
      ctx.shadowColor = '#aa44ff';
      ctx.shadowBlur = hov ? 20 : 6;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 10);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = hov ? '#cc88ff' : '#aa44ff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(label, bx + bw / 2, by + 28);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '12px monospace';
    ctx.fillText('SPACE / A / L  to flip gravity   •   ESC to menu', W / 2, 340);
    ctx.textAlign = 'left';
  }

  function titleBtnBounds(i) {
    const bx = W / 2 - 100 + i * 210 - 10;
    return { x: bx, y: 260, w: 160, h: 44 };
  }

  // ── Game-over screen ────────────────────────────────────────────────────────
  function drawGameOver(ctx) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px monospace';
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ff6666';
    ctx.fillText('GAME OVER', W / 2, 150);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`Score: ${score}`, W / 2, 200);

    // Back to menu button
    const bx = W / 2 - 90, by = 250, bw = 180, bh = 44;
    const hov = hovGOBtn === 0;
    ctx.strokeStyle = '#aa44ff';
    ctx.lineWidth = hov ? 2.5 : 1.5;
    ctx.fillStyle = hov ? 'rgba(170,68,255,0.22)' : 'rgba(170,68,255,0.08)';
    ctx.shadowColor = '#aa44ff';
    ctx.shadowBlur = hov ? 20 : 6;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = hov ? '#cc88ff' : '#aa44ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('BACK TO MENU', W / 2, by + 28);
    ctx.textAlign = 'left';
  }

  function goMenuBounds() { return { x: W / 2 - 90, y: 250, w: 180, h: 44 }; }

  // ── Game loop ───────────────────────────────────────────────────────────────
  function gameLoop() {
    animId = requestAnimationFrame(gameLoop);
    tick++;

    if (screen === 'title' || screen === 'gameover') {
      draw();
      return;
    }

    // Speed ramp
    if (tick % 120 === 0) speed = Math.min(speed + 0.35, 14);
    spawnGap = Math.max(52, 110 - Math.floor((speed - 6.5) / 0.35) * 6);

    // Spawn obstacles
    if (tick >= nextSpawn) {
      spawnObstacle();
      nextSpawn = tick + spawnGap;
    }

    // Scroll obstacles
    for (const obs of obstacles) obs.x -= speed;
    // Remove off-screen
    while (obstacles.length && obstacles[0].x < -60) obstacles.shift();

    // Update players
    players.forEach(updatePlayer);

    // Score
    score = Math.floor(tick / 6);

    // Check all dead
    if (players.every(p => p.dead)) {
      setTimeout(() => { screen = 'gameover'; }, 600);
    }

    draw();
  }

  // ── Start game (after mode selected) ────────────────────────────────────────
  function startGame() {
    tick = 0;
    score = 0;
    speed = 6.5;
    spawnGap = 110;
    nextSpawn = 80;
    obstacles = [];

    if (mode === '1p') {
      players = [makePlayer(0, H, '#4488ff', { flip: false })];
    } else {
      players = [
        makePlayer(0, H / 2, '#4488ff', { flip: false }),
        makePlayer(H / 2, H / 2, '#ff4455', { flip: false }),
      ];
    }
    screen = 'game';
  }

  // ── Input ───────────────────────────────────────────────────────────────────
  const keysDown = new Set();

  function onKeyDown(e) {
    if (!running) return;
    if (e.code === 'Escape') {
      cleanup();
      showMenu();
      return;
    }

    if (screen === 'title') return; // handled by click
    if (screen === 'gameover') return; // handled by click

    // Player 1: Space
    if (e.code === 'Space' || e.code === 'KeyA') {
      if (players[0] && !players[0].dead) players[0].keys.flip = true;
    }
    // Player 2: L
    if (e.code === 'KeyL') {
      if (players[1] && !players[1].dead) players[1].keys.flip = true;
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space' || e.code === 'KeyA') {
      if (players[0]) players[0].keys.flip = false;
    }
    if (e.code === 'KeyL') {
      if (players[1]) players[1].keys.flip = false;
    }
  }

  // ── Mouse / touch for menus ─────────────────────────────────────────────────
  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      mx: (src.clientX - rect.left) * (W / rect.width),
      my: (src.clientY - rect.top)  * (H / rect.height),
    };
  }

  function onMouseMove(e) {
    if (!running) return;
    const { mx, my } = canvasCoords(e);
    if (screen === 'title') {
      hovTitleBtn = -1;
      [0, 1].forEach(i => {
        const b = titleBtnBounds(i);
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) hovTitleBtn = i;
      });
      canvas.style.cursor = hovTitleBtn >= 0 ? 'pointer' : 'default';
    } else if (screen === 'gameover') {
      const b = goMenuBounds();
      hovGOBtn = (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) ? 0 : -1;
      canvas.style.cursor = hovGOBtn === 0 ? 'pointer' : 'default';
    }
  }

  function onClick(e) {
    if (!running) return;
    const { mx, my } = canvasCoords(e);

    if (screen === 'title') {
      [0, 1].forEach(i => {
        const b = titleBtnBounds(i);
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          mode = i === 0 ? '1p' : '2p';
          startGame();
        }
      });
    } else if (screen === 'gameover') {
      const b = goMenuBounds();
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        screen = 'title';
        tick = 0;
      }
    } else if (screen === 'game') {
      // In 2p mode tap top half = P1, bottom half = P2; in 1p tap anywhere = P1
      const flipPlayer = (p) => {
        if (p && !p.dead) {
          p.keys.flip = true;
          setTimeout(() => { if (p) p.keys.flip = false; }, 80);
        }
      };
      if (mode === '2p') {
        flipPlayer(my < H / 2 ? players[0] : players[1]);
      } else {
        flipPlayer(players[0]);
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  function cleanup() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    canvas.style.cursor = 'default';
    hovTitleBtn = -1;
    hovGOBtn = -1;
  }

  function onTouchStart(e) {
    if (!running) return;
    e.preventDefault();
    onClick(e);
  }

  // ── Public start ────────────────────────────────────────────────────────────
  function start() {
    cleanup();
    running = true;
    screen = 'title';
    tick = 0;
    hovTitleBtn = -1;
    hovGOBtn = -1;

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    gameLoop();
  }

  return { start };
})();
