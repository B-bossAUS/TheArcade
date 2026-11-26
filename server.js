// The Arcade — online server. Serves index.html and relays messages between players in rooms.
// The room HOST's browser runs the game; this server only manages rooms and passes messages along.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = 300, MAX_CLIENTS = 1500, MAX_MSG_PER_SEC = 200;
const GAMES = {
  tank:    { name: 'Tank Battle', teams: true,  maxPer: 3 },
  boost:   { name: 'Boost Ball',  teams: true,  maxPer: 3 },
  racer:   { name: 'Neon Racer',  teams: false, max: 6 },
  gravity: { name: 'Gravity Changer', teams: false, max: 4 },
  snake:   { name: 'Snake Battle', teams: false, max: 6 },
  defense: { name: 'Neon Defense', teams: false, max: 4 },
  brawler: { name: 'Arena Brawler', teams: false, max: 8 },
  party:   { name: 'Party Mode', teams: false, max: 8 },
  ctf:     { name: 'Capture the Flag', teams: true, maxPer: 3 },
  zombie:  { name: 'Zombie Waves', teams: false, max: 4 },
  lights:  { name: 'Lights Out', teams: false, max: 8 },
};
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'penis', 'vagina', 'porn', 'sex', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'ass', 'damn', 'piss', 'boob', 'nude'];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url !== '/' && url !== '/index.html') { res.writeHead(404); res.end('not found'); return; }
  const full = path.join(__dirname, 'index.html');
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });
const clients = new Map();   // id -> client
const rooms = new Map();     // code -> room
let nextId = 1;

