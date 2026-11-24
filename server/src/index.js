import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { validateInitData } from './telegram.js';
import { Rooms, DEFAULTS } from './rooms.js';
import { TelegramBot } from './botapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(env = process.env, roomOpts = {}) {
  const botToken = env.BOT_TOKEN || '';
  const isProd = env.NODE_ENV === 'production';
  // Ishlab chiqarishda dev-kirish o'chiq. BOT_TOKEN bo'lmasa faqat rivojlantirish rejimida ishlaydi.
  const allowDev = env.ALLOW_DEV_AUTH ? env.ALLOW_DEV_AUTH === '1' : !isProd;

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN || (isProd ? false : '*') },
    pingInterval: 10000,
    pingTimeout: 10000
  });
  // TIME_SCALE (masalan 0.2) — sinov/demo uchun barcha kutish vaqtlarini qisqartiradi
  const scale = Number(env.TIME_SCALE) || 1;
  const scaled = scale === 1 ? {} : Object.fromEntries(
    ['turnMs', 'botRollMs', 'botMoveMs', 'afterMoveMs', 'afterRollMs'].map((k) => [k, Math.round(DEFAULTS[k] * scale)]));
  const rooms = new Rooms(io, { ...scaled, ...roomOpts });

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
  const cfg = { botUsername: env.BOT_USERNAME || '' };
  app.get('/api/config', (_req, res) => res.json({
    botUsername: cfg.botUsername,
    appShortName: env.APP_SHORT_NAME || '',
    devAuth: allowDev
  }));

  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // ---- autentifikatsiya ----
  io.use((socket, next) => {
    const a = socket.handshake.auth || {};
    let user = null;
    if (a.initData) user = validateInitData(a.initData, botToken);
    if (!user && allowDev && a.dev && a.dev.id) {
      user = {
        id: 'dev:' + String(a.dev.id).slice(0, 32),
        name: String(a.dev.name || 'Mehmon').slice(0, 24)
      };
    }
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    // oddiy tezlik cheklovi: sekundiga ko'pi bilan 12 ta amal
    const RATE = Number(env.RATE_LIMIT) || 12;
    let tokens = RATE, last = Date.now();
    const allow = () => {
      const now = Date.now();
      tokens = Math.min(RATE, tokens + ((now - last) / 1000) * RATE);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };
    const on = (event, fn) => socket.on(event, (payload, cb) => {
      if (typeof payload === 'function') { cb = payload; payload = {}; }
      const reply = typeof cb === 'function' ? cb : () => {};
      if (!allow()) return reply({ ok: false, error: 'rate_limited' });
      try { reply(fn(payload || {}) ?? { ok: true }); } catch (e) { console.error(event, e); reply({ ok: false, error: 'server_error' }); }
    });

    const existing = rooms.roomOf(user.id);
    socket.emit('hello', { user: { id: user.id, name: user.name, photo: user.photo }, code: existing?.code || null, startParam: user.startParam });
    rooms.attach(user, socket);

    on('room:create', () => ({ ok: true, code: rooms.createRoom(user, socket).code }));
    on('room:join', ({ code }) => rooms.join(user, code, socket));
    on('room:addBot', () => rooms.addBot(user.id));
    on('room:removeBot', ({ botId }) => rooms.removeBot(user.id, botId));
    on('room:start', () => rooms.start(user.id));
    on('room:rematch', () => rooms.rematch(user.id));
    on('room:leave', () => { rooms.leave(user.id, socket); return { ok: true }; });
    on('match:find', () => rooms.find(user, socket));
    on('match:cancel', () => ({ ok: true, cancelled: rooms.dequeue(user.id) }));
    on('game:vsBots', ({ bots }) => ({ ok: true, code: rooms.vsBots(user, socket, bots).code }));
    on('game:roll', () => rooms.humanRoll(user.id));
    on('game:move', ({ token }) => rooms.humanMove(user.id, Number(token)));
    on('ping:time', () => ({ ok: true, now: Date.now() }));

    socket.on('disconnect', () => {
      // faqat shu foydalanuvchining oxirgi socketi uzilganda
      const still = [...io.sockets.sockets.values()].some((s) => s.id !== socket.id && s.data.user?.id === user.id);
      if (!still) rooms.detach(user.id);
    });
  });

  // PUBLIC_URL (HTTPS) berilsa: menyu tugmasi va /start <kod> javobi avtomatik sozlanadi
  let bot = null;
  const publicUrl = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL; // Render manzilni o'zi beradi
  if (botToken && publicUrl) {
    bot = new TelegramBot(botToken, publicUrl);
    bot.setup().then((me) => {
      cfg.botUsername = cfg.botUsername || me.username;
      bot.start();
      console.log(`Telegram bot tayyor: https://t.me/${me.username}`);
    }).catch((e) => console.error('Telegram bot sozlanmadi:', e.message));
  }

  return { app, server, io, rooms, bot };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server } = createApp();
  const port = Number(process.env.PORT) || 3001;
  server.listen(port, () => {
    console.log(`Ludo server: http://localhost:${port}`);
    if (!process.env.BOT_TOKEN) console.log('BOT_TOKEN yo\'q: faqat dev-kirish ishlaydi (Telegramsiz sinov uchun)');
  });
}
