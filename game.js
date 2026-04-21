const GeometryDash = (() => {
  const GROUND_Y = 310;
  const GRAVITY = 0.7;
  const JUMP_FORCE = -14.5;
  const BASE_SPEED = 6;

  let player, obstacles, particles, trail, score, deaths, bestScore, gameOver, animFrame, frameCount, speed, shakeFrames;
  let gpXWasPressed = false;
  let gdDeaths = 0;

  const STARS = Array.from({ length: 80 }, () => ({
    x: Math.random() * 800,
    y: Math.random() * GROUND_Y * 0.9,
    r: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 0.4 + 0.1,
  }));

  const PATTERNS = [
    (x) => [{ x, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' }],
    (x) => [
      { x, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
      { x: x + 44, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
    ],
    (x) => [
      { x, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
      { x: x + 44, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
      { x: x + 88, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
    ],
    (x) => [{ x, y: GROUND_Y + 38, w: 34, h: 80, type: 'block' }],
    (x) => [
      { x, y: GROUND_Y + 38, w: 34, h: 80, type: 'block' },
      { x: x + 60, y: GROUND_Y + 38, w: 32, h: 42, type: 'spike' },
    ],
    (x) => [
      { x, y: GROUND_Y + 38, w: 34, h: 45, type: 'block' },
      { x: x + 46, y: GROUND_Y + 38, w: 34, h: 80, type: 'block' },
    ],
  ];

  function init() {
    player = { x: 110, y: GROUND_Y, width: 38, height: 38, vy: 0, onGround: true, rotation: 0 };
    obstacles = [];
    particles = [];
    trail = [];
    score = 0;
    gameOver = false;
    frameCount = 0;
    speed = BASE_SPEED;
    shakeFrames = 0;
    if (animFrame) cancelAnimationFrame(animFrame);
    gameLoop();
  }

  function jump() {
    if (gameOver) { init(); return; }
    if (player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
    }
  }

  function onKeyDown(e) {
    if (e.code === 'Space') jump();
    if (e.code === 'Escape') { stop(); showMenu(); }
  }

  function onCanvasClick() { jump(); }

  function spawnObstacle() {
    const unlocked = Math.min(PATTERNS.length, 2 + Math.floor(score / 200));
    const pattern = PATTERNS[Math.floor(Math.random() * unlocked)];
    pattern(820).forEach((o) => obstacles.push(o));
  }

  function getSpawnInterval() {
    return Math.max(48, 115 - Math.floor(score / 8));
  }

  function spawnDeathParticles() {
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = Math.random() * 6 + 2;
      particles.push({
        x: player.x + player.width / 2,
        y: player.y + player.height / 2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 3,
        life: 1,
        decay: Math.random() * 0.03 + 0.02,
        r: Math.random() * 6 + 3,
        color: ['#00eaff', '#ffffff', '#ff4444', '#ffcc00'][Math.floor(Math.random() * 4)],
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateTrail() {
    trail.push({ x: player.x + player.width / 2, y: player.y + player.height / 2, life: 1 });
    if (trail.length > 18) trail.shift();
    trail.forEach((t) => (t.life -= 0.07));
  }

  function update() {
    frameCount++;
    score++;
    speed = BASE_SPEED + score * 0.003;
    if (frameCount % getSpawnInterval() === 0) spawnObstacle();
    updateTrail();
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      if (!player.onGround) {
        // Snap to nearest 90° so the cube sits flat on landing
        player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
      }
      player.onGround = true;
    }
    player.rotation += player.onGround ? 0 : (speed / BASE_SPEED) * 0.12;

    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed;
      if (obstacles[i].x + obstacles[i].w < 0) { obstacles.splice(i, 1); continue; }
      if (collides(player, obstacles[i])) {
        spawnDeathParticles();
        if (score > bestScore * 10) { bestScore = Math.floor(score / 10); localStorage.setItem('gdBest', bestScore); }
        shakeFrames = 18;
        gdDeaths++;
        gameOver = true;
      }
    }
    updateParticles();
    if (shakeFrames > 0) shakeFrames--;
    STARS.forEach((s) => { s.x -= s.speed * (speed / BASE_SPEED); if (s.x < 0) s.x = 800; });
  }

  function collides(a, ob) {
    const m = 5;
    return a.x + m < ob.x + ob.w && a.x + a.width - m > ob.x && a.y + m < ob.y && a.y + a.height - m > ob.y - ob.h;
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, '#0a0020'); grad.addColorStop(1, '#1e0550');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, GROUND_Y);
    STARS.forEach((s) => {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + s.r * 0.2})`; ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    const lineOff = (frameCount * speed) % 60;
    for (let x = -lineOff; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y); ctx.stroke(); }
    for (let y = 0; y < GROUND_Y; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    const gGrad = ctx.createLinearGradient(0, GROUND_Y + 38, 0, canvas.height);
    gGrad.addColorStop(0, '#3d1a7a'); gGrad.addColorStop(1, '#1a0533');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, GROUND_Y + 38, canvas.width, canvas.height - GROUND_Y - 38);
    ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#c084fc'; ctx.fillRect(0, GROUND_Y + 36, canvas.width, 4);
    ctx.shadowBlur = 0;
  }

  function drawTrail() {
    trail.forEach((t, i) => {
      ctx.save();
      ctx.globalAlpha = t.life * 0.5;
      const size = (i / trail.length) * 20;
      ctx.fillStyle = '#00eaff'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 8;
      ctx.fillRect(t.x - size / 2, t.y - size / 2, size, size);
      ctx.restore();
    });
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    ctx.rotate(player.rotation);
    ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#00eaff';
    ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#003d80';
    ctx.fillRect(-player.width / 2 + 5, -player.height / 2 + 5, player.width - 10, player.height - 10);
    ctx.fillStyle = '#00eaff';
    ctx.fillRect(-player.width / 2 + 10, -player.height / 2 + 10, player.width - 20, player.height - 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-player.width / 2 + 15, -player.height / 2 + 15, player.width - 30, player.height - 30);
    ctx.restore();
  }

  function drawObstacle(ob) {
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 14;
    if (ob.type === 'spike') {
      const grad = ctx.createLinearGradient(ob.x, ob.y, ob.x + ob.w / 2, ob.y - ob.h);
      grad.addColorStop(0, '#cc0000'); grad.addColorStop(1, '#ff6666');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(ob.x, ob.y); ctx.lineTo(ob.x + ob.w / 2, ob.y - ob.h); ctx.lineTo(ob.x + ob.w, ob.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff8888'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      const grad = ctx.createLinearGradient(ob.x, ob.y - ob.h, ob.x, ob.y);
      grad.addColorStop(0, '#ff6666'); grad.addColorStop(1, '#880000');
      ctx.fillStyle = grad; ctx.fillRect(ob.x, ob.y - ob.h, ob.w, ob.h);
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.strokeRect(ob.x, ob.y - ob.h, ob.w, ob.h);
    }
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawHUD() {
    const pts = Math.floor(score / 10);
    ctx.font = 'bold 22px monospace'; ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#00eaff'; ctx.fillText(`${pts}`, 20, 36);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '13px monospace';
    ctx.fillText(`BEST ${bestScore}`, 20, 56);
    ctx.fillText(`DEATHS ${gdDeaths}`, 20, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px monospace';
    ctx.fillText('ESC = MENU', 20, 92);
    const barW = 120;
    const pct = Math.min(1, (speed - BASE_SPEED) / 4);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(canvas.width - barW - 20, 14, barW, 10);
    ctx.fillStyle = `hsl(${180 - pct * 120}, 100%, 60%)`;
    ctx.fillRect(canvas.width - barW - 20, 14, barW * pct, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '11px monospace';
    ctx.fillText('SPEED', canvas.width - barW - 20, 40);
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff4444'; ctx.font = 'bold 64px monospace';
    ctx.fillText('YOU DIED', canvas.width / 2, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px monospace';
    ctx.fillText(`Score: ${Math.floor(score / 10)}`, canvas.width / 2, 210);
    if (Math.floor(score / 10) >= bestScore && score > 10) {
      ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 12;
      ctx.font = 'bold 20px monospace'; ctx.fillText('NEW BEST!', canvas.width / 2, 245);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '18px monospace';
    ctx.fillText(`Deaths: ${gdDeaths}`, canvas.width / 2, 280);
    ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#00eaff'; ctx.font = '20px monospace';
    ctx.fillText('SPACE or CLICK to try again', canvas.width / 2, 330);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 0; ctx.font = '14px monospace';
    ctx.fillText('ESC for menu', canvas.width / 2, 358);
    ctx.textAlign = 'left';
  }

  function draw() {
    ctx.save();
    if (shakeFrames > 0) {
      const mag = shakeFrames * 0.7;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);
    drawBackground(); drawTrail(); obstacles.forEach(drawObstacle); drawPlayer(); drawParticles();
    ctx.restore();
    drawHUD();
    if (gameOver) drawGameOver();
  }

  function gameLoop() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let xNow = false;
    for (const gp of pads) { if (!gp) continue; if (gp.buttons[0]?.pressed) xNow = true; break; }
    if (xNow && !gpXWasPressed && gameOver) { gpXWasPressed = false; stop(); showMenu(); return; }
    gpXWasPressed = xNow;
    if (!gameOver) update();
    draw();
    animFrame = requestAnimationFrame(gameLoop);
  }

  function onCanvasTouchEnd(e) { e.preventDefault(); jump(); }

  function start() {
    bestScore = parseInt(localStorage.getItem('gdBest') || '0');
    hideTouchControls(); // GD uses tap-anywhere; no D-pad needed
    document.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchend', onCanvasTouchEnd, { passive: false });
    init();
  }

  function stop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    document.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('touchend', onCanvasTouchEnd);
  }

  return { start, stop };
})();
