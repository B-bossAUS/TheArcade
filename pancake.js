const PancakeFlip = (() => {
  const PAN_X = 370, PAN_Y = 192;
  const PAN_R = 143;
  const BATTER_R = 126;
  const TOTAL_PANCAKES = 5;
  const FLIP_DUR = 0.5;
  const SCORE_DUR = 2.2;
  const BTN_X = 400, BTN_Y = 366;

  let state, pancakeNum, totalStars;
  let cookTimer, cookTime, side1Pct, side2Pct;
  let bubbles, steam, particles, feedback;
  let feedbackTimer, stateTimer, pourRadius;
  let flipTimer, flipScaleY, flipSideCooked;
  let frameCount, animFrame, lastTime;

  // ── helpers ──
  function rng(a, b) { return Math.random() * (b - a) + a; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function getCookTime(n)    { return Math.max(4.5, 10 - (n - 1) * 0.8); }
  function getBubbleCount(n) { return Math.min(34, 20 + (n - 1) * 2); }

  // ── bubble system ──
  function spawnBubbles(speedMult) {
    bubbles = [];
    const n = getBubbleCount(pancakeNum);
    for (let i = 0; i < n; i++) {
      const angle = rng(0, Math.PI * 2);
      const dist  = Math.sqrt(Math.random()) * (BATTER_R - 12);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      const maxR = rng(3, 7.5);
      const distFromEdge = BATTER_R - Math.sqrt(x * x + y * y);
      // Outer bubbles pop first (small delay), inner last (large delay)
      const popDelay = (distFromEdge / BATTER_R) * cookTime * 0.86 * speedMult;
      bubbles.push({
        x, y, r: 0, maxR,
        formTime: rng(0.8, 2.2),
        age: 0,
        popDelay,
        state: 'forming',
        ringR: 0, ringAlpha: 0,
      });
    }
  }

  function makeSteam() {
    const angle = rng(0, Math.PI * 2);
    const r = BATTER_R - 10 + rng(0, 16);
    return {
      x: Math.cos(angle) * r, y: Math.sin(angle) * r,
      vx: rng(-0.35, 0.35), vy: -rng(0.3, 0.7),
      alpha: rng(0.06, 0.32), size: rng(4, 9),
      life: Math.random(),
    };
  }

  function getPoppedFraction() {
    if (!bubbles.length) return 0;
    return bubbles.filter(b => b.state === 'popping' || b.state === 'done').length / bubbles.length;
  }

  function calcStars(pct) {
    if (pct < 0.42) return 0;      // raw
    if (pct < 0.58) return 1;      // a bit early
    if (pct <= 0.85) return 3;     // perfect window
    if (pct <= 0.95) return 2;     // a bit late
    return 0;                       // burnt
  }

  function feedbackFor(pct) {
    if (pct < 0.42) return { text: 'Too raw!',      color: '#ff6644' };
    if (pct < 0.58) return { text: 'A bit early',   color: '#ffaa44' };
    if (pct <= 0.85) return { text: 'Perfect!',     color: '#44ff88' };
    if (pct <= 0.95) return { text: 'A bit late',   color: '#ffcc44' };
    return                  { text: 'Burnt!',        color: '#ff3333' };
  }

  // ── init ──
  function initGame() {
    pancakeNum = 1; totalStars = 0; frameCount = 0;
    startPancake();
  }

  function startPancake() {
    cookTime = getCookTime(pancakeNum);
    cookTimer = 0; stateTimer = 0; feedbackTimer = 0;
    pourRadius = 0; flipTimer = 0; flipScaleY = 1; flipSideCooked = false;
    side1Pct = 0; side2Pct = 0;
    bubbles = []; particles = []; feedback = null;
    steam = Array.from({ length: 12 }, makeSteam);
    state = 'pouring';
  }

  // ── actions ──
  function doFlip() {
    if (state !== 'cooking1') return;
    side1Pct = getPoppedFraction();
    const fb = feedbackFor(side1Pct);
    setFeedback(fb.text, fb.color);
    state = 'flipping';
    flipTimer = 0; flipScaleY = 1; flipSideCooked = false;
  }

  function doPlate() {
    if (state !== 'cooking2') return;
    side2Pct = getPoppedFraction();
    const s1 = calcStars(side1Pct);
    const s2 = calcStars(side2Pct);
    const pStars = Math.min(s1, s2);
    totalStars += pStars;
    const fb = feedbackFor(side2Pct);
    const label = fb.text + (pStars > 0 ? '  ' + '⭐'.repeat(pStars) : '  (No stars)');
    setFeedback(label, fb.color);
    state = 'scored';
    stateTimer = SCORE_DUR;
    spawnPlateParticles();
  }

  function setFeedback(text, color) {
    feedback = { text, color, y: 138, alpha: 1 };
    feedbackTimer = 1.8;
  }

  function spawnPlateParticles() {
    for (let i = 0; i < 22; i++) {
      const angle = rng(0, Math.PI * 2);
      const spd = rng(1.5, 5);
      particles.push({
        x: PAN_X, y: PAN_Y,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2,
        r: rng(3, 7), color: ['#f5d080', '#ffcc44', '#e8a040', '#ffffff'][Math.floor(Math.random() * 4)],
        life: 1, decay: rng(0.018, 0.035),
      });
    }
  }

  // ── update ──
  function update(dt) {
    frameCount++;

    // Steam
    if (state === 'pouring' || state === 'cooking1' || state === 'cooking2') {
      steam.forEach(s => {
        s.x += s.vx; s.y += s.vy; s.alpha -= dt * 0.28;
        s.size += dt * 0.9; s.life -= dt * 0.38;
        if (s.life <= 0 || s.alpha <= 0) Object.assign(s, makeSteam());
      });
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Feedback float
    if (feedbackTimer > 0) {
      feedbackTimer -= dt;
      if (feedback) { feedback.y -= dt * 36; feedback.alpha = clamp(feedbackTimer / 1.2, 0, 1); }
    }

    if (state === 'pouring') {
      pourRadius += dt * (BATTER_R / 0.55);
      if (pourRadius >= BATTER_R) {
        pourRadius = BATTER_R;
        state = 'cooking1';
        cookTimer = 0;
        spawnBubbles(1);
      }
      return;
    }

    if (state === 'cooking1' || state === 'cooking2') {
      const sp = state === 'cooking2' ? 0.65 : 1;
      cookTimer += dt;

      bubbles.forEach(b => {
        b.age += dt;
        if (b.state === 'forming') {
          b.r = Math.min(b.maxR, b.maxR * (b.age / b.formTime));
          if (b.age >= b.formTime) b.state = 'ready';
        }
        if ((b.state === 'ready' || b.state === 'forming') && cookTimer >= b.popDelay * sp) {
          b.state = 'popping'; b.r = 0; b.ringR = b.maxR; b.ringAlpha = 0.85;
        }
        if (b.state === 'popping') {
          b.ringR += dt * 22;
          b.ringAlpha -= dt * 1.6;
          if (b.ringAlpha <= 0) { b.ringAlpha = 0; b.state = 'done'; }
        }
      });

      // Auto-force if truly burnt (all done + 20% extra time)
      if (bubbles.every(b => b.state === 'done') && cookTimer > cookTime * 1.18) {
        if (state === 'cooking1') doFlip();
        else doPlate();
      }
      return;
    }

    if (state === 'flipping') {
      flipTimer += dt;
      const prog = flipTimer / FLIP_DUR;
      flipScaleY = Math.abs(Math.cos(prog * Math.PI));
      if (prog >= 0.5 && !flipSideCooked) flipSideCooked = true;
      if (flipTimer >= FLIP_DUR) {
        state = 'cooking2';
        cookTimer = 0;
        spawnBubbles(0.65);
      }
      return;
    }

    if (state === 'scored') {
      stateTimer -= dt;
      if (stateTimer <= 0) {
        if (pancakeNum >= TOTAL_PANCAKES) state = 'gameover';
        else { pancakeNum++; startPancake(); }
      }
    }
  }

  // ── draw helpers ──
  function drawBackground() {
    ctx.fillStyle = '#211810';
    ctx.fillRect(0, 0, 800, 400);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 800; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 400); ctx.stroke(); }
    for (let y = 0; y < 400; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke(); }
  }

  function drawPan() {
    // Handle
    ctx.fillStyle = '#151515';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(PAN_X + PAN_R - 4, PAN_Y - 15, 94, 30, 15); ctx.fill();
    ctx.fillStyle = '#2e2e2e';
    ctx.beginPath(); ctx.roundRect(PAN_X + PAN_R, PAN_Y - 11, 86, 22, 11); ctx.fill();
    ctx.shadowBlur = 0;
    // Rim
    ctx.shadowColor = '#000'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath(); ctx.arc(PAN_X, PAN_Y, PAN_R + 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Inner surface
    const pg = ctx.createRadialGradient(PAN_X - 25, PAN_Y - 25, 8, PAN_X, PAN_Y, PAN_R);
    pg.addColorStop(0, '#3d3d3d'); pg.addColorStop(1, '#181818');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(PAN_X, PAN_Y, PAN_R, 0, Math.PI * 2); ctx.fill();
    // Specular rim
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(PAN_X, PAN_Y, PAN_R + 3, Math.PI * 1.05, Math.PI * 1.9); ctx.stroke();
  }

  function drawBatter() {
    const r = state === 'pouring' ? pourRadius : BATTER_R;
    const scaleY = state === 'flipping' ? flipScaleY : 1;
    const cooked = flipSideCooked || state === 'cooking2' || state === 'scored';
    const browning = (state === 'cooking1' || state === 'cooking2')
      ? clamp(cookTimer / cookTime, 0, 1) : (cooked ? 0.55 : 0);

    ctx.save();
    ctx.translate(PAN_X, PAN_Y);
    ctx.scale(1, scaleY);

    // Clip
    ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2); ctx.clip();

    // Base color
    const cCenter = cooked ? '#c8882a' : '#f2c86a';
    const cEdge   = cooked ? '#7a3a00' : '#d49030';
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    bg.addColorStop(0,   cCenter);
    bg.addColorStop(0.75, cEdge);
    bg.addColorStop(1,   '#5a2200');
    ctx.fillStyle = bg;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Edge browning overlay (expands inward)
    if (browning > 0.05) {
      const innerR = r * clamp(1 - browning * 0.75, 0, 1);
      const ov = ctx.createRadialGradient(0, 0, innerR, 0, 0, r);
      ov.addColorStop(0,   'rgba(80,28,0,0)');
      ov.addColorStop(0.4, `rgba(90,30,0,${browning * 0.55})`);
      ov.addColorStop(1,   `rgba(30,8,0,${clamp(browning * 1.3, 0, 1)})`);
      ctx.fillStyle = ov;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }

    ctx.restore();
  }

  function drawBubbles() {
    if (!bubbles.length) return;
    const scaleY = state === 'flipping' ? flipScaleY : 1;
    ctx.save();
    ctx.translate(PAN_X, PAN_Y);
    ctx.scale(1, scaleY);

    bubbles.forEach(b => {
      if (b.state === 'forming' || b.state === 'ready') {
        // Outer circle
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.9; ctx.stroke();
        // Highlight
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fill();
      }
      if (b.state === 'popping' && b.ringAlpha > 0) {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(195,148,60,${b.ringAlpha})`; ctx.lineWidth = 1.4; ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawSteam() {
    if (state !== 'pouring' && state !== 'cooking1' && state !== 'cooking2') return;
    ctx.save();
    ctx.translate(PAN_X, PAN_Y);
    steam.forEach(s => {
      if (s.alpha <= 0) return;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,210,210,${s.alpha})`; ctx.fill();
    });
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }

  function drawButton() {
    if (state !== 'cooking1' && state !== 'cooking2') return;
    const isFlip = state === 'cooking1';
    const label  = isFlip ? 'FLIP !' : 'PLATE IT !';
    const pct    = getPoppedFraction();
    const perfect = pct >= 0.58 && pct <= 0.85;
    const color  = perfect ? '#44ff88' : (pct > 0.85 ? '#ff5533' : '#ff9922');
    const pulse  = perfect ? 1 + Math.sin(frameCount * 0.14) * 0.055 : 1;

    ctx.save();
    ctx.translate(BTN_X, BTN_Y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = color; ctx.shadowBlur = perfect ? 22 : 10;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-88, -24, 176, 48, 24); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, 0, 7);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawHUD() {
    // Top-left: pancake counter
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`Pancake  ${pancakeNum} / ${TOTAL_PANCAKES}`, 18, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '11px monospace';
    ctx.fillText('ESC = MENU  •  SPACE = action', 18, 46);

    // Top-right: star total
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffcc44'; ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 8;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`⭐  ${totalStars}`, 782, 28);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Bubble progress bar (bottom strip, only while cooking)
    if (state === 'cooking1' || state === 'cooking2') {
      const pct = getPoppedFraction();
      const bw = 210, bx = BTN_X - bw / 2, by = 390;

      // Perfect-window highlight
      ctx.fillStyle = 'rgba(68,255,136,0.18)';
      ctx.fillRect(bx + bw * 0.58, by, bw * 0.27, 7);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, by, bw, 7);

      const barCol = (pct >= 0.58 && pct <= 0.85) ? '#44ff88' : pct > 0.85 ? '#ff5533' : '#ffcc44';
      ctx.fillStyle = barCol;
      ctx.fillRect(bx, by, bw * pct, 7);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(pct * 100)}% bubbles popped  —  green zone = perfect`, BTN_X, by - 5);
      ctx.textAlign = 'left';
    }
  }

  function drawFeedback() {
    if (!feedback || feedbackTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(feedback.alpha, 0, 1);
    ctx.shadowColor = feedback.color; ctx.shadowBlur = 16;
    ctx.fillStyle = feedback.color;
    ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
    ctx.fillText(feedback.text, PAN_X, feedback.y);
    ctx.restore(); ctx.textAlign = 'left';
  }

  function drawScoredOverlay() {
    if (state !== 'scored' && state !== 'gameover') return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 800, 400);
    ctx.textAlign = 'center';

    if (state === 'gameover') {
      ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffcc44'; ctx.font = 'bold 46px monospace';
      ctx.fillText("All Pancakes Done!", 400, 88);
      ctx.shadowBlur = 0;

      // Draw pancake stack
      for (let i = TOTAL_PANCAKES - 1; i >= 0; i--) {
        const sy = 260 - i * 17;
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5;
        ctx.fillStyle = i % 2 === 0 ? '#d49030' : '#bb7418';
        ctx.beginPath(); ctx.ellipse(400, sy, 62, 13, 0, 0, Math.PI * 2); ctx.fill();
        // Butter pat on top pancake
        if (i === TOTAL_PANCAKES - 1) {
          ctx.fillStyle = '#ffe088';
          ctx.beginPath(); ctx.ellipse(400, sy - 4, 14, 6, 0.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px monospace';
      ctx.fillText(`Final score:  ⭐  ${totalStars}  /  ${TOTAL_PANCAKES * 3}  stars`, 400, 318);

      ctx.fillStyle = '#44ff88'; ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 10;
      ctx.font = '18px monospace'; ctx.fillText('SPACE  —  play again', 400, 356);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = '14px monospace';
      ctx.fillText('ESC  —  main menu', 400, 382);
      ctx.textAlign = 'left';
      return;
    }

    // Per-pancake score
    const s1 = calcStars(side1Pct), s2 = calcStars(side2Pct);
    const pStars = Math.min(s1, s2);

    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px monospace';
    ctx.fillText(`Pancake ${pancakeNum} complete`, 400, 145);

    ctx.font = '38px monospace';
    ctx.fillText(
      pStars > 0 ? '⭐'.repeat(pStars) + '☆'.repeat(3 - pStars) : '☆ ☆ ☆  (no stars)',
      400, 195
    );

    ctx.fillStyle = 'rgba(255,255,255,0.48)'; ctx.font = '14px monospace';
    ctx.fillText(
      `Side 1: ${Math.round(side1Pct * 100)}% popped   |   Side 2: ${Math.round(side2Pct * 100)}% popped`,
      400, 232
    );

    ctx.fillStyle = '#ffcc44'; ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 6;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`Running total:  ⭐  ${totalStars}`, 400, 265);
    ctx.shadowBlur = 0;

    if (pancakeNum < TOTAL_PANCAKES) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '14px monospace';
      ctx.fillText('Next pancake loading…', 400, 300);
    }
    ctx.textAlign = 'left';
  }

  // ── main loop ──
  function draw() {
    ctx.clearRect(0, 0, 800, 400);
    drawBackground();
    drawPan();
    if (state !== 'gameover') {
      drawBatter();
      if (state !== 'flipping') drawBubbles();
      drawSteam();
    }
    drawParticles();
    drawButton();
    drawHUD();
    drawFeedback();
    drawScoredOverlay();
  }

  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    draw();
    animFrame = requestAnimationFrame(loop);
  }

  // ── input ──
  function hitBtn(mx, my) { return Math.abs(mx - BTN_X) <= 90 && Math.abs(my - BTN_Y) <= 26; }

  function screenToCanvas(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (cx - r.left) * (canvas.width  / r.width),
      y: (cy - r.top)  * (canvas.height / r.height),
    };
  }

  function handleAction(mx, my) {
    if (hitBtn(mx, my)) {
      if (state === 'cooking1') doFlip();
      else if (state === 'cooking2') doPlate();
    }
  }

  function onClick(e) {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    handleAction(x, y);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    const { x, y } = screenToCanvas(t.clientX, t.clientY);
    handleAction(x, y);
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') { stop(); showMenu(); return; }
    if (e.code === 'Space') {
      if (state === 'gameover')  { initGame(); return; }
      if (state === 'cooking1')  doFlip();
      else if (state === 'cooking2') doPlate();
    }
  }

  // ── lifecycle ──
  function start() {
    hideTouchControls();
    document.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    initGame();
    lastTime = performance.now();
    animFrame = requestAnimationFrame(loop);
  }

  function stop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    document.removeEventListener('keydown', onKeyDown);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchend', onTouchEnd);
  }

  return { start, stop };
})();
