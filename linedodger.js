// Laser Dodge — dodge incoming red lines
const LineDodger = (() => {
  const W = 800, H = 400;
  const P_SPEED = 4;
  const LINE_LEN = W / 4;  // 200px
  const LINE_THICK = 5;
  const BASE_SPAWN = 30;   // frames between spawns at start (~0.5s @ 60fps)

  let player, lines, score, gameOver, animId, frame, lineSpeed, legPhase;
  let running = false;

  const keysHeld = {};
  const gpTouch  = { up: false, down: false, left: false, right: false };

  const GP_DEAD = 0.25; // joystick deadzone

  function pollGamepad() {
    gpTouch.up = gpTouch.down = gpTouch.left = gpTouch.right = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      // Left joystick
      if (gp.axes[1] < -GP_DEAD) gpTouch.up    = true;
      if (gp.axes[1] >  GP_DEAD) gpTouch.down  = true;
      if (gp.axes[0] < -GP_DEAD) gpTouch.left  = true;
      if (gp.axes[0] >  GP_DEAD) gpTouch.right = true;
      // D-pad buttons (standard mapping: 12=up,13=down,14=left,15=right)
      if (gp.buttons[12]?.pressed) gpTouch.up    = true;
      if (gp.buttons[13]?.pressed) gpTouch.down  = true;
      if (gp.buttons[14]?.pressed) gpTouch.left  = true;
      if (gp.buttons[15]?.pressed) gpTouch.right = true;
      break; // first connected pad is enough
    }
  }

  // ── D-pad (canvas-drawn touch controls) ────────────────────────────────────
  const DP = { cx: 718, cy: 335, sz: 36, gap: 14 };
  const dpTouch = { up: false, down: false, left: false, right: false };

  function dpBtns() {
    const { cx, cy, sz, gap } = DP;
    return {
      up:    { x: cx - sz / 2,       y: cy - sz - gap, w: sz, h: sz },
      down:  { x: cx - sz / 2,       y: cy + gap,      w: sz, h: sz },
      left:  { x: cx - sz - gap,     y: cy - sz / 2,   w: sz, h: sz },
      right: { x: cx + gap,          y: cy - sz / 2,   w: sz, h: sz },
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

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    player    = { x: 100, y: H / 2 };
    lines     = [];
    score     = 0;
    frame     = 0;
    legPhase  = 0;
    lineSpeed = 4;
    gameOver  = false;
    if (animId) cancelAnimationFrame(animId);
    gameLoop();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update() {
    frame++;
    pollGamepad();

    // Score: 1 per 0.1 s = every 6 frames
    if (frame % 6 === 0) score++;

    // Speed ramp
    lineSpeed = 4 + score * 0.018;

    // Spawn lines
    const spawnInterval = Math.max(18, BASE_SPAWN - Math.floor(score / 12));
    if (frame % spawnInterval === 0) {
      lines.push({ x: W + 10, y: 30 + Math.random() * (H - 60) });
    }

    // Player movement
    const up    = keysHeld['ArrowUp']    || keysHeld['KeyW'] || dpTouch.up    || gpTouch.up;
    const down  = keysHeld['ArrowDown']  || keysHeld['KeyS'] || dpTouch.down  || gpTouch.down;
    const left  = keysHeld['ArrowLeft']  || keysHeld['KeyA'] || dpTouch.left  || gpTouch.left;
    const right = keysHeld['ArrowRight'] || keysHeld['KeyD'] || dpTouch.right || gpTouch.right;

    if (up)    player.y = Math.max(28,      player.y - P_SPEED);
    if (down)  player.y = Math.min(H - 20,  player.y + P_SPEED);
    if (left)  player.x = Math.max(28,      player.x - P_SPEED);
    if (right) player.x = Math.min(W - 28,  player.x + P_SPEED);

    if (up || down || left || right) legPhase += 0.25;

    // Scroll & collide lines
    for (let i = lines.length - 1; i >= 0; i--) {
      lines[i].x -= lineSpeed;
      if (lines[i].x + LINE_LEN < 0) { lines.splice(i, 1); continue; }

      // Slim hitbox (forgiving)
      const lx = lines[i].x, ly = lines[i].y;
      const px = player.x - 7,  py = player.y - 11;
      const pw = 14,             ph = 22;
      if (px < lx + LINE_LEN && px + pw > lx &&
          py < ly + LINE_THICK / 2 + 1 && py + ph > ly - LINE_THICK / 2 - 1) {
        gameOver = true;
      }
    }
  }

  // ── Draw helpers ───────────────────────────────────────────────────────────
  function drawFigure(ctx, x, y, color, phase) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    // Head
    ctx.beginPath(); ctx.arc(x, y - 18, 6, 0, Math.PI * 2); ctx.stroke();
    // Body
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 2); ctx.stroke();
    // Arms
    const aw = Math.sin(phase) * 5;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x - 9, y - 2 + aw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 9, y - 2 - aw); ctx.stroke();
    // Legs
    const l1 = Math.sin(phase) * 8, l2 = Math.sin(phase + Math.PI) * 8;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x - 5, y + 13 + l1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + 5, y + 13 + l2); ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawDpad(ctx) {
    const btns = dpBtns();
    const arrows = { up: '▲', down: '▼', left: '◀', right: '▶' };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [dir, b] of Object.entries(btns)) {
      const active = dpTouch[dir];
      ctx.save();
      ctx.fillStyle   = active ? 'rgba(34,255,102,0.3)' : 'rgba(255,255,255,0.07)';
      ctx.strokeStyle = active ? '#22ff66' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = active ? '#22ff66' : 'transparent';
      ctx.shadowBlur  = active ? 8 : 0;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? '#22ff66' : 'rgba(255,255,255,0.45)';
      ctx.shadowBlur = 0;
      ctx.font = '13px sans-serif';
      ctx.fillText(arrows[dir], b.x + b.w / 2, b.y + b.h / 2);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, W, H);

    // Lines
    for (const ln of lines) {
      ctx.save();
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = LINE_THICK;
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 14;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(ln.x, ln.y);
      ctx.lineTo(ln.x + LINE_LEN, ln.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Player
    drawFigure(ctx, player.x, player.y, '#22ff66', legPhase);

    // D-pad
    drawDpad(ctx);

    // Score HUD
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 18px monospace';
    ctx.shadowColor = '#22ff66';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE  ${score}`, 16, 28);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '11px monospace';
    ctx.fillText('ESC = MENU', 16, 48);

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.font = 'bold 54px monospace';
      ctx.shadowColor = '#ff3333';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ff5555';
      ctx.fillText('GAME OVER', W / 2, 160);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 215);

      ctx.shadowColor = '#22ff66';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#22ff66';
      ctx.font = '18px monospace';
      ctx.fillText('SPACE or CLICK to play again', W / 2, 270);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '13px monospace';
      ctx.fillText('ESC for menu', W / 2, 300);
      ctx.textAlign = 'left';
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function gameLoop() {
    if (!gameOver) update();
    draw();
    animId = requestAnimationFrame(gameLoop);
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!running) return;
    keysHeld[e.code] = true;
    if (e.code === 'Escape') { cleanup(); showMenu(); return; }
    if (e.code === 'Space' && gameOver) init();
  }

  function onKeyUp(e) { keysHeld[e.code] = false; }

  function onClick() { if (running && gameOver) init(); }

  function onTouchStart(e) {
    e.preventDefault();
    updateTouchDirs(e);
    if (gameOver) { init(); return; }
  }

  function onTouchMove(e)  { e.preventDefault(); updateTouchDirs(e); }
  function onTouchEnd(e)   { e.preventDefault(); updateTouchDirs(e); }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    canvas.removeEventListener('click',      onClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove',  onTouchMove);
    canvas.removeEventListener('touchend',   onTouchEnd);
    Object.keys(keysHeld).forEach(k => delete keysHeld[k]);
    dpTouch.up = dpTouch.down = dpTouch.left = dpTouch.right = false;
  }

  // ── Public start ───────────────────────────────────────────────────────────
  function start() {
    cleanup();
    running = true;
    hideTouchControls();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('click',      onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    init();
  }

  return { start };
})();