function cleanName(n) {
  n = String(n || '').replace(/[^A-Za-z0-9 _\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  const low = n.toLowerCase().replace(/[^a-z]/g, '');
  if (!n || BAD.some(b => low.includes(b))) n = 'Player' + Math.floor(100 + Math.random() * 900);
  return n;
}

function cleanChat(t) {
  t = String(t || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!t) return '';
  const low = t.toLowerCase().replace(/[^a-z]/g, '');
  if (BAD.some(b => low.includes(b))) return '';
  if (/https?:|www\.|\.com|\.net|\.gg|@|\d{5,}/i.test(t)) return '';   // no links, handles or phone numbers
  return t;
}
const send = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 50; i++) { let s = ''; for (let k = 0; k < 4; k++) s += L[Math.floor(Math.random() * L.length)]; if (!rooms.has(s)) return s; }
  return null;
}
function maxPlayers(room) {
  const g = GAMES[room.game], s = room.settings || {};
  if (room.game === 'brawler') return s.mode === 'tourney' ? 8 : 2;
  if (g.teams) return Math.max(1, Math.min(3, +s.size || 1)) * 2;
  return g.max;
}
function roomInfo(room) {
  return { code: room.code, game: room.game, host: room.host, pub: room.pub, started: room.started, settings: room.settings, max: maxPlayers(room), spec: (room.spec || []).length,
    players: room.players.map(id => { const c = clients.get(id); return { id, name: c.name, team: c.team, col: c.col === undefined ? -1 : c.col, ready: id === room.host ? true : !!c.ready }; }) };
}
function broadcastRoom(room) { const info = roomInfo(room); room.players.concat(room.spec || []).forEach(id => send(clients.get(id), { t: 'room', room: info })); }
function balanceTeams(room) {
  if (!GAMES[room.game].teams) { room.players.forEach(id => clients.get(id).team = 0); return; }
  const per = Math.max(1, Math.min(3, +room.settings.size || 1));
  const cnt = [0, 0]; room.players.forEach(id => { const t = clients.get(id).team; if (t === 0 || t === 1) cnt[t]++; });
  room.players.forEach(id => {
    const c = clients.get(id);
    if (c.team !== 0 && c.team !== 1) { c.team = cnt[0] <= cnt[1] ? 0 : 1; cnt[c.team]++; }
  });
  // trim overfull teams by moving extras to the other team if room
  [0, 1].forEach(t => {
    const mine = room.players.filter(id => clients.get(id).team === t);
    while (mine.length > per) { const id = mine.pop(); if (cnt[1 - t] < per) { clients.get(id).team = 1 - t; cnt[1 - t]++; cnt[t]--; } else break; }
  });
}
function leaveRoom(c, reason) {
  const room = c.room && rooms.get(c.room);
  c.room = null; c.team = 0; c.ready = false;
  if (!room) return;
  if (c.spec) { c.spec = false; room.spec = (room.spec || []).filter(id => id !== c.id); broadcastRoom(room); return; }
  room.players = room.players.filter(id => id !== c.id);
  if (room.t && room.host !== c.id && room.t.cur && (room.t.cur.a === c.id || room.t.cur.b === c.id)) tResolve(room, room.t.cur.a === c.id ? room.t.cur.b : room.t.cur.a);
  if (room.host === c.id) {
    if (room.t) clearTimeout(room.t.timer);
    room.players.concat(room.spec || []).forEach(id => { const o = clients.get(id); o.room = null; o.spec = false; send(o, { t: 'closed', msg: 'The host left the room.' }); });
    rooms.delete(room.code);
  } else {
    if (!room.players.length) rooms.delete(room.code); else { room.players.forEach(id => send(clients.get(id), { t: 'left', id: c.id })); broadcastRoom(room); }
  }
}
// ── Tournament (Arena Brawler): single elimination for 3-8 players ──
function toLobby(room) {
  if (room.t) { clearTimeout(room.t.timer); room.t = null; }
  (room.spec || []).forEach(id => { const o = clients.get(id); if (o) { o.room = null; o.spec = false; send(o, { t: 'closed', msg: 'The match ended.' }); } }); room.spec = [];
  room.started = false; room.players.forEach(id => { clients.get(id).ready = false; }); broadcastRoom(room); room.players.forEach(id => send(clients.get(id), { t: 'lobby' }));
}
const tAll = (room, msg) => room.players.concat(room.spec || []).forEach(id => { const o = clients.get(id); if (o) send(o, msg); });
function tBrief(room) { const T = room.t; room.players.forEach(id => { const o = clients.get(id); if (o) T.names[id] = o.name; }); return { rounds: T.rounds.map(R => R.map(m => ({ a: m.a, b: m.b, w: m.w }))), names: T.names }; }
function tStart(room) {
  const ids = room.players.slice().sort(() => Math.random() - 0.5); let size = 4; while (size < ids.length) size *= 2;
  const m0 = size / 2, byes = size - ids.length, R0 = []; let k = 0;
  for (let i = 0; i < m0; i++) { if (i < byes) R0.push({ a: ids[k++], b: 0, w: 0 }); else { R0.push({ a: ids[k++], b: ids[k++], w: 0 }); } }
  const rounds = [R0]; let n = m0; while (n > 1) { n /= 2; rounds.push(Array.from({ length: n }, () => ({ a: 0, b: 0, w: 0 }))); }
  room.t = { rounds, r: 0, i: 0, cur: null, names: {}, timer: null }; tAdvance(room);
}
const tValid = (room, id) => id > 0 && room.players.includes(id);
function tPlace(T, mt) { if (T.r < T.rounds.length - 1) { const nm = T.rounds[T.r + 1][Math.floor(T.i / 2)], w = mt.w > 0 ? mt.w : 0; if (T.i % 2 === 0) nm.a = w; else nm.b = w; } }
function tNextMatch(room) {
  const T = room.t;
  for (;;) {
    const R = T.rounds[T.r]; const mt = R && R[T.i];
    if (!mt) { if (T.r >= T.rounds.length - 1) return null; T.r++; T.i = 0; continue; }
    const pa = tValid(room, mt.a), pb = tValid(room, mt.b);
    if (!pa && !pb) { mt.w = -1; tPlace(T, mt); T.i++; continue; }
    if (!pa || !pb) { mt.w = pa ? mt.a : mt.b; tPlace(T, mt); T.i++; continue; }
    return mt;
  }
}
function tAdvance(room) {
  const T = room.t; clearTimeout(T.timer); const mt = tNextMatch(room);
  if (!mt) { const ch = T.rounds[T.rounds.length - 1][0].w; tAll(room, { t: 'bracket', br: tBrief(room), champ: ch > 0 ? ch : 0 }); T.timer = setTimeout(() => { if (rooms.get(room.code) === room && room.t === T) toLobby(room); }, 10000); return; }
  tAll(room, { t: 'bracket', br: tBrief(room), next: [mt.a, mt.b], secs: 6 });
  T.timer = setTimeout(() => tGo(room, T), 6000);
}
function tGo(room, T) {
  if (rooms.get(room.code) !== room || room.t !== T) return;
  const mt = tNextMatch(room); if (!mt) { tAdvance(room); return; }
  T.cur = mt; const seed = Math.floor(Math.random() * 1e9), br = tBrief(room);
  room.players.forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed, match: [mt.a, mt.b], br }));
  (room.spec || []).forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed, spec: true, match: [mt.a, mt.b], br }));
}
function tResolve(room, w) { const T = room.t; if (!T || !T.cur) return; const mt = T.cur; T.cur = null; mt.w = w; tPlace(T, mt); T.i++; tAdvance(room); }

