const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let menuAnimFrame = null;
let menuFrame = 0;
let hoveredCard = -1;

const MENU_STARS = Array.from({ length: 160 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  r: Math.random() * 1.6 + 0.3,
  drift: Math.random() * 0.5 + 0.08,
  layer: Math.random() > 0.5 ? 1 : 2,
  twinkle: Math.random() * Math.PI * 2,
}));

const GAMES = [
  {
    title: 'GEOMETRY DASH',
    subtitle: 'Jump over obstacles',
    color: '#00eaff',
    drawIcon(cx, cy) {
      const t = menuFrame * 0.04;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t);
      ctx.shadowColor = '#00eaff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#00eaff';
      ctx.fillRect(-20, -20, 40, 40);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#003d80';
      ctx.fillRect(-14, -14, 28, 28);
      ctx.fillStyle = '#00eaff';
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    },
    game: () => GeometryDash,
  },
  {
    title: 'SPACE SHOOTER',
    subtitle: 'Levels  •  Boss  •  Power-ups',
    color: '#ff6600',
    drawIcon(cx, cy) {
      const bob = Math.sin(menuFrame * 0.06) * 5;
      ctx.save();
      ctx.translate(cx, cy + bob);
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff8833';
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(-17, 14);
      ctx.lineTo(0, 7);
      ctx.lineTo(17, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffcc66';
      ctx.beginPath();
      ctx.ellipse(0, -5, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#ffaa00';
      const flicker = 5 + Math.sin(menuFrame * 0.25) * 3;
      ctx.beginPath();
      ctx.ellipse(0, 18, 4, flicker, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(-16, 2, 8, 6);
      ctx.fillRect(8, 2, 8, 6);
      ctx.restore();
    },
    game: () => SpaceShooter,
  },
  {
    title: 'PLATFORMER',
    subtitle: 'Run, jump & stomp enemies',
    color: '#aaff00',
    drawIcon(cx, cy) {
      const run = Math.sin(menuFrame * 0.18);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowColor = '#aaff00';
      ctx.shadowBlur = 14;
      // Head
      ctx.fillStyle = '#ffe0a0';
      ctx.beginPath();
      ctx.ellipse(0, -22, 9, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.fillStyle = '#aaff00';
      ctx.fillRect(-7, -13, 14, 16);
      // Arms
      ctx.strokeStyle = '#ffe0a0';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -10);
      ctx.lineTo(-14, -4 + run * 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, -10);
      ctx.lineTo(14, -4 - run * 5);
      ctx.stroke();
      // Legs
      ctx.strokeStyle = '#226600';
      ctx.beginPath();
      ctx.moveTo(-3, 3);
      ctx.lineTo(-6, 16 + run * 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, 3);
      ctx.lineTo(6, 16 - run * 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    },
    game: () => Platformer,
  },
  {
    title: 'PANCAKE FLIP',
    subtitle: 'Cook the perfect pancake',
    color: '#ffcc44',
    drawIcon(cx, cy) {
      ctx.save();
      ctx.translate(cx, cy);
      // Pan
      ctx.fillStyle = '#1c1c1c';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Batter
      const bgrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 20);
      bgrad.addColorStop(0, '#f5d080');
      bgrad.addColorStop(1, '#c8820a');
      ctx.fillStyle = bgrad;
      ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Bubbles
      [[-7, -5], [5, 1], [-1, 8], [8, -7], [0, -1]].forEach(([bx, by], i) => {
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(menuFrame * 0.09 + i * 1.3));
        ctx.fillStyle = `rgba(255,255,255,${pulse * 0.75})`;
        ctx.beginPath(); ctx.arc(bx, by, 2.8 * (0.6 + pulse * 0.4), 0, Math.PI * 2); ctx.fill();
      });
      // Handle
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.roundRect(21, -5, 16, 10, 5); ctx.fill();
      ctx.restore();
    },
    game: () => PancakeFlip,
  },
  {
    title: 'GRAVITY CHANGER',
    subtitle: 'Flip gravity to survive',
    color: '#aa44ff',
    drawIcon(cx, cy) {
      const flip = Math.sin(menuFrame * 0.05) > 0 ? 1 : -1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowColor = '#aa44ff';
      ctx.shadowBlur = 14;
      // Spikes bottom
      ctx.fillStyle = '#ffaa00';
      [-14, 0, 14].forEach(sx => {
        ctx.beginPath();
        ctx.moveTo(sx - 7, 22);
        ctx.lineTo(sx + 7, 22);
        ctx.lineTo(sx, 8);
        ctx.closePath();
        ctx.fill();
      });
      // Spikes top
      [-14, 14].forEach(sx => {
        ctx.beginPath();
        ctx.moveTo(sx - 7, -22);
        ctx.lineTo(sx + 7, -22);
        ctx.lineTo(sx, -8);
        ctx.closePath();
        ctx.fill();
      });
      // Stick figure (flips)
      ctx.scale(1, flip);
      ctx.strokeStyle = '#aa44ff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      // Head
      ctx.beginPath();
      ctx.arc(0, -16, 5, 0, Math.PI * 2);
      ctx.stroke();
      // Body
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(0, 2);
      ctx.stroke();
      // Arms
      ctx.beginPath();
      ctx.moveTo(-7, -6);
      ctx.lineTo(7, -6);
      ctx.stroke();
      // Legs
      const legSwing = Math.sin(menuFrame * 0.18) * 6;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(-5, 12 + legSwing);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(5, 12 - legSwing);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    },
    game: () => GravityChanger,
  },
];

function getCardBounds(i) {
  const cardW = 148;
  const cardH = 205;
  const gap = 10;
  const totalW = GAMES.length * cardW + (GAMES.length - 1) * gap;
  const startX = (canvas.width - totalW) / 2;
  return { x: startX + i * (cardW + gap), y: 148, w: cardW, h: cardH };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMenuFrame() {
  menuFrame++;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#030010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Parallax stars
  MENU_STARS.forEach((s) => {
    s.x -= s.drift * s.layer * 0.5;
    if (s.x < 0) { s.x = canvas.width; s.y = Math.random() * canvas.height; }
    const tw = 0.4 + 0.6 * Math.sin(menuFrame * 0.04 + s.twinkle);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${tw * 0.85})`;
    ctx.fill();
  });

  // Title
  ctx.textAlign = 'center';
  const titleGlow = 20 + Math.sin(menuFrame * 0.06) * 8;
  ctx.shadowColor = '#00eaff';
  ctx.shadowBlur = titleGlow;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px monospace';
  ctx.fillText('ARCADE', canvas.width / 2, 82);
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '14px monospace';
  ctx.fillText('SELECT A GAME  —  ESC to return here anytime', canvas.width / 2, 112);

  // Cards
  GAMES.forEach((game, i) => {
    const { x, y, w, h } = getCardBounds(i);
    const hovered = hoveredCard === i;
    const lift = hovered ? -10 : 0;
    const cy = y + lift;

    ctx.shadowColor = game.color;
    ctx.shadowBlur = hovered ? 32 : 12;
    ctx.strokeStyle = game.color;
    ctx.lineWidth = hovered ? 2.5 : 1.5;
    ctx.fillStyle = hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    roundRect(x, cy, w, h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    game.drawIcon(x + w / 2, cy + 76);

    ctx.shadowColor = game.color;
    ctx.shadowBlur = hovered ? 12 : 6;
    ctx.fillStyle = game.color;
    ctx.font = 'bold 19px monospace';
    ctx.fillText(game.title, x + w / 2, cy + 148);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    ctx.font = '13px monospace';
    ctx.fillText(game.subtitle, x + w / 2, cy + 170);

    if (hovered) {
      ctx.fillStyle = game.color;
      ctx.shadowColor = game.color;
      ctx.shadowBlur = 10;
      ctx.font = 'bold 14px monospace';
      ctx.fillText('▶  PLAY', x + w / 2, cy + 205);
      ctx.shadowBlur = 0;
    }
  });

  ctx.textAlign = 'left';
  menuAnimFrame = requestAnimationFrame(drawMenuFrame);
}

canvas.addEventListener('mousemove', (e) => {
  if (!menuAnimFrame) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  hoveredCard = -1;
  GAMES.forEach((_, i) => {
    const { x, y, w, h } = getCardBounds(i);
    if (mx >= x && mx <= x + w && my >= y - 10 && my <= y + h) hoveredCard = i;
  });
  canvas.style.cursor = hoveredCard >= 0 ? 'pointer' : 'default';
});

canvas.addEventListener('click', (e) => {
  if (!menuAnimFrame) return;
  if (hoveredCard < 0) return;
  const game = GAMES[hoveredCard];
  cancelAnimationFrame(menuAnimFrame);
  menuAnimFrame = null;
  canvas.style.cursor = 'default';
  hoveredCard = -1;
  game.game().start();
});

function showMenu() {
  if (menuAnimFrame) cancelAnimationFrame(menuAnimFrame);
  menuAnimFrame = null;
  menuFrame = 0;
  hideTouchControls();
  drawMenuFrame();
}

// ── Responsive canvas sizing ──
function resizeCanvas() {
  const tc = document.getElementById('touch-controls');
  const tcH = tc && tc.style.display !== 'none' ? (tc.offsetHeight || 100) : 0;
  const avW = window.innerWidth;
  const avH = window.innerHeight - tcH;
  const aspect = 2; // 800/400

  let w = avW, h = avW / aspect;
  if (h > avH) { h = avH; w = h * aspect; }

  canvas.style.width  = Math.floor(w) + 'px';
  canvas.style.height = Math.floor(h) + 'px';
}

window.addEventListener('resize', resizeCanvas);

// ── Touch device detection ──
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ── Touch controls visibility ──
function showTouchControls(mode) {
  const tc    = document.getElementById('touch-controls');
  const left  = document.getElementById('tc-left');
  const right = document.getElementById('tc-right');
  const jump  = document.getElementById('tc-jump');
  const show  = isTouchDevice && mode !== 'none';
  tc.style.display    = show ? 'flex' : 'none';
  left.style.display  = show ? 'flex' : 'none';
  right.style.display = show ? 'flex' : 'none';
  jump.style.display  = (show && mode === 'platformer') ? 'flex' : 'none';
  setTimeout(resizeCanvas, 10);
}

function hideTouchControls() {
  document.getElementById('touch-controls').style.display = 'none';
  resizeCanvas();
}

// ── Synthetic key events from touch buttons ──
function fakeKey(code, down) {
  document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
}

// ── Init everything on load ──
window.addEventListener('load', () => {
  // Wire touch buttons
  [['tc-left', 'ArrowLeft'], ['tc-right', 'ArrowRight'], ['tc-jump', 'Space']].forEach(([id, code]) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart',  (e) => { e.preventDefault(); fakeKey(code, true);  }, { passive: false });
    el.addEventListener('touchend',    (e) => { e.preventDefault(); fakeKey(code, false); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); fakeKey(code, false); }, { passive: false });
  });

  // Menu card tap (faster than click on mobile)
  canvas.addEventListener('touchstart', (e) => {
    if (!menuAnimFrame) return;
    e.preventDefault();
    const t = e.touches[0];
    const r = canvas.getBoundingClientRect();
    const mx = (t.clientX - r.left) * (canvas.width  / r.width);
    const my = (t.clientY - r.top)  * (canvas.height / r.height);
    GAMES.forEach((game, i) => {
      const { x, y, w, h } = getCardBounds(i);
      if (mx >= x && mx <= x + w && my >= y - 10 && my <= y + h) {
        cancelAnimationFrame(menuAnimFrame);
        menuAnimFrame = null;
        hoveredCard = -1;
        game.game().start();
      }
    });
  }, { passive: false });

  // Prevent body scroll during touch on canvas
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  resizeCanvas();
  showMenu();
});
