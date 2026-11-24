// Xonalar, navbat taymeri, botlar va matchmaking. Barcha o'yin qoidalari engine.js da.
import crypto from 'node:crypto';
import { SEAT_ORDER } from '../../shared/rules.js';
import { newGame, roll, move, removeColor } from './engine.js';
import { chooseMove } from './bot.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I yo'q
const BOT_NAMES = ['Bot Anvar', 'Bot Malika', 'Bot Jasur', 'Bot Dilnoza'];

export const DEFAULTS = {
  turnMs: 25000,       // odam yurishi uchun vaqt
  botRollMs: 800,      // bot zar tashlashdan oldin kutish
  botMoveMs: 900,      // bot yurishdan oldin kutish
  afterMoveMs: 700,    // yurish animatsiyasi tugashi uchun qo'shimcha kutish
  afterRollMs: 450,    // zar animatsiyasi tugashi uchun qo'shimcha kutish
  matchWaitMs: 8000,   // raqib topilmasa bot qo'shiladi
  lobbyIdleMs: 15 * 60 * 1000,
  emptyRoomMs: 3 * 60 * 1000,
  afterOverMs: 2 * 60 * 1000
};

export class Rooms {
  constructor(io, opts = {}) {
    this.io = io;
    this.cfg = { ...DEFAULTS, ...opts };
    this.rollDice = opts.rollDice || (() => crypto.randomInt(1, 7));
    this.rooms = new Map();
    this.byUser = new Map(); // userId -> room code
    this.queue = []; // [{user, timer}]
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }

  // ---------- yordamchilar ----------
  genCode() {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let k = 0; k < 6; k++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('kod yaratib bo\'lmadi');
  }

  roomOf(userId) {
    const code = this.byUser.get(userId);
    return code ? this.rooms.get(code) : undefined;
  }