function publicList(game) {
  const out = [];
  rooms.forEach(r => { if (r.pub && (!game || r.game === game) && (r.started || r.players.length < maxPlayers(r))) { const h = clients.get(r.host); out.push({ code: r.code, game: r.game, host: h ? h.name : '?', n: r.players.length, max: maxPlayers(r), settings: r.settings, started: r.started }); } });
  return out.slice(0, 30);
}

wss.on('connection', (ws) => {
  if (clients.size >= MAX_CLIENTS) { ws.close(); return; }
  const c = { id: nextId++, ws, name: 'Player' + Math.floor(100 + Math.random() * 900), room: null, team: 0, alive: true, msgs: 0, tick: Date.now() };
  clients.set(c.id, c);
  send(c, { t: 'welcome', id: c.id, name: c.name });
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    const now = Date.now(); if (now - c.tick > 1000) { c.tick = now; c.msgs = 0; } if (++c.msgs > MAX_MSG_PER_SEC) return;
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = c.room ? rooms.get(c.room) : null;
    switch (m.t) {
      case 'hello': c.name = cleanName(m.name); c.col = (Number.isInteger(m.col) && m.col >= 0 && m.col < 8) ? m.col : -1; send(c, { t: 'welcome', id: c.id, name: c.name }); if (room) broadcastRoom(room); break;
      case 'list': send(c, { t: 'rooms', list: publicList(m.game) }); break;
      case 'create': {
        if (room) leaveRoom(c);
        if (!GAMES[m.game]) return;
        if (rooms.size >= MAX_ROOMS) { send(c, { t: 'err', msg: 'Server is full, try again soon.' }); return; }
        const code = newCode(); if (!code) return;
        const r = { code, game: m.game, host: c.id, pub: !!m.pub, started: false, players: [c.id], settings: sanitizeSettings(m.game, m.settings) };
        rooms.set(code, r); c.room = code; c.team = 0; balanceTeams(r); broadcastRoom(r); break;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        const r = rooms.get(code);
        if (!r) { send(c, { t: 'err', msg: 'No room with code ' + code + '.' }); return; }
        if (room) leaveRoom(c);
        if (r.started) {
          if (r.t && !r.t.cur) { send(c, { t: 'err', msg: 'Tournament between matches. Try again in a few seconds.' }); return; }
          r.spec = r.spec || []; if (r.spec.length >= 10) { send(c, { t: 'err', msg: 'Too many people watching.' }); return; }
          r.spec.push(c.id); c.room = code; c.spec = true; c.team = 0;
          send(c, { t: 'start', room: roomInfo(r), seed: 0, spec: true, match: r.t && r.t.cur ? [r.t.cur.a, r.t.cur.b] : undefined }); broadcastRoom(r); send(clients.get(r.host), { t: 'spec' }); return;
        }
        if (r.players.length >= maxPlayers(r)) { send(c, { t: 'err', msg: 'That room is full.' }); return; }
        r.players.push(c.id); c.room = code; c.team = -1; balanceTeams(r); broadcastRoom(r); break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'left', id: c.id, self: true }); break;
      case 'team': {
        if (!room || c.spec || room.started || !GAMES[room.game].teams) return;
        const t = m.team === 1 ? 1 : 0, per = Math.max(1, Math.min(3, +room.settings.size || 1));
        if (room.players.filter(id => clients.get(id).team === t && id !== c.id).length >= per) return;
        c.team = t; broadcastRoom(room); break;
      }
      case 'settings': {
        if (!room || room.host !== c.id || room.started) return;
        room.settings = sanitizeSettings(room.game, m.settings);
        if (room.players.length > maxPlayers(room)) { // kick extras from the end
          while (room.players.length > maxPlayers(room)) { const id = room.players[room.players.length - 1]; const o = clients.get(id); room.players.pop(); o.room = null; send(o, { t: 'kicked', msg: 'The room got smaller.' }); }
        }
        room.players.forEach(id => { if (GAMES[room.game].teams) clients.get(id).team = -1; }); balanceTeams(room); broadcastRoom(room); break;
      }
      case 'chat': {
        if (!room) return; const now2 = Date.now(); if (now2 - (c.lastChat || 0) < 900) return; c.lastChat = now2;
        const text = cleanChat(m.text); if (!text) return;
        room.players.concat(room.spec || []).forEach(id => send(clients.get(id), { t: 'chat', id: c.id, name: c.name, text })); break;
      }
      case 'emo': {
        if (!room || c.spec) return; const now3 = Date.now(); if (now3 - (c.lastEmo || 0) < 1200) return; c.lastEmo = now3;
        const e = Math.max(0, Math.min(3, m.e | 0));
        room.players.concat(room.spec || []).forEach(id => send(clients.get(id), { t: 'emo', id: c.id, name: c.name, e })); break;
      }
      case 'where': {
        const want = (Array.isArray(m.names) ? m.names : []).slice(0, 20).map(n => String(n || '').toLowerCase().slice(0, 12)); const out = [];
        for (const n of want) {
          let found = null; for (const o of clients.values()) if (o.name && o.name.toLowerCase() === n && o !== c) { found = o; break; }
          if (!found) { out.push({ name: n, on: false }); continue; }
          const fr = found.room ? rooms.get(found.room) : null;
          out.push({ name: found.name, on: true, game: fr ? fr.game : null, pub: fr ? !!fr.pub : false, code: fr && fr.pub ? fr.code : null, started: fr ? !!fr.started : false });
        }
        send(c, { t: 'where', r: out }); break;
      }
      case 'ready': if (room && !c.spec) { c.ready = !!m.v; broadcastRoom(room); } break;
      case 'pub': if (room && room.host === c.id) { room.pub = !!m.pub; broadcastRoom(room); } break;
      case 'kick': {
        if (!room || room.host !== c.id) return;
        const o = clients.get(+m.id); if (!o || o.id === c.id || o.room !== room.code) return;
        room.players = room.players.filter(id => id !== o.id); o.room = null; send(o, { t: 'kicked', msg: 'The host removed you from the room.' }); broadcastRoom(room); break;
      }
      case 'start': {
        if (!room || room.host !== c.id || room.started) return;
        const g = GAMES[room.game];
        if (room.players.length < 2) { send(c, { t: 'err', msg: 'You need at least 2 players.' }); return; }
        if (g.teams) { const a = room.players.filter(id => clients.get(id).team === 0).length, b = room.players.length - a; if (!a || !b) { send(c, { t: 'err', msg: 'Each team needs at least 1 player.' }); return; } }
        const waiting = room.players.filter(id => id !== room.host && !clients.get(id).ready);
        if (waiting.length) { send(c, { t: 'err', msg: 'Waiting for ' + clients.get(waiting[0]).name + (waiting.length > 1 ? ' and ' + (waiting.length - 1) + ' more' : '') + ' to press READY.' }); return; }
        if (room.game === 'brawler') {
          if (room.settings.mode === 'tourney' && room.players.length < 3) { send(c, { t: 'err', msg: 'A tournament needs 3 or more players (use Duel for 2).' }); return; }
          if (room.settings.mode !== 'tourney' && room.players.length !== 2) { send(c, { t: 'err', msg: 'A duel needs exactly 2 players. Switch to Tournament for more.' }); return; }
        }
        room.players.forEach(id => { clients.get(id).ready = false; });
        room.started = true; broadcastRoom(room);
        if (room.game === 'brawler' && room.settings.mode === 'tourney') { tStart(room); break; }
        room.players.forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed: Math.floor(Math.random() * 1e9) }));
        break;
      }
      case 'lobby': if (room && room.host === c.id) toLobby(room); break;
      case 'tres': if (room && room.host === c.id && room.t && room.t.cur) { const w = +m.w; if (w === room.t.cur.a || w === room.t.cur.b) tResolve(room, w); } break;
      case 'again': if (room && room.host === c.id && room.started && !room.t) {
        room.players.forEach(id => { clients.get(id).ready = false; }); broadcastRoom(room);
        const seed = Math.floor(Math.random() * 1e9); room.players.forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed })); (room.spec || []).forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed, spec: true })); } break;
      case 'in': { if (!room || !room.started || c.spec) return; const h = clients.get(room.host); if (h && h.id !== c.id) send(h, { t: 'in', from: c.id, d: m.d }); break; }
      case 'st': { if (!room || room.host !== c.id) return; room.players.concat(room.spec || []).forEach(id => { if (id !== c.id) send(clients.get(id), { t: 'st', d: m.d }); }); break; }
      case 'ev': { if (!room || room.host !== c.id) return; room.players.concat(room.spec || []).forEach(id => { if (id !== c.id) send(clients.get(id), { t: 'ev', d: m.d }); }); break; }
    }
  });
  ws.on('close', () => { leaveRoom(c); clients.delete(c.id); });
  ws.on('error', () => {});
});

