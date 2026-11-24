import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/index.js';

const FAST = { turnMs: 3000, botRollMs: 5, botMoveMs: 5, afterMoveMs: 0, afterRollMs: 0, matchWaitMs: 150 };

async function boot(env = {}, opts = FAST) {
  const ctx = createApp({ ALLOW_DEV_AUTH: '1', RATE_LIMIT: '100000', ...env }, opts);
  await new Promise((r) => ctx.server.listen(0, r));
  const url = `http://localhost:${ctx.server.address().port}`;
  const clients = [];
  const client = (id, name = id) => {
    const s = connect(url, { auth: { dev: { id, name } }, transports: ['websocket'], forceNew: true });
    s.last = null;
    s.on('room:update', (r) => { s.last = r; });
    const p = new Promise((res, rej) => { s.on('hello', res); s.on('connect_error', rej); });
    clients.push(s);
    return p.then((hello) => { s.hello = hello; return s; });
  };
  const emit = (s, ev, payload = {}) => new Promise((r) => s.emit(ev, payload, r));
  const close = async () => {
    clients.forEach((c) => c.close());
    ctx.rooms.close();
    ctx.io.close();
    await new Promise((r) => ctx.server.close(r));
  };
  return { ...ctx, url, client, emit, close };
}

/** Mijoz o'zi navbatida bo'lsa avtomatik o'ynaydi */
function autoplay(s, me) {
  s.on('room:update', (r) => {
    if (r.status !== 'playing') return;
    const mine = r.players.find((p) => p.userId === me);
    if (mine.color !== r.state.turn) return;
    if (r.state.phase === 'roll') s.emit('game:roll', {}, () => {});
    else if (r.state.phase === 'move') s.emit('game:move', { token: r.state.movable[0] }, () => {});
  });
}

const until = (fn, ms = 20000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const v = fn();
    if (v) { clearInterval(iv); res(v); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('kutish vaqti tugadi')); }
  }, 10);
});

test('autentifikatsiyasiz ulanish rad etiladi', async () => {
  const t = await boot();
  const s = connect(t.url, { transports: ['websocket'], forceNew: true });
  const err = await new Promise((r) => s.on('connect_error', r));
  assert.match(err.message, /unauthorized/);
  s.close();
  await t.close();
});

test('ishlab chiqarishda dev-kirish o\'chiq', async () => {
  const t = await boot({ NODE_ENV: 'production', ALLOW_DEV_AUTH: '' });
  const s = connect(t.url, { auth: { dev: { id: 'x' } }, transports: ['websocket'], forceNew: true });
  const err = await new Promise((r) => s.on('connect_error', r));
  assert.match(err.message, /unauthorized/);
  s.close();
  await t.close();
});

test('ikki odam xona orqali to\'liq o\'yin o\'ynaydi', async () => {
  const t = await boot();
  const a = await t.client('a', 'Ali');
  const b = await t.client('b', 'Vali');
  const { code } = await t.emit(a, 'room:create');
  assert.match(code, /^[A-Z2-9]{6}$/);

  assert.equal((await t.emit(b, 'room:join', { code: 'ZZZZZZ' })).error, 'room_not_found');
  assert.equal((await t.emit(a, 'room:start')).error, 'need_players');
  assert.equal((await t.emit(b, 'room:join', { code: code.toLowerCase() })).ok, true);
  assert.equal((await t.emit(b, 'room:start')).error, 'not_host');

  await until(() => a.last?.players.length === 2);
  assert.deepEqual(a.last.players.map((p) => p.color), ['blue', 'green']);

  autoplay(a, a.hello.user.id);
  autoplay(b, b.hello.user.id);
  assert.equal((await t.emit(a, 'room:start')).ok, true);
  await until(() => a.last?.status === 'over');
  assert.equal(a.last.state.winners.length, 2);
  assert.ok(a.last.state.tokens[a.last.state.winners[0]].every((p) => p === 56));
  await t.close();
});