  snapshot(room, event = null) {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      players: room.players.map((p) => ({
        userId: p.userId, name: p.name, photo: p.photo, color: p.color,
        isBot: p.isBot, connected: p.connected || p.isBot, left: !!p.left
      })),
      state: room.state,
      event,
      deadline: room.deadline,
      now: Date.now()
    };
  }

  broadcast(room, event = null) {
    room.lastActive = Date.now();
    this.io.to(room.code).emit('room:update', this.snapshot(room, event));
  }

  freeColor(room) {
    return SEAT_ORDER.find((c) => !room.players.some((p) => p.color === c));
  }

  humans(room) {
    return room.players.filter((p) => !p.isBot && !p.left);
  }

  // ---------- xona boshqaruvi ----------
  createRoom(user, socket) {
    if (this.roomOf(user.id)) this.leave(user.id);
    const code = this.genCode();
    const room = {
      code, hostId: user.id, status: 'lobby', players: [], state: null,
      deadline: null, timer: null, createdAt: Date.now(), lastActive: Date.now(), emptySince: null
    };
    this.rooms.set(code, room);
    this.addHuman(room, user, socket);
    return room;
  }

  addHuman(room, user, socket) {
    const color = this.freeColor(room);
    room.players.push({
      userId: user.id, name: user.name, photo: user.photo, color,
      isBot: false, connected: true, missed: 0, afk: false
    });
    this.byUser.set(user.id, room.code);
    socket?.join(room.code);
  }

  join(user, code, socket) {
    code = String(code || '').toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'room_not_found' };
    const existing = room.players.find((p) => p.userId === user.id && !p.left);
    if (existing) { // qayta ulanish
      this.attach(user, socket);
      return { ok: true, code: room.code };
    }
    if (room.status !== 'lobby') return { ok: false, error: 'already_started' };
    if (room.players.length >= 4) return { ok: false, error: 'room_full' };
    if (this.roomOf(user.id)) this.leave(user.id);
    this.dequeue(user.id);
    this.addHuman(room, user, socket);
    this.broadcast(room);
    return { ok: true, code: room.code };
  }

  addBot(userId) {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, error: 'no_room' };
    if (room.hostId !== userId) return { ok: false, error: 'not_host' };
    if (room.status !== 'lobby') return { ok: false, error: 'already_started' };
    if (room.players.length >= 4) return { ok: false, error: 'room_full' };
    const n = room.players.filter((p) => p.isBot).length;
    room.players.push({
      userId: 'bot:' + crypto.randomUUID(), name: BOT_NAMES[n % BOT_NAMES.length],
      color: this.freeColor(room), isBot: true, connected: true
    });
    this.broadcast(room);
    return { ok: true };
  }

  removeBot(userId, botId) {
    const room = this.roomOf(userId);
    if (!room || room.hostId !== userId || room.status !== 'lobby') return { ok: false, error: 'not_allowed' };
    const i = room.players.findIndex((p) => p.isBot && p.userId === botId);
    if (i < 0) return { ok: false, error: 'not_found' };
    room.players.splice(i, 1);
    this.broadcast(room);
    return { ok: true };
  }

  start(userId) {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, error: 'no_room' };
    if (room.hostId !== userId) return { ok: false, error: 'not_host' };
    if (room.status !== 'lobby') return { ok: false, error: 'already_started' };
    if (room.players.length < 2) return { ok: false, error: 'need_players' };
    this.beginGame(room);
    return { ok: true };
  }

  rematch(userId) {
    const room = this.roomOf(userId);
    if (!room) return { ok: false, error: 'no_room' };
    if (room.hostId !== userId) return { ok: false, error: 'not_host' };
    if (room.status !== 'over') return { ok: false, error: 'wrong_phase' };
    room.players = room.players.filter((p) => !p.left);
    if (room.players.length < 2) return { ok: false, error: 'need_players' };
    this.beginGame(room);
    return { ok: true };
  }

  beginGame(room) {
    room.state = newGame(room.players.map((p) => p.color));
    room.status = 'playing';
    this.broadcast(room, { type: 'start' });
    this.schedule(room);
  }

  /** Mijoz (qayta) ulanganda */
  attach(user, socket) {
    const room = this.roomOf(user.id);
    if (!room) return null;
    const p = room.players.find((x) => x.userId === user.id);
    if (!p || p.left) return null;
    p.connected = true;
    room.emptySince = null;
    socket.join(room.code);
    this.broadcast(room);
    if (room.status === 'playing') this.schedule(room);
    return room;
  }

  detach(userId) {
    this.dequeue(userId);
    const room = this.roomOf(userId);
    if (!room) return;
    const p = room.players.find((x) => x.userId === userId);
    if (!p) return;
    p.connected = false;
    if (!this.humans(room).some((h) => h.connected)) room.emptySince = Date.now();
    this.broadcast(room);
    if (room.status === 'playing') this.schedule(room);
  }

  leave(userId, socket) {
    this.dequeue(userId);
    const room = this.roomOf(userId);
    this.byUser.delete(userId);
    if (!room) return;
    socket?.leave(room.code);
    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx < 0) return;
    if (room.status === 'lobby') {
      room.players.splice(idx, 1);
      if (this.humans(room).length === 0) return this.destroy(room);
      if (room.hostId === userId) room.hostId = this.humans(room)[0].userId;
      this.broadcast(room);
      return;
    }
    // o'yin ketayotgan bo'lsa: o'yinchi o'rniga bot o'ynaydi
    const p = room.players[idx];
    p.isBot = true; p.left = true; p.connected = false;
    p.name = p.name;
    if (this.humans(room).length === 0) return this.destroy(room);
    if (room.hostId === userId) room.hostId = this.humans(room)[0].userId;
    this.broadcast(room);
    if (room.status === 'playing') this.schedule(room);
  }

  destroy(room) {
    clearTimeout(room.timer);
    for (const p of room.players) if (this.byUser.get(p.userId) === room.code) this.byUser.delete(p.userId);
    this.rooms.delete(room.code);
  }

  // ---------- matchmaking ----------
  find(user, socket) {
    if (this.roomOf(user.id)) this.leave(user.id, socket);
    this.dequeue(user.id);
    const other = this.queue.shift();
    if (other) {
      clearTimeout(other.timer);
      const room = this.createRoom(other.user, other.socket);
      this.addHuman(room, user, socket);
      this.beginGame(room);
      return { ok: true, matched: true, code: room.code };
    }
    const entry = { user, socket, timer: null };
    entry.timer = setTimeout(() => {
      this.dequeue(user.id);
      const room = this.createRoom(user, socket);
      this.addBotTo(room);
      this.beginGame(room);
    }, this.cfg.matchWaitMs);
    this.queue.push(entry);
    return { ok: true, matched: false };
  }

  addBotTo(room) {
    const n = room.players.filter((p) => p.isBot).length;
    room.players.push({
      userId: 'bot:' + crypto.randomUUID(), name: BOT_NAMES[n % BOT_NAMES.length],
      color: this.freeColor(room), isBot: true, connected: true
    });
  }

  dequeue(userId) {
    const i = this.queue.findIndex((q) => q.user.id === userId);
    if (i >= 0) { clearTimeout(this.queue[i].timer); this.queue.splice(i, 1); return true; }
    return false;
  }

  /** Botlar bilan tezkor o'yin */
  vsBots(user, socket, bots = 1) {
    const room = this.createRoom(user, socket);
    const n = Math.max(1, Math.min(3, Number(bots) || 1));
    for (let i = 0; i < n; i++) this.addBotTo(room);
    this.beginGame(room);
    return room;
  }

  // ---------- o'yin harakatlari ----------
  current(room) {
    return room.players.find((p) => p.color === room.state.turn);
  }

  isAuto(p) {
    return p.isBot || !p.connected || p.afk;
  }

  humanRoll(userId) {
    const room = this.roomOf(userId);
    if (!room || room.status !== 'playing') return { ok: false, error: 'not_playing' };
    const p = this.current(room);
    if (p.userId !== userId) return { ok: false, error: 'not_your_turn' };
    if (room.state.phase !== 'roll') return { ok: false, error: 'wrong_phase' };
    p.missed = 0; p.afk = false;
    this.applyRoll(room);
    return { ok: true };
  }

  humanMove(userId, token) {
    const room = this.roomOf(userId);
    if (!room || room.status !== 'playing') return { ok: false, error: 'not_playing' };
    const p = this.current(room);
    if (p.userId !== userId) return { ok: false, error: 'not_your_turn' };
    if (room.state.phase !== 'move' || !room.state.movable.includes(token)) return { ok: false, error: 'illegal_move' };
    p.missed = 0; p.afk = false;
    this.applyMove(room, token);
    return { ok: true };
  }

  applyRoll(room) {
    const ev = roll(room.state, this.rollDice());
    this.afterAction(room, ev);
  }

  applyMove(room, token) {
    const ev = move(room.state, token);
    this.afterAction(room, ev);
  }

  afterAction(room, ev) {
    if (room.state.phase === 'over') {
      room.status = 'over';
      room.deadline = null;
      clearTimeout(room.timer);
      room.overAt = Date.now();
      this.broadcast(room, ev);
      return;
    }
    this.broadcast(room, ev);
    this.schedule(room, ev);
  }

  schedule(room, ev) {
    clearTimeout(room.timer);
    room.deadline = null;
    if (room.status !== 'playing') return;
    const st = room.state;
    const p = this.current(room);
    if (!p) return;
    // zar tashlangandan so'ng animatsiya uchun biroz kutish
    const settle = ev ? (ev.type === 'move' ? this.cfg.afterMoveMs : this.cfg.afterRollMs) : 0;

    if (this.isAuto(p)) {
      const wait = (st.phase === 'roll' ? this.cfg.botRollMs : this.cfg.botMoveMs) + settle;
      room.timer = setTimeout(() => this.autoStep(room), wait);
      return;
    }
    room.deadline = Date.now() + this.cfg.turnMs + settle;
    room.timer = setTimeout(() => {
      p.missed = (p.missed || 0) + 1;
      if (p.missed >= 2) p.afk = true;
      this.autoStep(room);
    }, this.cfg.turnMs + settle);
  }

  autoStep(room) {
    if (room.status !== 'playing') return;
    if (room.state.phase === 'roll') this.applyRoll(room);
    else if (room.state.phase === 'move') this.applyMove(room, chooseMove(room.state));
  }

  // ---------- tozalash ----------
  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.lastActive;
      if (room.status === 'lobby' && idle > this.cfg.lobbyIdleMs) this.destroy(room);
      else if (room.status === 'over' && now - (room.overAt || now) > this.cfg.afterOverMs) this.destroy(room);
      else if (room.emptySince && now - room.emptySince > this.cfg.emptyRoomMs) this.destroy(room);
    }
  }

  close() {
    clearInterval(this.sweeper);
    for (const q of this.queue) clearTimeout(q.timer);
    for (const r of this.rooms.values()) clearTimeout(r.timer);
  }
}

export { removeColor };