function sanitizeSettings(game, s) {
  s = s || {}; const o = {};
  if (game === 'tank') { o.size = Math.max(1, Math.min(3, +s.size || 1)); o.rounds = [3, 5, 7].includes(+s.rounds) ? +s.rounds : 5; o.map = [0, 1, 2, 3, 4].includes(+s.map) ? +s.map : 4; }
  else if (game === 'boost') { o.size = Math.max(1, Math.min(3, +s.size || 1)); o.goals = [5, 10].includes(+s.goals) ? +s.goals : 5; o.mins = [1, 2, 3].includes(+s.mins) ? +s.mins : 2; }
  else if (game === 'racer') { o.track = Math.max(0, Math.min(5, +s.track || 0)); o.laps = [2, 3, 4].includes(+s.laps) ? +s.laps : 3; }
  else if (game === 'snake') { o.speed = Math.max(1, Math.min(3, +s.speed || 2)); o.walls = s.walls === 'wrap' ? 'wrap' : 'solid'; }
  else if (game === 'brawler') { o.mode = s.mode === 'tourney' ? 'tourney' : 'duel'; }
  else if (game === 'defense') { o.diff = [0, 1, 2].includes(+s.diff) ? +s.diff : 1; }
  else if (game === 'party') { const K = ['react', 'mash', 'dodge', 'snake', 'gravity', 'racer']; let l = Array.isArray(s.list) ? s.list.filter((x, i, a) => K.includes(x) && a.indexOf(x) === i) : []; if (!l.length) l = ['react', 'mash', 'dodge', 'snake']; o.list = l; }
  else if (game === 'ctf') { o.size = Math.max(1, Math.min(3, +s.size || 1)); o.caps = [3, 5].includes(+s.caps) ? +s.caps : 3; }
  else if (game === 'zombie') { o.diff = [0, 1, 2].includes(+s.diff) ? +s.diff : 1; }
  else if (game === 'lights') { o.rounds = [3, 5, 8].includes(+s.rounds) ? +s.rounds : 3; o.time = [45, 60, 90].includes(+s.time) ? +s.time : 60; }
  else if (game === 'gravity') { o.mode = ['versus', 'race', 'coop'].includes(s.mode) ? s.mode : 'versus'; }
  return o;
}

setInterval(() => { wss.clients.forEach(ws => { const c = [...clients.values()].find(x => x.ws === ws); if (c && !c.alive) { ws.terminate(); return; } if (c) c.alive = false; try { ws.ping(); } catch (e) {} }); }, 25000);
server.listen(PORT, () => console.log('Arcade online server on port ' + PORT));