test('navbati emas yoki noto\'g\'ri harakat rad etiladi (aldab bo\'lmaydi)', async () => {
  const t = await boot({}, { ...FAST, turnMs: 60000 });
  const a = await t.client('a');
  const b = await t.client('b');
  const { code } = await t.emit(a, 'room:create');
  await t.emit(b, 'room:join', { code });
  await t.emit(a, 'room:start');
  await until(() => a.last?.status === 'playing');
  // kimning navbati bo'lsa — o'sha 'turn', ikkinchisi 'other'
  const colorOf = (id) => a.last.players.find((p) => p.userId === id).color;
  const [turn, other] = colorOf('dev:a') === a.last.state.turn ? [a, b] : [b, a];
  assert.equal((await t.emit(other, 'game:roll')).error, 'not_your_turn');
  assert.equal((await t.emit(turn, 'game:move', { token: 0 })).error, 'illegal_move');
  assert.equal((await t.emit(turn, 'game:roll')).ok, true);
  const again = await t.emit(turn, 'game:roll');
  assert.ok(['wrong_phase', 'not_your_turn'].includes(again.error));
  // tashqaridan kelgan axlat qiymatlar xato bermasdan rad etiladi
  assert.equal((await t.emit(turn, 'game:move', { token: 'x' })).ok, false);
  assert.equal((await t.emit(turn, 'game:move', { token: 99 })).ok, false);
  await t.close();
});

test('botlar bilan o\'yin: odam o\'ynasa bot javob beradi va o\'yin tugaydi', async () => {
  const t = await boot();
  const a = await t.client('a');
  autoplay(a, a.hello.user.id);
  const { code } = await t.emit(a, 'game:vsBots', { bots: 1 });
  assert.ok(code);
  await until(() => a.last?.status === 'over');
  assert.equal(a.last.players.filter((p) => p.isBot).length, 1);
  // qayta o'ynash
  assert.equal((await t.emit(a, 'room:rematch')).ok, true);
  await until(() => a.last?.status === 'playing' || a.last?.status === 'over');
  await t.close();
});

test('matchmaking: ikki odam juftlashadi, yolg\'iz odamga bot topiladi', async () => {
  const t = await boot();
  const a = await t.client('a');
  const b = await t.client('b');
  const c = await t.client('c');
  assert.equal((await t.emit(a, 'match:find')).matched, false);
  const r = await t.emit(b, 'match:find');
  assert.equal(r.matched, true);
  await until(() => a.last?.status === 'playing' && b.last?.status === 'playing');
  assert.equal(a.last.code, b.last.code);
  assert.equal(a.last.players.every((p) => !p.isBot), true);

  assert.equal((await t.emit(c, 'match:find')).matched, false);
  await until(() => c.last?.status === 'playing');
  assert.equal(c.last.players.filter((p) => p.isBot).length, 1);
  await t.close();
});

test('uzilgan o\'yinchi o\'rniga navbat avtomatik o\'tadi va qayta ulanish ishlaydi', async () => {
  const t = await boot();
  const a = await t.client('a');
  const b = await t.client('b');
  const { code } = await t.emit(a, 'room:create');
  await t.emit(b, 'room:join', { code });
  autoplay(a, a.hello.user.id);
  await t.emit(a, 'room:start');
  await until(() => a.last?.status === 'playing');
  b.close(); // b internetdan uzildi, hech narsa o'ynamaydi
  await until(() => a.last.players.find((p) => p.userId === 'dev:b' && !p.connected));
  // o'yin to'xtab qolmasligi kerak: a ning o'zi va b uchun avtomatik yurishlar bilan tugaydi
  await until(() => a.last?.status === 'over', 30000);
  await t.close();
});

test('qayta ulanishda xona holati qaytariladi', async () => {
  const t = await boot();
  const a = await t.client('a');
  const b = await t.client('b');
  const { code } = await t.emit(a, 'room:create');
  await t.emit(b, 'room:join', { code });
  b.close();
  await until(() => a.last.players.find((p) => p.userId === 'dev:b' && !p.connected));
  const b2 = await t.client('b');
  assert.equal(b2.hello.code, code);
  await until(() => b2.last?.code === code);
  await until(() => a.last.players.every((p) => p.connected));
  await t.close();
});
