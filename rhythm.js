// Rhythm Tap — 4-lane falling note rhythm game with Web Audio backing track
const RhythmTap = (() => {
  const W = 800, H = 400;
  const BPM = 130;
  const BEAT_SEC  = 60 / BPM;          // ~0.4615 s per beat
  const SIXTEENTH = BEAT_SEC / 4;       // ~0.1154 s per 16th note
  const FALL_DURATION = 1.2;            // seconds for note to fall from top to target
  const NOTE_SPEED = (330 + 40) / FALL_DURATION; // px / s  ≈ 308

  const LANE_W = 90, LANE_GAP = 10;
  const LANE_START_X = (W - (4 * LANE_W + 3 * LANE_GAP)) / 2; // 205
  const TARGET_Y = 330;  // centre of hit zone
  const NOTE_H   = 28;

  const LANES = [
    { key: 'ArrowLeft',  symbol: '←', color: '#3388ff' },
    { key: 'ArrowDown',  symbol: '↓', color: '#ff3355' },
    { key: 'ArrowUp',    symbol: '↑', color: '#33ff66' },
    { key: 'ArrowRight', symbol: '→', color: '#ffaa22' },
  ];

  // Note hit pattern per bar: [sixteenth-offset-in-bar, lane]
  const BAR_PATTERN = [[0,0],[2,2],[4,1],[6,3],[8,0],[10,3],[12,1],[14,2]];

  // Bassline Hz pattern (repeats every 8 beats)
  const BASS_HZ = [65, 65, 73, 65, 55, 65, 73, 82];

  // Melody: 2-bar pattern with variable durations (beats)
  const MELODY = [
    {f:523,d:1},{f:587,d:1},{f:659,d:1},{f:784,d:1},
    {f:880,d:1},{f:784,d:1},{f:659,d:1},{f:587,d:1},
    {f:523,d:1},{f:440,d:1},{f:494,d:1},{f:523,d:1},{f:659,d:1},
    {f:784,d:.5},{f:880,d:.5},{f:1047,d:1},
  ];

  // ── state ──────────────────────────────────────────────────────────
  let audioCtx, masterGain, reverbDelay, reverbFbGain;
  let nextSchedTime, sixteenthCtr, nextMelodyTime, melodyBeatIdx;

  let score, combo, bestCombo, lives, gameOver, running;
  let activeNotes, noteQueue, nextNoteIdx;
  let ratingFlashes, missFlash;
  let keysHeld, animId;

  // ── helpers ────────────────────────────────────────────────────────
  function laneX(i)  { return LANE_START_X + i * (LANE_W + LANE_GAP); }
  function laneCX(i) { return laneX(i) + LANE_W / 2; }

  // ── Audio engine ───────────────────────────────────────────────────
  function makeNoise(dur) {
    const n = Math.ceil(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playKick(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.001, t + 0.4);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.start(t); o.stop(t + 0.42);
  }

  function playSnare(t) {
    const src = audioCtx.createBufferSource();
    src.buffer = makeNoise(0.2);
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1000;
    const g = audioCtx.createGain();
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.start(t); src.stop(t + 0.22);
  }

  function playHihat(t, open) {
    const dur = open ? 0.28 : 0.07;
    const src = audioCtx.createBufferSource();
    src.buffer = makeNoise(dur);
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = audioCtx.createGain();
    src.connect(hp); hp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(open ? 0.22 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.01);
  }

  function playBass(freq, t, dur) {
    const o = audioCtx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 5;
    const g = audioCtx.createGain();
    o.connect(lp); lp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.5, t);
    g.gain.setValueAtTime(0.5, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  }

  function playChord(t) {
    [261, 329, 392].forEach(freq => {
      const o = audioCtx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq;
      const g = audioCtx.createGain();
      o.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.37);
    });
  }

  function playMelodyNote(freq, t, dur) {
    const o = audioCtx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(masterGain);
    g.connect(reverbDelay); // wet send
    g.gain.setValueAtTime(0.16, t);
    g.gain.setValueAtTime(0.16, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.6); // extra time for reverb tail
  }

  // Schedule one 16th-note slice of drums + bass
  function scheduleSixteenth(idx, t) {
    const beat = idx % 16; // 0-15 within bar

    if (beat === 0 || beat === 8)  playKick(t);
    if (beat === 4 || beat === 12) playSnare(t);
    playHihat(t, beat % 3 === 0); // open on 0,3,6,9,12,15

    if (beat % 4 === 0) {
      const bassIdx = Math.floor(idx / 4) % 8;
      playBass(BASS_HZ[bassIdx], t, BEAT_SEC - 0.03);
    }
    if (beat === 0) playChord(t);
  }

  function scheduleMelody() {
    while (nextMelodyTime < audioCtx.currentTime + 0.5) {
      const note = MELODY[melodyBeatIdx % MELODY.length];
      playMelodyNote(note.f, nextMelodyTime, note.d * BEAT_SEC - 0.04);
      nextMelodyTime += note.d * BEAT_SEC;
      melodyBeatIdx++;
    }
  }

  function scheduleMusic() {
    while (nextSchedTime < audioCtx.currentTime + 0.5) {
      scheduleSixteenth(sixteenthCtr, nextSchedTime);
      nextSchedTime += SIXTEENTH;
      sixteenthCtr++;
    }
    scheduleMelody();
  }

  function playHitSfx(perfect) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    const g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    if (perfect) {
      o.frequency.setValueAtTime(880, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.08);
      g.gain.setValueAtTime(0.38, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.11);
    } else {
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.28, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.09);
    }
  }

  function playMissSfx() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 80;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 200;
    const g = audioCtx.createGain();
    o.connect(lp); lp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.38, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    o.start(); o.stop(audioCtx.currentTime + 0.16);
  }

  // ── Note queue generation ─────────────────────────────────────────
  function generateNoteQueue(musicStartTime) {
    const q = [];
    for (let bar = 0; bar < 200; bar++) {
      const barT = musicStartTime + bar * 4 * BEAT_SEC;
      for (const [s, lane] of BAR_PATTERN) {
        q.push({ lane, hitTime: barT + s * SIXTEENTH, hit: false, missed: false });
      }
    }
    q.sort((a, b) => a.hitTime - b.hitTime);
    return q;
  }

  // ── Init ──────────────────────────────────────────────────────────
  function initAudioEngine() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);

    // Simple delay reverb for melody
    reverbDelay  = audioCtx.createDelay(0.5);
    reverbDelay.delayTime.value = 0.12;
    reverbFbGain = audioCtx.createGain();
    reverbFbGain.gain.value = 0.25;
    reverbDelay.connect(reverbFbGain);
    reverbFbGain.connect(reverbDelay);
    reverbFbGain.connect(masterGain);
  }

  function init() {
    // Close and recreate audio on every init (handles restarts cleanly)
    if (audioCtx) { try { audioCtx.close(); } catch(_) {} }
    initAudioEngine();

    const gameStartTime  = audioCtx.currentTime + 0.05;
    const musicStartTime = gameStartTime + FALL_DURATION;

    nextSchedTime  = musicStartTime;
    sixteenthCtr   = 0;
    nextMelodyTime = musicStartTime;
    melodyBeatIdx  = 0;

    score = 0; combo = 0; bestCombo = 0; lives = 10; gameOver = false;
    ratingFlashes = []; missFlash = 0;
    activeNotes   = [];
    noteQueue     = generateNoteQueue(musicStartTime);
    nextNoteIdx   = 0;
    keysHeld      = {};
  }

  // ── Game logic ────────────────────────────────────────────────────
  function doMiss() {
    combo     = 0;
    lives     = Math.max(0, lives - 1);
    missFlash = 8;
    playMissSfx();
    if (lives <= 0) gameOver = true;
  }

  function tryHit(laneIdx) {
    if (gameOver || !audioCtx) return;
    const now = audioCtx.currentTime;
    let bestNote = null, bestPx = Infinity;

    for (const n of activeNotes) {
      if (n.hit || n.missed || n.lane !== laneIdx) continue;
      const px = Math.abs(n.hitTime - now) * NOTE_SPEED;
      if (px <= 30 && px < bestPx) { bestPx = px; bestNote = n; }
    }

    if (bestNote) {
      bestNote.hit = true;
      let text, pts, perfect;
      if      (bestPx <= 10) { text = 'PERFECT!'; pts = 300; perfect = true;  }
      else if (bestPx <= 20) { text = 'GREAT!';   pts = 150; perfect = false; }
      else                   { text = 'GOOD';      pts = 50;  perfect = false; }
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      score += pts * Math.max(1, combo);
      playHitSfx(perfect);
      ratingFlashes.push({
        text, life: 40, maxLife: 40, lane: laneIdx,
        color: perfect ? '#ffff00' : bestPx <= 20 ? '#00ff88' : '#aaaaff',
      });
    } else {
      // Wrong key: only penalise if there's a note in the zone elsewhere
      const wrongLane = activeNotes.some(n => {
        if (n.hit || n.missed || n.lane === laneIdx) return false;
        return Math.abs(n.hitTime - now) * NOTE_SPEED <= 20;
      });
      if (wrongLane) doMiss();
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  function update() {
    if (gameOver || !audioCtx) return;
    const now = audioCtx.currentTime;

    scheduleMusic();

    // Activate notes that should now be falling
    while (nextNoteIdx < noteQueue.length &&
           noteQueue[nextNoteIdx].hitTime <= now + FALL_DURATION) {
      activeNotes.push(noteQueue[nextNoteIdx++]);
    }

    // Check misses and prune old notes
    for (let i = activeNotes.length - 1; i >= 0; i--) {
      const n = activeNotes[i];
      if (!n.hit && !n.missed) {
        const noteY = TARGET_Y - (n.hitTime - now) * NOTE_SPEED;
        if (noteY > TARGET_Y + 36) { n.missed = true; doMiss(); }
      }
      // Remove old processed notes
      if ((n.hit || n.missed) && now - n.hitTime > 0.6) activeNotes.splice(i, 1);
    }

    for (let i = ratingFlashes.length - 1; i >= 0; i--) {
      ratingFlashes[i].life--;
      if (ratingFlashes[i].life <= 0) ratingFlashes.splice(i, 1);
    }
    if (missFlash > 0) missFlash--;
  }

  // ── Draw ──────────────────────────────────────────────────────────
  function draw() {
    const now = audioCtx ? audioCtx.currentTime : 0;

    // Background
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, W, H);

    // Miss flash
    if (missFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${(missFlash / 8) * 0.32})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Lane columns
    LANES.forEach((lane, i) => {
      const x   = laneX(i);
      const held = keysHeld[lane.key];
      ctx.fillStyle = held ? lane.color + '30' : lane.color + '16';
      ctx.fillRect(x, 0, LANE_W, H);
      ctx.strokeStyle = lane.color + '40';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0);          ctx.lineTo(x, H);          ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + LANE_W, 0); ctx.lineTo(x + LANE_W, H); ctx.stroke();
    });

    // Target zones + key labels
    LANES.forEach((lane, i) => {
      const x    = laneX(i);
      const held = keysHeld[lane.key];
      ctx.shadowColor = lane.color;
      ctx.shadowBlur  = held ? 20 : 8;
      ctx.strokeStyle = lane.color;
      ctx.lineWidth   = held ? 3 : 2;
      ctx.fillStyle   = lane.color + (held ? '30' : '16');
      ctx.beginPath();
      ctx.roundRect(x + 5, TARGET_Y - NOTE_H / 2, LANE_W - 10, NOTE_H, 6);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = lane.color;
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lane.symbol, x + LANE_W / 2, TARGET_Y + NOTE_H / 2 + 18);
    });

    // Falling notes
    if (!gameOver && audioCtx) {
      activeNotes.forEach(n => {
        if (n.hit || n.missed) return;
        const noteY = TARGET_Y - (n.hitTime - now) * NOTE_SPEED;
        if (noteY < -44 || noteY > H + 10) return;
        const lane = LANES[n.lane];
        const x    = laneX(n.lane);
        ctx.shadowColor = lane.color; ctx.shadowBlur = 10;
        ctx.fillStyle = lane.color;
        ctx.beginPath();
        ctx.roundRect(x + 5, noteY - NOTE_H / 2, LANE_W - 10, NOTE_H, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(lane.symbol, x + LANE_W / 2, noteY + 6);
      });
    }

    // Rating flashes
    ratingFlashes.forEach(f => {
      const a   = f.life / f.maxLife;
      const riseY = (1 - a) * 22;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = f.color; ctx.shadowBlur = 14;
      ctx.fillStyle   = f.color;
      ctx.font = 'bold 19px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, laneCX(f.lane), TARGET_Y - 30 - riseY);
      ctx.restore();
    });

    // HUD — hearts (top-left)
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < lives ? '#ff4444' : 'rgba(255,255,255,0.14)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('♥', 10 + i * 17, 22);
    }

    // Score (top-centre)
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 5;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(score).padStart(7, '0'), W / 2, 22);
    ctx.shadowBlur = 0;

    // Combo (top-right)
    if (combo >= 2) {
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${combo}× COMBO`, W - 10, 22);
      ctx.shadowBlur = 0;
    }

    // ESC hint
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ESC = MENU', W - 10, 40);

    // Game-over overlay
    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.76)';
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#ff5555';
      ctx.font = 'bold 52px monospace';
      ctx.fillText('GAME OVER', W / 2, 130);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`Score: ${score}`, W / 2, 186);

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '16px monospace';
      ctx.fillText(`Best Combo: ${bestCombo}×`, W / 2, 216);

      ctx.shadowColor = '#22ff66'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#22ff66';
      ctx.font = '18px monospace';
      ctx.fillText('SPACE or CLICK to play again', W / 2, 268);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '14px monospace';
      ctx.fillText('ESC for menu', W / 2, 298);
    }

    ctx.textAlign = 'left';
  }

  // ── Loop ──────────────────────────────────────────────────────────
  function gameLoop() {
    update();
    draw();
    animId = requestAnimationFrame(gameLoop);
  }

  // ── Input ─────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!running) return;
    keysHeld[e.code] = true;
    if (e.code === 'Escape') { cleanup(); showMenu(); return; }
    if (e.code === 'Space' && gameOver) { init(); return; }
    const li = LANES.findIndex(l => l.key === e.code);
    if (li >= 0 && !gameOver) tryHit(li);
  }

  function onKeyUp(e) { delete keysHeld[e.code]; }

  function onClick() { if (running && gameOver) init(); }

  // ── Cleanup ───────────────────────────────────────────────────────
  function cleanup() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (audioCtx) { try { audioCtx.close(); } catch(_) {} audioCtx = null; }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    canvas.removeEventListener('click', onClick);
    keysHeld = {};
  }

  // ── Public start ──────────────────────────────────────────────────
  function start() {
    cleanup();
    running = true;
    hideTouchControls();
    init();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('click', onClick);
    gameLoop();
  }

  return { start };
})();
