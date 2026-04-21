// Rhythm Tap — 4-lane falling-note game with 5 levels and distinct soundtracks
const RhythmTap = (() => {
  const W = 800, H = 400;
  const LANE_W = 90, LANE_GAP = 10;
  const LANE_START_X = (W - (4 * LANE_W + 3 * LANE_GAP)) / 2; // 205
  const TARGET_Y = 330;
  const NOTE_H   = 28;

  const LANES = [
    { key: 'ArrowLeft',  symbol: '←', color: '#3388ff' },
    { key: 'ArrowDown',  symbol: '↓', color: '#ff3355' },
    { key: 'ArrowUp',    symbol: '↑', color: '#33ff66' },
    { key: 'ArrowRight', symbol: '→', color: '#ffaa22' },
  ];

  // ── Level definitions ─────────────────────────────────────────────
  // pattern: [sixteenth-offset-in-bar, lane]
  const LEVELS = [
    {
      name: 'CHILL ZONE',   desc: 'A gentle warm-up',
      bpm: 90,  color: '#00ccff', stars: 1, fallDuration: 1.5,
      pattern: [[0,0],[4,1],[8,2],[12,3]],
      bassHz: [65,55,65,55,65,49,55,65],
      melody: [
        {f:261,d:2},{f:294,d:1},{f:330,d:1},{f:392,d:2},{f:330,d:1},{f:294,d:1},
        {f:261,d:2},{f:392,d:2},{f:294,d:2},{f:261,d:2},
      ],
    },
    {
      name: 'GROOVE',       desc: 'Funky rhythms',
      bpm: 118, color: '#44ff88', stars: 2, fallDuration: 1.3,
      pattern: [[0,0],[2,2],[4,1],[8,3],[10,0],[12,2]],
      bassHz: [55,55,65,55,49,55,65,73],
      melody: [
        {f:220,d:1},{f:261,d:1},{f:294,d:.5},{f:261,d:.5},{f:220,d:1},{f:196,d:2},{f:220,d:2},
        {f:220,d:1},{f:261,d:1},{f:311,d:1},{f:294,d:1},{f:261,d:1},{f:220,d:1},{f:196,d:2},
      ],
    },
    {
      name: 'NEON RUSH',    desc: 'The original track',
      bpm: 130, color: '#ff44cc', stars: 3, fallDuration: 1.2,
      pattern: [[0,0],[2,2],[4,1],[6,3],[8,0],[10,3],[12,1],[14,2]],
      bassHz: [65,65,73,65,55,65,73,82],
      melody: [
        {f:523,d:1},{f:587,d:1},{f:659,d:1},{f:784,d:1},
        {f:880,d:1},{f:784,d:1},{f:659,d:1},{f:587,d:1},
        {f:523,d:1},{f:440,d:1},{f:494,d:1},{f:523,d:1},{f:659,d:1},
        {f:784,d:.5},{f:880,d:.5},{f:1047,d:1},
      ],
    },
    {
      name: 'TECHNO DROP',  desc: '4-on-the-floor intensity',
      bpm: 150, color: '#ff8800', stars: 4, fallDuration: 1.1,
      pattern: [[0,0],[0,2],[2,1],[4,3],[4,0],[6,2],[8,1],[8,3],[10,0],[12,2],[14,3]],
      bassHz: [82,82,98,82,65,82,98,110],
      melody: [
        {f:329,d:.5},{f:440,d:.5},{f:523,d:.5},{f:440,d:.5},
        {f:329,d:1},{f:440,d:1},{f:329,d:1},{f:261,d:1},{f:329,d:2},
        {f:392,d:.5},{f:523,d:.5},{f:659,d:.5},{f:523,d:.5},
        {f:392,d:1},{f:523,d:1},{f:392,d:1},{f:329,d:1},{f:392,d:2},
      ],
    },
    {
      name: 'CHAOS',        desc: 'For the fearless',
      bpm: 175, color: '#ff2244', stars: 5, fallDuration: 1.0,
      pattern: [[0,0],[0,1],[2,2],[4,3],[4,0],[6,1],[8,2],[8,3],[10,0],[10,2],[12,1],[12,3],[14,0],[14,2]],
      bassHz: [55,82,55,98,55,73,55,82],
      melody: [
        {f:659,d:.25},{f:698,d:.25},{f:784,d:.25},{f:880,d:.25},
        {f:784,d:.25},{f:698,d:.25},{f:659,d:.25},{f:587,d:.25},
        {f:659,d:.5},{f:784,d:.5},{f:880,d:1},{f:784,d:1},{f:659,d:1},{f:523,d:1},{f:659,d:1},
        {f:523,d:.25},{f:587,d:.25},{f:659,d:.25},{f:784,d:.25},
        {f:880,d:.25},{f:784,d:.25},{f:659,d:.25},{f:587,d:.25},
        {f:523,d:.5},{f:659,d:.5},{f:784,d:1},{f:880,d:1},{f:1047,d:1},{f:880,d:1},{f:784,d:1},
      ],
    },
  ];

  // ── Module state ──────────────────────────────────────────────────
  let gameState;      // 'select' | 'playing' | 'gameover'
  let currentLevel, hoveredLevel;
  let beatSec, noteSpeed;

  let audioCtx, masterGain, reverbDelay, reverbFbGain;
  let nextSchedTime, sixteenthCtr, nextMelodyTime, melodyBeatIdx;

  let score, combo, bestCombo, lives;
  let activeNotes, noteQueue, nextNoteIdx;
  let ratingFlashes, missFlash;
  let keysHeld, laneClickHeld, animId, running;
  let gpXWasPressed = false;

  // ── Helpers ───────────────────────────────────────────────────────
  function laneX(i)  { return LANE_START_X + i * (LANE_W + LANE_GAP); }
  function laneCX(i) { return laneX(i) + LANE_W / 2; }

  function laneFromX(cx) {
    for (let i = 0; i < 4; i++)
      if (cx >= laneX(i) && cx <= laneX(i) + LANE_W) return i;
    return -1;
  }

  // ── Audio helpers ─────────────────────────────────────────────────
  function makeNoise(dur) {
    const n = Math.ceil(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playKick(t, vol = 0.9) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.001, t + 0.4);
    g.gain.setValueAtTime(vol, t);
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

  function playClap(t) {
    const src = audioCtx.createBufferSource();
    src.buffer = makeNoise(0.14);
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const g = audioCtx.createGain();
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.start(t); src.stop(t + 0.15);
  }

  function playRimshot(t) {
    const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.value = 350;
    const g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.start(t); o.stop(t + 0.08);
  }

  function playHihat(t, open = false, vol = 0.13) {
    const dur = open ? 0.28 : 0.07;
    const src = audioCtx.createBufferSource();
    src.buffer = makeNoise(dur);
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = audioCtx.createGain();
    src.connect(hp); hp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(open ? vol * 1.7 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.01);
  }

  // Soft sine pad for level 1
  function playSoftPad(t) {
    [261, 330, 392].forEach(freq => {
      const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = audioCtx.createGain();
      o.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.3);
      g.gain.setValueAtTime(0.07, t + 1.6);
      g.gain.linearRampToValueAtTime(0, t + 2.2);
      o.start(t); o.stop(t + 2.3);
    });
  }

  // Triangle bass for level 1 (smooth)
  function playTriBass(freq, t, dur) {
    const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.42, t + 0.09);
    g.gain.setValueAtTime(0.42, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  }

  // Am minor chord stabs (triangle) for level 2
  function playMinorChord(t) {
    [220, 261, 330].forEach(freq => {
      const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
      const g = audioCtx.createGain();
      o.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      o.start(t); o.stop(t + 0.47);
    });
  }

  // Wah-filtered sawtooth bass for level 2
  function playWahBass(freq, t, dur) {
    const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 9;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.linearRampToValueAtTime(950, t + dur * 0.3);
    lp.frequency.linearRampToValueAtTime(260, t + dur);
    const g = audioCtx.createGain();
    o.connect(lp); lp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.44, t);
    g.gain.setValueAtTime(0.44, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  }

  // C-major sine chord for level 3
  function plasMajorChord(t) {
    [261, 329, 392].forEach(freq => {
      const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = audioCtx.createGain();
      o.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.37);
    });
  }

  // Sawtooth bass for levels 3/4
  function playSawBass(freq, t, dur, vol = 0.5, cutoff = 400) {
    const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 5;
    const g = audioCtx.createGain();
    o.connect(lp); lp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  }

  // Rave power chord for levels 4/5
  function playRaveChord(t) {
    [82, 123, 165, 246].forEach(freq => {
      const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const g = audioCtx.createGain();
      o.connect(g); g.connect(masterGain);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    });
  }

  // Generic melody note dispatcher
  function playMelNote(freq, t, dur) {
    const lv = LEVELS[currentLevel];
    let type = 'square', vol = 0.15, useRev = false, staccato = false;
    if (lv.stars === 1) { type = 'sine';     vol = 0.14; }
    if (lv.stars === 2) { type = 'triangle'; vol = 0.14; }
    if (lv.stars === 3) { type = 'square';   vol = 0.16; useRev = true; }
    if (lv.stars === 4) { type = 'square';   vol = 0.13; staccato = true; }
    if (lv.stars === 5) { type = 'sawtooth'; vol = 0.10; staccato = true; }

    const actualDur = staccato ? Math.min(dur, beatSec * 0.38) : dur;
    const o = audioCtx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(masterGain);
    if (useRev && reverbDelay) g.connect(reverbDelay);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, actualDur - 0.04));
    g.gain.linearRampToValueAtTime(0, t + actualDur);
    o.start(t); o.stop(t + actualDur + (useRev ? 0.6 : 0.02));
  }

  // ── Per-level 16th-note scheduler ────────────────────────────────
  function scheduleSixteenth(idx, t) {
    const lv   = LEVELS[currentLevel];
    const beat = idx % 16;

    switch (currentLevel) {
      case 0: // CHILL ZONE — soft kick, rimshot, sparse hats, triangle bass, pad
        if (beat === 0)  playKick(t, 0.55);
        if (beat === 8)  playRimshot(t);
        if (beat % 4 === 0) playHihat(t, false, 0.05);
        if (beat % 4 === 0) playTriBass(lv.bassHz[Math.floor(idx/4) % 8], t, beatSec - 0.06);
        if (beat === 0 && Math.floor(idx/16) % 2 === 0) playSoftPad(t);
        break;

      case 1: // GROOVE — kick+clap, 8th hats, wah bass, minor chords
        if (beat === 0 || beat === 8)  playKick(t);
        if (beat === 4 || beat === 12) playClap(t);
        if (beat % 2 === 0) playHihat(t, beat % 8 === 0, 0.10);
        if (beat % 4 === 0) playWahBass(lv.bassHz[Math.floor(idx/4) % 8], t, beatSec - 0.04);
        if (beat % 8 === 0) playMinorChord(t);
        break;

      case 2: // NEON RUSH — original track
        if (beat === 0 || beat === 8)  playKick(t);
        if (beat === 4 || beat === 12) playSnare(t);
        playHihat(t, beat % 3 === 0);
        if (beat % 4 === 0) playSawBass(lv.bassHz[Math.floor(idx/4) % 8], t, beatSec - 0.03);
        if (beat === 0) plasMajorChord(t);
        break;

      case 3: // TECHNO DROP — four-on-the-floor kick, heavy bass, rave chords
        if (beat % 4 === 0) playKick(t);
        if (beat === 4 || beat === 12) playSnare(t);
        playHihat(t, beat % 8 === 0, 0.18);
        if (beat % 4 === 0) playSawBass(lv.bassHz[Math.floor(idx/4) % 8], t, beatSec * 0.85, 0.58, 500);
        if (beat === 0 || beat === 8) playRaveChord(t);
        break;

      case 4: // CHAOS — complex kick, fast hats, bass every 8th, rapid rave
        if (beat===0||beat===4||beat===6||beat===8||beat===12) playKick(t, 0.95);
        if (beat === 4 || beat === 12) playSnare(t);
        playHihat(t, beat % 6 === 0, 0.22);
        if (beat % 2 === 0) playSawBass(lv.bassHz[Math.floor(idx/2) % 8], t, beatSec * 0.48, 0.62, 600);
        if (beat % 4 === 0) playRaveChord(t);
        break;
    }
  }

  function scheduleMelody() {
    while (nextMelodyTime < audioCtx.currentTime + 0.5) {
      const note = LEVELS[currentLevel].melody[melodyBeatIdx % LEVELS[currentLevel].melody.length];
      playMelNote(note.f, nextMelodyTime, note.d * beatSec - 0.04);
      nextMelodyTime += note.d * beatSec;
      melodyBeatIdx++;
    }
  }

  function scheduleMusic() {
    const sixteenth = beatSec / 4;
    while (nextSchedTime < audioCtx.currentTime + 0.5) {
      scheduleSixteenth(sixteenthCtr, nextSchedTime);
      nextSchedTime += sixteenth;
      sixteenthCtr++;
    }
    scheduleMelody();
  }

  // ── SFX ──────────────────────────────────────────────────────────
  function playHitSfx(perfect) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(); o.type = 'sine';
    const g = audioCtx.createGain();
    o.connect(g); g.connect(masterGain);
    if (perfect) {
      o.frequency.setValueAtTime(880, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.08);
      g.gain.setValueAtTime(0.36, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      o.start(); o.stop(audioCtx.currentTime + 0.11);
    } else {
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.26, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.start(); o.stop(audioCtx.currentTime + 0.09);
    }
  }

  function playMissSfx() {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 80;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
    const g = audioCtx.createGain();
    o.connect(lp); lp.connect(g); g.connect(masterGain);
    g.gain.setValueAtTime(0.38, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    o.start(); o.stop(audioCtx.currentTime + 0.16);
  }

  // ── Note queue ────────────────────────────────────────────────────
  function generateNoteQueue(musicStartTime) {
    const lv  = LEVELS[currentLevel];
    const s16 = beatSec / 4;
    const q   = [];
    for (let bar = 0; bar < 200; bar++) {
      const barT = musicStartTime + bar * 4 * beatSec;
      for (const [s, lane] of lv.pattern)
        q.push({ lane, hitTime: barT + s * s16, hit: false, missed: false });
    }
    q.sort((a, b) => a.hitTime - b.hitTime);
    return q;
  }

  // ── Audio engine init ─────────────────────────────────────────────
  function initAudio() {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
    reverbDelay = audioCtx.createDelay(0.5); reverbDelay.delayTime.value = 0.12;
    reverbFbGain = audioCtx.createGain(); reverbFbGain.gain.value = 0.25;
    reverbDelay.connect(reverbFbGain);
    reverbFbGain.connect(reverbDelay);
    reverbFbGain.connect(masterGain);
  }

  // ── Start a level ─────────────────────────────────────────────────
  function startLevel(idx) {
    if (audioCtx) { try { audioCtx.close(); } catch(_){} audioCtx = null; }
    currentLevel = idx;
    const lv  = LEVELS[idx];
    beatSec   = 60 / lv.bpm;
    noteSpeed = (TARGET_Y + 40) / lv.fallDuration;

    initAudio();
    const musicStart = audioCtx.currentTime + 0.05 + lv.fallDuration;
    nextSchedTime  = musicStart;
    sixteenthCtr   = 0;
    nextMelodyTime = musicStart;
    melodyBeatIdx  = 0;

    score = 0; combo = 0; bestCombo = 0; lives = 10;
    ratingFlashes = []; missFlash = 0;
    activeNotes = [];
    noteQueue   = generateNoteQueue(musicStart);
    nextNoteIdx = 0;
    keysHeld    = {};
    laneClickHeld = [false, false, false, false];
    gameState   = 'playing';
  }

  // ── Game logic ────────────────────────────────────────────────────
  function doMiss() {
    combo = 0; lives = Math.max(0, lives - 1); missFlash = 8;
    playMissSfx();
    if (lives <= 0) { gameState = 'gameover'; }
  }

  function tryHit(laneIdx) {
    if (gameState !== 'playing' || !audioCtx) return;
    const now = audioCtx.currentTime;
    let bestNote = null, bestPx = Infinity;
    for (const n of activeNotes) {
      if (n.hit || n.missed || n.lane !== laneIdx) continue;
      const px = Math.abs(n.hitTime - now) * noteSpeed;
      if (px <= 30 && px < bestPx) { bestPx = px; bestNote = n; }
    }
    if (bestNote) {
      bestNote.hit = true;
      let text, pts, perfect;
      if      (bestPx <= 10) { text = 'PERFECT!'; pts = 300; perfect = true; }
      else if (bestPx <= 20) { text = 'GREAT!';   pts = 150; perfect = false; }
      else                   { text = 'GOOD';      pts = 50;  perfect = false; }
      combo++; bestCombo = Math.max(bestCombo, combo);
      score += pts * Math.max(1, combo);
      playHitSfx(perfect);
      ratingFlashes.push({
        text, life: 40, maxLife: 40, lane: laneIdx,
        color: perfect ? '#ffff00' : bestPx <= 20 ? '#00ff88' : '#aaaaff',
      });
    } else {
      const wrongLane = activeNotes.some(n => {
        if (n.hit || n.missed || n.lane === laneIdx) return false;
        return Math.abs(n.hitTime - now) * noteSpeed <= 20;
      });
      if (wrongLane) doMiss();
    }
  }

  // ── Update ────────────────────────────────────────────────────────
  function update() {
    if (gameState !== 'playing' || !audioCtx) return;
    const now = audioCtx.currentTime;
    const lv  = LEVELS[currentLevel];

    scheduleMusic();

    while (nextNoteIdx < noteQueue.length &&
           noteQueue[nextNoteIdx].hitTime <= now + lv.fallDuration)
      activeNotes.push(noteQueue[nextNoteIdx++]);

    for (let i = activeNotes.length - 1; i >= 0; i--) {
      const n = activeNotes[i];
      if (!n.hit && !n.missed) {
        if (TARGET_Y - (n.hitTime - now) * noteSpeed > TARGET_Y + 36) {
          n.missed = true; doMiss();
        }
      }
      if ((n.hit || n.missed) && now - n.hitTime > 0.6) activeNotes.splice(i, 1);
    }
    for (let i = ratingFlashes.length - 1; i >= 0; i--)
      if (--ratingFlashes[i].life <= 0) ratingFlashes.splice(i, 1);
    if (missFlash > 0) missFlash--;
  }

  // ── Draw: level select ────────────────────────────────────────────
  function drawSelect() {
    ctx.fillStyle = '#0d0d14'; ctx.fillRect(0, 0, W, H);

    // Scrolling grid
    const gOff = (Date.now() / 50) % 50;
    ctx.strokeStyle = 'rgba(255,68,204,0.06)'; ctx.lineWidth = 1;
    for (let x = gOff - 50; x < W + 50; x += 50) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }

    // Title
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff44cc'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#ff44cc'; ctx.font = 'bold 34px monospace';
    ctx.fillText('RHYTHM TAP', W / 2, 48);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '14px monospace';
    ctx.fillText('SELECT A LEVEL', W / 2, 72);

    // Level cards: 5 × 130px with 10px gap = 700px total, startX=50
    const CW = 130, CH = 188, GAP = 10;
    const totalW = 5 * CW + 4 * GAP;
    const sx = (W - totalW) / 2;

    LEVELS.forEach((lv, i) => {
      const x = sx + i * (CW + GAP);
      const hov = hoveredLevel === i;
      const cy  = 90 + (hov ? -8 : 0);

      ctx.shadowColor = lv.color; ctx.shadowBlur = hov ? 28 : 10;
      ctx.strokeStyle = lv.color; ctx.lineWidth = hov ? 2.5 : 1.5;
      ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.roundRect(x, cy, CW, CH, 12); ctx.fill(); ctx.stroke();
      ctx.shadowBlur  = 0;

      // Colour top bar
      ctx.fillStyle = lv.color + (hov ? 'cc' : '88');
      ctx.beginPath(); ctx.roundRect(x, cy, CW, 8, [12,12,0,0]); ctx.fill();

      // Number
      ctx.shadowColor = lv.color; ctx.shadowBlur = 10;
      ctx.fillStyle = lv.color; ctx.font = 'bold 30px monospace';
      ctx.fillText(i + 1, x + CW / 2, cy + 52); ctx.shadowBlur = 0;

      // Name
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace';
      ctx.fillText(lv.name, x + CW / 2, cy + 76);

      // Stars
      ctx.fillStyle = '#ffdd00'; ctx.font = '13px monospace';
      ctx.fillText('★'.repeat(lv.stars) + '☆'.repeat(5 - lv.stars), x + CW / 2, cy + 97);

      // BPM
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px monospace';
      ctx.fillText(`${lv.bpm} BPM`, x + CW / 2, cy + 116);

      // Desc
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = '10px monospace';
      ctx.fillText(lv.desc, x + CW / 2, cy + 134);

      if (hov) {
        ctx.shadowColor = lv.color; ctx.shadowBlur = 10;
        ctx.fillStyle = lv.color; ctx.font = 'bold 12px monospace';
        ctx.fillText('▶  PLAY', x + CW / 2, cy + CH - 12); ctx.shadowBlur = 0;
      }
    });

    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = '11px monospace';
    ctx.fillText('Click a level  •  Press 1–5 to quick-select  •  ESC = main menu', W / 2, H - 12);
    ctx.textAlign = 'left';
  }

  // ── Draw: gameplay ────────────────────────────────────────────────
  function drawGame() {
    const now = audioCtx ? audioCtx.currentTime : 0;
    const lv  = LEVELS[currentLevel];

    ctx.fillStyle = '#0d0d14'; ctx.fillRect(0, 0, W, H);
    if (missFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${(missFlash/8)*0.32})`; ctx.fillRect(0,0,W,H);
    }

    // Lane columns
    LANES.forEach((lane, i) => {
      const x = laneX(i), held = keysHeld[lane.key] || laneClickHeld[i];
      ctx.fillStyle = held ? lane.color + '30' : lane.color + '16';
      ctx.fillRect(x, 0, LANE_W, H);
      ctx.strokeStyle = lane.color + '40'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x,0);        ctx.lineTo(x,H);        ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+LANE_W,0); ctx.lineTo(x+LANE_W,H); ctx.stroke();
    });

    // Target zones
    LANES.forEach((lane, i) => {
      const x = laneX(i), held = keysHeld[lane.key] || laneClickHeld[i];
      ctx.shadowColor = lane.color; ctx.shadowBlur = held ? 20 : 8;
      ctx.strokeStyle = lane.color; ctx.lineWidth = held ? 3 : 2;
      ctx.fillStyle   = lane.color + (held ? '30' : '16');
      ctx.beginPath(); ctx.roundRect(x+5, TARGET_Y-NOTE_H/2, LANE_W-10, NOTE_H, 6);
      ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = lane.color; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(lane.symbol, x+LANE_W/2, TARGET_Y+NOTE_H/2+18);
    });

    // Notes
    activeNotes.forEach(n => {
      if (n.hit || n.missed) return;
      const ny = TARGET_Y - (n.hitTime - now) * noteSpeed;
      if (ny < -44 || ny > H + 10) return;
      const lane = LANES[n.lane], x = laneX(n.lane);
      ctx.shadowColor = lane.color; ctx.shadowBlur = 10;
      ctx.fillStyle = lane.color;
      ctx.beginPath(); ctx.roundRect(x+5, ny-NOTE_H/2, LANE_W-10, NOTE_H, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(lane.symbol, x+LANE_W/2, ny+6);
    });

    // Rating flashes
    ratingFlashes.forEach(f => {
      const a = f.life / f.maxLife;
      ctx.save(); ctx.globalAlpha = a;
      ctx.shadowColor = f.color; ctx.shadowBlur = 14; ctx.fillStyle = f.color;
      ctx.font = 'bold 19px monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.text, laneCX(f.lane), TARGET_Y - 30 - (1-a)*22);
      ctx.restore();
    });

    // HUD — hearts
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < lives ? '#ff4444' : 'rgba(255,255,255,0.14)';
      ctx.font = '14px monospace'; ctx.textAlign = 'left';
      ctx.fillText('♥', 10 + i * 17, 22);
    }

    // Level tag
    ctx.fillStyle = lv.color; ctx.shadowColor = lv.color; ctx.shadowBlur = 6;
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`LV${currentLevel+1} ${lv.name}  ${lv.bpm}BPM`, 10, 40);
    ctx.shadowBlur = 0;

    // Score
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 5; ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(score).padStart(7,'0'), W/2, 22); ctx.shadowBlur = 0;

    // Combo
    if (combo >= 2) {
      ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 15px monospace'; ctx.textAlign = 'right';
      ctx.fillText(`${combo}× COMBO`, W-10, 22); ctx.shadowBlur = 0;
    }

    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '11px monospace'; ctx.textAlign = 'right';
    ctx.fillText('ESC = level select', W-10, 40);

    // Game over overlay
    if (gameState === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.76)'; ctx.fillRect(0,0,W,H);
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 28;
      ctx.fillStyle = '#ff5555'; ctx.font = 'bold 52px monospace';
      ctx.fillText('GAME OVER', W/2, 130); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px monospace';
      ctx.fillText(`Score: ${score}`, W/2, 186);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '16px monospace';
      ctx.fillText(`Best Combo: ${bestCombo}×`, W/2, 216);
      ctx.shadowColor = lv.color; ctx.shadowBlur = 10; ctx.fillStyle = lv.color;
      ctx.font = '16px monospace';
      ctx.fillText('SPACE — try again   ESC — level select', W/2, 270); ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'left';
  }

  // ── Main loop ─────────────────────────────────────────────────────
  function gameLoop() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let xNow = false;
    for (const gp of pads) { if (!gp) continue; if (gp.buttons[0]?.pressed) xNow = true; break; }
    if (xNow && !gpXWasPressed && gameState === 'gameover') {
      gpXWasPressed = false;
      if (audioCtx) { try { audioCtx.close(); } catch(_){} audioCtx = null; }
      activeNotes = []; ratingFlashes = []; keysHeld = {};
      hoveredLevel = -1; gameState = 'select'; canvas.style.cursor = 'default';
    } else {
      gpXWasPressed = xNow;
    }
    update();
    if (gameState === 'select') drawSelect();
    else drawGame();
    animId = requestAnimationFrame(gameLoop);
  }

  // ── Level-select card bounds (for hover/click) ────────────────────
  function cardBounds(i) {
    const CW=130, GAP=10, totalW=5*CW+4*GAP;
    const sx = (W - totalW) / 2;
    return { x: sx + i*(CW+GAP), y: 90, w: CW, h: 188 };
  }

  // ── Input ─────────────────────────────────────────────────────────
  function onMouseMove(e) {
    if (!running) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const my = (e.clientY - r.top)  * (H / r.height);
    if (gameState === 'select') {
      hoveredLevel = -1;
      LEVELS.forEach((_, i) => {
        const b = cardBounds(i);
        if (mx >= b.x && mx <= b.x+b.w && my >= b.y-10 && my <= b.y+b.h) hoveredLevel = i;
      });
      canvas.style.cursor = hoveredLevel >= 0 ? 'pointer' : 'default';
    }
  }

  function handlePointerDown(mx, my, isTouch) {
    if (!running) return;
    if (gameState === 'gameover') { startLevel(currentLevel); return; }
    if (gameState === 'select') {
      LEVELS.forEach((_, i) => {
        const b = cardBounds(i);
        if (mx >= b.x && mx <= b.x+b.w && my >= b.y-10 && my <= b.y+b.h) startLevel(i);
      });
      return;
    }
    if (gameState === 'playing') {
      const i = laneFromX(mx);
      if (i >= 0) { laneClickHeld[i] = true; tryHit(i); }
    }
  }

  function onCanvasMouseDown(e) {
    if (!running) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const my = (e.clientY - r.top)  * (H / r.height);
    handlePointerDown(mx, my, false);
  }

  function onCanvasMouseUp() {
    if (!running) return;
    laneClickHeld = [false, false, false, false];
  }

  function onTouchStart(e) {
    if (!running) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const mx = (t.clientX - r.left) * (W / r.width);
      const my = (t.clientY - r.top)  * (H / r.height);
      handlePointerDown(mx, my, true);
    }
  }

  function onTouchEnd(e) {
    if (!running) return;
    e.preventDefault();
    laneClickHeld = [false, false, false, false];
  }

  function onKeyDown(e) {
    if (!running) return;
    if (e.code === 'Escape') {
      if (gameState === 'playing' || gameState === 'gameover') {
        if (audioCtx) { try { audioCtx.close(); } catch(_){} audioCtx = null; }
        activeNotes = []; ratingFlashes = []; keysHeld = {};
        hoveredLevel = -1; gameState = 'select';
        canvas.style.cursor = 'default';
      } else {
        cleanup(); showMenu();
      }
      return;
    }
    if (gameState === 'select') {
      const n = parseInt(e.key);
      if (n >= 1 && n <= 5) startLevel(n - 1);
      return;
    }
    if (gameState === 'gameover' && e.code === 'Space') { startLevel(currentLevel); return; }
    if (gameState === 'playing') {
      keysHeld[e.code] = true;
      const li = LANES.findIndex(l => l.key === e.code);
      if (li >= 0) tryHit(li);
    }
  }

  function onKeyUp(e) { delete keysHeld[e.code]; }

  // ── Cleanup ───────────────────────────────────────────────────────
  function cleanup() {
    running = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (audioCtx) { try { audioCtx.close(); } catch(_){} audioCtx = null; }
    document.removeEventListener('keydown',   onKeyDown);
    document.removeEventListener('keyup',     onKeyUp);
    canvas.removeEventListener('mousemove',   onMouseMove);
    canvas.removeEventListener('mousedown',   onCanvasMouseDown);
    canvas.removeEventListener('mouseup',     onCanvasMouseUp);
    canvas.removeEventListener('touchstart',  onTouchStart);
    canvas.removeEventListener('touchend',    onTouchEnd);
    canvas.style.cursor = 'default';
    keysHeld = {};
    laneClickHeld = [false, false, false, false];
  }

  // ── Public start ──────────────────────────────────────────────────
  function start() {
    cleanup();
    running       = true;
    gameState     = 'select';
    hoveredLevel  = -1;
    keysHeld      = {};
    laneClickHeld = [false, false, false, false];
    activeNotes   = [];
    ratingFlashes = [];
    hideTouchControls();
    document.addEventListener('keydown',  onKeyDown);
    document.addEventListener('keyup',    onKeyUp);
    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('mousedown',  onCanvasMouseDown);
    canvas.addEventListener('mouseup',    onCanvasMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    gameLoop();
  }

  return { start };
})();
