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
const send = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < 50; i++) { let s = ''; for (let k = 0; k < 4; k++) s += L[Math.floor(Math.random() * L.length)]; if (!rooms.has(s)) return s; }
  return null;
}
function maxPlayers(room) {
  const g = GAMES[room.game], s = room.settings || {};
  if (g.teams) return Math.max(1, Math.min(3, +s.size || 1)) * 2;
  return g.max;
}
function roomInfo(room) {
  return { code: room.code, game: room.game, host: room.host, pub: room.pub, started: room.started, settings: room.settings, max: maxPlayers(room),
    players: room.players.map(id => { const c = clients.get(id); return { id, name: c.name, team: c.team }; }) };
}
function broadcastRoom(room) { const info = roomInfo(room); room.players.forEach(id => send(clients.get(id), { t: 'room', room: info })); }
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
  c.room = null; c.team = 0;
  if (!room) return;
  room.players = room.players.filter(id => id !== c.id);
  if (room.host === c.id) {
    room.players.forEach(id => { const o = clients.get(id); o.room = null; send(o, { t: 'closed', msg: 'The host left the room.' }); });
    rooms.delete(room.code);
  } else {
    if (!room.players.length) rooms.delete(room.code); else { room.players.forEach(id => send(clients.get(id), { t: 'left', id: c.id })); broadcastRoom(room); }
  }
}
function publicList(game) {
  const out = [];
  rooms.forEach(r => { if (r.pub && !r.started && (!game || r.game === game) && r.players.length < maxPlayers(r)) { const h = clients.get(r.host); out.push({ code: r.code, game: r.game, host: h ? h.name : '?', n: r.players.length, max: maxPlayers(r), settings: r.settings }); } });
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
      case 'hello': c.name = cleanName(m.name); send(c, { t: 'welcome', id: c.id, name: c.name }); if (room) broadcastRoom(room); break;
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
        if (r.started) { send(c, { t: 'err', msg: 'That match already started.' }); return; }
        if (r.players.length >= maxPlayers(r)) { send(c, { t: 'err', msg: 'That room is full.' }); return; }
        if (room) leaveRoom(c);
        r.players.push(c.id); c.room = code; c.team = -1; balanceTeams(r); broadcastRoom(r); break;
      }
      case 'leave': leaveRoom(c); send(c, { t: 'left', id: c.id, self: true }); break;
      case 'team': {
        if (!room || room.started || !GAMES[room.game].teams) return;
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
        room.started = true; broadcastRoom(room);
        room.players.forEach(id => send(clients.get(id), { t: 'start', room: roomInfo(room), seed: Math.floor(Math.random() * 1e9) }));
        break;
      }
      case 'lobby': if (room && room.host === c.id) { room.started = false; broadcastRoom(room); room.players.forEach(id => send(clients.get(id), { t: 'lobby' })); } break;
      case 'in': { if (!room || !room.started) return; const h = clients.get(room.host); if (h && h.id !== c.id) send(h, { t: 'in', from: c.id, d: m.d }); break; }
      case 'st': { if (!room || room.host !== c.id) return; room.players.forEach(id => { if (id !== c.id) send(clients.get(id), { t: 'st', d: m.d }); }); break; }
      case 'ev': { if (!room || room.host !== c.id) return; room.players.forEach(id => { if (id !== c.id) send(clients.get(id), { t: 'ev', d: m.d }); }); break; }
    }
  });
  ws.on('close', () => { leaveRoom(c); clients.delete(c.id); });
  ws.on('error', () => {});
});

function sanitizeSettings(game, s) {
  s = s || {}; const o = {};
  if (game === 'tank') { o.size = Math.max(1, Math.min(3, +s.size || 1)); o.rounds = [3, 5, 7].includes(+s.rounds) ? +s.rounds : 5; }
  else if (game === 'boost') { o.size = Math.max(1, Math.min(3, +s.size || 1)); o.goals = [5, 10].includes(+s.goals) ? +s.goals : 5; o.mins = [1, 2, 3].includes(+s.mins) ? +s.mins : 2; }
  else if (game === 'racer') { o.track = Math.max(0, Math.min(2, +s.track || 0)); o.laps = [2, 3, 4].includes(+s.laps) ? +s.laps : 3; }
  else if (game === 'gravity') { o.mode = ['versus', 'race', 'coop'].includes(s.mode) ? s.mode : 'versus'; }
  return o;
}

setInterval(() => { wss.clients.forEach(ws => { const c = [...clients.values()].find(x => x.ws === ws); if (c && !c.alive) { ws.terminate(); return; } if (c) c.alive = false; try { ws.ping(); } catch (e) {} }); }, 25000);
server.listen(PORT, () => console.log('Arcade online server on port ' + PORT));
