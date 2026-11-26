import './styles.css';
import { tg, connect, emit, loadConfig, inviteLink, shareInvite, haptic } from './net.js';
import { createDie } from './dice.js';
import { buildBoard, Tokens, rotationFor, cornerOf, sleep, el } from './board.js';
import { COLORS, SEAT_ORDER } from '../../shared/rules.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const COLOR_NAME = { red: 'Qizil', green: 'Yashil', yellow: 'Sariq', blue: 'Ko\'k' };

const S = {
  socket: null, me: null, cfg: {}, room: null, G: null, screen: null,
  skew: 0, queue: [], pumping: false, online: false, authError: false, backHandler: null
};

// ---------- yordamchilar ----------
let toastTimer;
function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function setBack(handler) {
  if (!tg?.BackButton) return;
  if (S.backHandler) tg.BackButton.offClick(S.backHandler);
  S.backHandler = handler;
  if (handler) { tg.BackButton.onClick(handler); tg.BackButton.show(); } else tg.BackButton.hide();
}

function confirmDialog(msg) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) tg.showConfirm(msg, (ok) => resolve(!!ok));
    else resolve(window.confirm(msg));
  });
}

function screen(name, cls) {
  S.screen = name;
  const s = el('div', `screen ${cls || name}`);
  app.replaceChildren(s);
  return s;
}

const SVG = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f2b632" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  bot: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#3a2600" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9.5 16.5h5"/></svg>',
  friends: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.6"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.2c3 0 5.5 1.7 5.5 4.8"/></svg>',
  globe: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  copy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  send: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3 11l6 2.5L11.5 20 14 14l7-10z"/></svg>',
  pointer: '<svg width="36" height="36" viewBox="0 0 24 24" fill="#fff" stroke="#0a2a5e" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 7-6 2-2 6z"/></svg>'
};

function pin(color, size = 24) {
  const p = el('span', `pinicon c-${color}`);
  p.style.setProperty('--pw', size + 'px');
  return p;
}

function myColor(room = S.room) {
  return room?.players.find((p) => p.userId === S.me?.id)?.color;
}

// ---------- bosh menyu ----------
function showHome() {
  S.G = null;
  setBack(null);
  const s = screen('home');
  const name = S.me?.name || '…';
  s.innerHTML = `
    <div class="top">
      <div class="avatar"></div>
      <div class="who"><b></b><span>Telegram orqali o'ynash</span></div>
      <div class="conn"></div>
    </div>
    <div class="logo">
      <div class="pins"></div>
      <h1 aria-label="Ludo"><span style="color:#d62a32">L</span><span style="color:#16a02a">U</span><span style="color:#e6c000">D</span><span style="color:#2a86d6">O</span></h1>
      <p>Do'stlar bilan Telegramda o'ynang</p>
    </div>
    <div class="menu">
      <button class="btn gold" data-a="bots">${SVG.bot}<span>Bot bilan o'ynash<small>Tezkor o'yin, kutish shart emas</small></span></button>
      <button class="btn green" data-a="friends">${SVG.friends}<span>Do'stlar bilan<small>Xona yarating va havolani yuboring</small></span></button>
      <button class="btn blue" data-a="online">${SVG.globe}<span>Onlayn o'ynash<small>Tasodifiy raqib bilan</small></span></button>
      <form class="codeform" autocomplete="off">
        <input name="code" maxlength="6" placeholder="XONA KODI" aria-label="Xona kodi" autocapitalize="characters">
        <button type="submit">Kirish</button>
      </form>
    </div>`;
  s.querySelector('.who b').textContent = name;
  const av = s.querySelector('.avatar');
  if (S.me?.photo) { const im = el('img'); im.src = S.me.photo; im.alt = ''; av.append(im); } else av.textContent = name.trim()[0]?.toUpperCase() || '?';
  for (const c of ['red', 'green', 'yellow', 'blue']) s.querySelector('.pins').append(pin(c, 22));
  renderConn();

  s.querySelector('[data-a=bots]').onclick = async () => {
    const r = await emit(S.socket, 'game:vsBots', { bots: 1 });
    if (!r.ok) toast(errText(r.error));
  };
  s.querySelector('[data-a=friends]').onclick = async () => {
    const r = await emit(S.socket, 'room:create');
    if (!r.ok) toast(errText(r.error));
  };
  s.querySelector('[data-a=online]').onclick = startMatchmaking;
  s.querySelector('.codeform').onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').toString().trim().toUpperCase();
    if (code.length !== 6) return toast('Kod 6 ta belgidan iborat');
    const r = await emit(S.socket, 'room:join', { code });
    if (!r.ok) toast(errText(r.error));
  };
}

function renderConn() {
  const b = document.getElementById('banner');
  b.textContent = S.authError ? 'Kirish xatosi: Telegram orqali oching' : 'Aloqa uzildi, qayta ulanmoqda…';
  b.classList.toggle('show', !S.online && !!S.socket && (S.authError || S.screen !== 'home' || !!S.room));
  const c = document.querySelector('.conn');
  if (!c) return;
  c.textContent = S.authError ? 'Kirish xatosi' : S.online ? 'Onlayn' : 'Ulanmoqda…';
  c.classList.toggle('off', !S.online);
}

function errText(code) {
  return ({
    room_not_found: 'Bunday xona topilmadi',
    already_started: 'O\'yin allaqachon boshlangan',
    room_full: 'Xona to\'lgan',
    need_players: 'Kamida 2 ta o\'yinchi kerak',
    not_host: 'Faqat xona egasi bajara oladi',
    offline: 'Internet yo\'q, qayta ulanmoqda…',
    timeout: 'Server javob bermadi',
    rate_limited: 'Juda tez, sekinroq',
    not_your_turn: 'Hozir sizning navbatingiz emas',
    illegal_move: 'Bu yurish mumkin emas'
  })[code] || 'Xatolik yuz berdi';
}

async function startMatchmaking() {
  const r = await emit(S.socket, 'match:find');
  if (!r.ok) return toast(errText(r.error));
  if (r.matched) return;
  const ov = el('div', 'overlay');
  ov.innerHTML = '<div class="modal" role="dialog" aria-label="Raqib qidirilmoqda"><div class="spinner"></div><h2>Raqib qidirilmoqda</h2><p>Topilmasa, bot qo\'shiladi</p><button class="btn gold center" style="min-height:52px">Bekor qilish</button></div>';
  document.body.append(ov);
  S.matchOverlay = ov;
  ov.querySelector('button').onclick = async () => { await emit(S.socket, 'match:cancel'); closeMatch(); };
}
function closeMatch() { S.matchOverlay?.remove(); S.matchOverlay = null; }

// ---------- xona (kutish) ----------
function showLobby(r) {
  S.G = null;
  closeMatch();
  setBack(leaveRoom);
  const isHost = r.hostId === S.me.id;
  const s = screen('lobby');
  s.innerHTML = `
    <div class="head"><button class="iconbtn" aria-label="Orqaga">${SVG.back}</button><h1>O'yin xonasi</h1></div>
    <div class="codebox"><div class="lbl">Xona kodi (bosib nusxalang)</div><button class="code" aria-label="Xona kodini nusxalash"><span></span>${SVG.copy}</button><div class="sub">Do'stlaringiz havola yoki kod orqali qo'shiladi</div></div>
    <div class="seats"><div class="cap"><span>O'yinchilar</span><span class="cnt"></span></div></div>
    <div class="actions"></div>`;
  s.querySelector('.iconbtn').onclick = leaveRoom;
  const codeEl = s.querySelector('.code');
  codeEl.querySelector('span').textContent = r.code;
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.code); toast('Kod nusxalandi'); } catch { toast(r.code); }
  };
  codeEl.onclick = copy;
  s.querySelector('.cnt').textContent = `${r.players.length} / 4`;

  const seats = s.querySelector('.seats');
  const byColor = Object.fromEntries(r.players.map((p) => [p.color, p]));
  for (const color of SEAT_ORDER) {
    const p = byColor[color];
    const row = el('div', `seat c-${color}` + (p ? '' : ' empty'));
    const chip = el('div', 'chip');
    chip.append(pin(color, 20));
    if (!p) chip.style.opacity = '.55';
    const nm = el('div', 'nm');
    if (p) {
      const b = el('b'); b.textContent = p.userId === S.me.id ? p.name + ' (siz)' : p.name;
      const sp = el('span'); sp.textContent = p.userId === r.hostId ? 'Xona egasi' : p.isBot ? 'Bot' : COLOR_NAME[color];
      nm.append(b, sp);
    } else {
      const b = el('b'); b.textContent = 'Kutilmoqda…'; b.style.fontWeight = '500'; nm.append(b);
    }
    row.append(chip, nm);
    if (p) {
      if (p.isBot && isHost) {
        const x = el('button', 'mini'); x.textContent = 'Olib tashlash';
        x.onclick = () => emit(S.socket, 'room:removeBot', { botId: p.userId });
        row.append(x);
      } else {
        const t = el('span', 'tag' + (p.connected ? '' : ' off')); t.textContent = p.connected ? 'Tayyor' : 'Offlayn'; row.append(t);
      }
    } else if (isHost) {
      const b = el('button', 'mini'); b.textContent = '+ Bot';
      b.onclick = async () => { const x = await emit(S.socket, 'room:addBot'); if (!x.ok) toast(errText(x.error)); };
      row.append(b);
    }
    seats.append(row);
  }

  const act = s.querySelector('.actions');
  const inv = el('button', 'btn blue center');
  inv.innerHTML = SVG.send + '<span>Telegramda taklif qilish</span>';
  inv.onclick = async () => {
    const res = await shareInvite(inviteLink(S.cfg, r.code));
    if (res === 'copied') toast('Havola nusxalandi');
  };
  act.append(inv);
  if (isHost) {
    const go = el('button', 'btn gold center');
    go.textContent = 'O\'yinni boshlash';
    go.disabled = r.players.length < 2;
    go.onclick = async () => { const x = await emit(S.socket, 'room:start'); if (!x.ok) toast(errText(x.error)); };
    act.append(go);
    if (r.players.length < 2) { const h = el('div'); h.style.cssText = 'text-align:center;font-size:14px;opacity:.85'; h.textContent = 'Boshlash uchun kamida 2 ta o\'yinchi (yoki bot) kerak'; act.append(h); }
  } else {
    const w = el('div'); w.style.cssText = 'text-align:center;font-size:17px;opacity:.9;padding:12px'; w.textContent = 'Xona egasi o\'yinni boshlashini kuting…'; act.append(w);
  }
}

async function leaveRoom() {
  const playing = S.room?.status === 'playing';
  if (playing && !(await confirmDialog('O\'yindan chiqsangizmi? Sizning o\'rningizga bot o\'ynaydi.'))) return;
  await emit(S.socket, 'room:leave');
  S.room = null; S.queue.length = 0;
  document.querySelector('.overlay.result')?.remove();
  showHome();
}

// ---------- o'yin ----------
function startGame(r) {
  closeMatch();
  document.querySelector('.overlay.result')?.remove();
  setBack(leaveRoom);
  const mine = myColor(r) || 'blue';
  const k = rotationFor(mine);
  const s = screen('game', 'game');
  s.innerHTML = `
    <div class="bar"><button class="iconbtn" aria-label="Orqaga">${SVG.back}</button><span class="codechip">Xona <b></b></span><span class="spacer"></span></div>
    <div class="stage">
      <div class="slot tl"></div><div class="slot tr"></div>
      <div class="boardwrap"></div>
      <div class="slot bl"></div><div class="slot br"></div>
      <div class="status" role="status" aria-live="polite"><i class="dot"></i><span class="txt"></span></div>
    </div>`;
  s.querySelector('.codechip b').textContent = r.code;
  s.querySelector('.iconbtn').onclick = leaveRoom;

  const wrap = s.querySelector('.boardwrap');
  const { layer } = buildBoard(wrap, { rotation: k, players: r.players });
  const G = { code: r.code, mine, k, dice: {}, panels: {}, busy: false, lastTurnKey: '' };
  G.tokens = new Tokens(layer, k, (color, i) => pick(color, i));
  G.status = s.querySelector('.status');

  const corners = ['tl', 'tr', 'br', 'bl'];
  for (const p of r.players) {
    const slot = s.querySelector(`.slot.${corners[cornerOf(p.color, k)]}`);
    const isMe = p.userId === S.me.id;
    const panel = el('div', `panel c-${p.color}` + (isMe ? ' me' : ''));
    const nm = el('div', 'pname'); nm.textContent = isMe ? 'Siz' : p.name;
    const box = el('div', 'pbox');
    const chip = el('div', 'chip'); chip.append(pin(p.color, 18));
    const die = createDie();
    let holder;
    if (isMe) {
      holder = el('button', 'dicebtn'); holder.setAttribute('aria-label', 'Zarni tashlash');
      holder.onclick = roll;
    } else holder = el('div', 'dieslot');
    holder.append(die.el);
    box.append(chip, holder);
    const tm = el('div', 'ptimer'); tm.append(el('i'));
    panel.append(nm, box, tm);
    slot.append(panel);
    G.dice[p.color] = die;
    G.panels[p.color] = { panel, holder, nm, timer: tm.firstChild, player: p };
  }
  S.G = G;
  syncGame(r, true);
}

async function roll() {
  const r = await emit(S.socket, 'game:roll');
  if (!r.ok && !['wrong_phase', 'not_playing', 'not_your_turn'].includes(r.error)) toast(errText(r.error));
}
async function pick(color, i) {
  if (!S.G || color !== S.G.mine) return;
  S.G.tokens.setCan(color, []);
  const r = await emit(S.socket, 'game:move', { token: i });
  if (!r.ok) { toast(errText(r.error)); syncGame(S.room); }
}

function nameOf(r, color) {
  const p = r.players.find((x) => x.color === color);
  return !p ? COLOR_NAME[color] : p.userId === S.me.id ? 'Siz' : p.name;
}

/** Holatni ekranga to'liq moslash (animatsiyadan keyin yoki dastlab) */
function syncGame(r, instant = false) {
  const G = S.G; if (!G) return;
  const st = r.state;
  G.tokens.setAll(st.tokens);
  const myTurn = r.status === 'playing' && st.turn === G.mine;
  G.tokens.setCan(G.mine, myTurn && st.phase === 'move' ? st.movable : []);
  G.tokens.layout();

  const skew = S.skew;
  for (const [color, ui] of Object.entries(G.panels)) {
    const p = r.players.find((x) => x.color === color);
    const active = r.status === 'playing' && st.turn === color;
    ui.panel.classList.toggle('active', active);
    ui.panel.classList.toggle('left', !!p && !p.connected && !p.isBot);
    const base = p.userId === S.me.id ? 'Siz' : p.name;
    ui.nm.textContent = !p.connected && !p.isBot ? base + ' (offlayn)' : base;
    if (instant && color in G.dice) G.dice[color].set(st.dice && st.turn === color ? st.dice : 1);
    // taymer
    ui.timer.style.transition = 'none';
    if (active && r.deadline) {
      const total = Math.max(1, r.deadline - (r.now));
      const left = Math.max(0, r.deadline - (Date.now() + skew));
      ui.timer.style.width = Math.min(100, (left / Math.max(total, left)) * 100) + '%';
      void ui.timer.offsetWidth;
      ui.timer.style.transition = `width ${left}ms linear`;
      ui.timer.style.width = '0%';
    } else ui.timer.style.width = '100%';
  }
  // zar tugmasi
  const mineUi = G.panels[G.mine];
  if (mineUi) {
    const can = myTurn && st.phase === 'roll';
    mineUi.holder.disabled = !can;
    mineUi.holder.classList.toggle('pulse', can);
  }
  // holat satri
  const who = nameOf(r, st.turn);
  const turnP = r.players.find((x) => x.color === st.turn);
  const txt = G.status.querySelector('.txt');
  G.status.className = 'status c-' + st.turn + (myTurn ? ' mine' : '');
  G.status.querySelector('.svg')?.remove();
  G.status.querySelector('svg')?.remove();
  if (r.status === 'over') { G.status.className = 'status'; txt.textContent = 'O\'yin tugadi'; }
  else if (myTurn && st.phase === 'roll') { txt.textContent = 'Sizning navbatingiz: zarni tashlang'; G.status.insertAdjacentHTML('afterbegin', SVG.pointer); }
  else if (myTurn) txt.textContent = `${st.dice} tushdi: yonib turgan tokenni tanlang`;
  else if (turnP && !turnP.connected && !turnP.isBot) txt.textContent = `${who} offlayn, bot o'ynayapti`;
  else txt.textContent = `${who} yuryapti…`;
  // yurish nishonlari
  const dest = [];
  if (myTurn && st.phase === 'move') {
    for (const i of st.movable) { const from = st.tokens[G.mine][i]; dest.push(from === -1 ? 0 : from + st.dice); }
  }
  G.tokens.setDest(G.mine, dest);
  if (myTurn && G.lastTurnKey !== st.seq + ':' + st.phase) haptic.impact('light');
  G.lastTurnKey = st.seq + ':' + st.phase;
}

async function playEvent(r, ev) {
  const G = S.G; if (!G) return;
  G.tokens.setCan(G.mine, []);
  if (ev.type === 'roll') {
    G.dice[ev.color]?.roll(ev.value);
    if (ev.color === G.mine) haptic.impact('medium');
    await sleep(560);
    if (ev.forfeited) toast(`${nameOf(r, ev.color)}: 3 ta 6 — navbat o'tdi`);
    else if (ev.noMoves) toast(`${nameOf(r, ev.color)}: yurish yo'q`, 1200);
  } else if (ev.type === 'move') {
    await G.tokens.step(ev.color, ev.token, ev.from, ev.to);
    if (ev.captured?.length) {
      haptic.notify(ev.color === G.mine ? 'success' : 'warning');
      toast(`${nameOf(r, ev.color)} ${nameOf(r, ev.captured[0].color)} tokenini urdi`);
      await G.tokens.sendHome(ev.captured);
    } else if (ev.reachedHome) {
      haptic.notify('success');
      toast(`${nameOf(r, ev.color)} tokenni uyga olib kirdi`);
      await sleep(250);
    } else await sleep(120);
  }
}

function showResult(r) {
  if (document.querySelector('.overlay.result')) return;
  haptic.notify(r.state.winners[0] === S.G?.mine ? 'success' : 'warning');
  const ov = el('div', 'overlay result');
  const m = el('div', 'modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Natija');
  const win = r.state.winners[0];
  const h = el('h2'); h.textContent = win === S.G?.mine ? 'Siz yutdingiz!' : `${nameOf(r, win)} yutdi`;
  m.append(h);
  r.state.winners.forEach((c, i) => {
    const row = el('div', `rank c-${c}`);
    const n = el('b'); n.textContent = i + 1;
    const nm = el('span', 'nm'); nm.textContent = nameOf(r, c);
    row.append(n, pin(c, 18), nm);
    m.append(row);
  });
  const host = r.hostId === S.me.id;
  if (host) {
    const again = el('button', 'btn gold center'); again.textContent = 'Qayta o\'ynash'; again.style.minHeight = '54px';
    again.onclick = async () => { const x = await emit(S.socket, 'room:rematch'); if (!x.ok) toast(errText(x.error)); };
    m.append(again);
  } else {
    const w = el('p'); w.textContent = 'Xona egasi qayta boshlashi mumkin'; m.append(w);
  }
  const menu = el('button', 'link'); menu.textContent = 'Menyuga qaytish';
  menu.onclick = leaveRoom;
  m.append(menu);
  ov.append(m);
  document.body.append(ov);
}

// ---------- yangilanishlarni navbat bilan qayta ishlash ----------
function enqueue(r) {
  S.queue.push(r);
  if (!S.pumping && S.me) pump();
}

async function pump() {
  S.pumping = true;
  try {
    while (S.queue.length) {
      // navbat uzayib ketsa, oraliq animatsiyalarni o'tkazib yuboramiz
      const r = S.queue.shift();
      const skip = S.queue.length > 6;
      await handleUpdate(r, skip);
    }
  } catch (e) { console.error(e); }
  S.pumping = false;
}

async function handleUpdate(r, skip) {
  S.room = r;
  S.skew = r.now - Date.now();
  if (r.status === 'lobby') { if (S.screen !== 'lobby' || true) showLobby(r); return; }
  const fresh = !S.G || S.G.code !== r.code || r.event?.type === 'start';
  if (fresh) {
    startGame(r);
    if (r.status === 'over') showResult(r);
    return;
  }
  if (r.event && !skip) await playEvent(r, r.event);
  if (S.queue.length === 0 || skip) syncGame(r);
  if (r.status === 'over' && S.queue.length === 0) { syncGame(r); showResult(r); }
}

// ---------- boshlash ----------
async function boot() {
  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();
  tg?.setHeaderColor?.('#0a2a5e');
  tg?.setBackgroundColor?.('#0a2a5e');

  S.cfg = await loadConfig();
  showHome();
  const socket = connect();
  S.socket = socket;

  socket.on('connect', () => { S.online = true; S.authError = false; renderConn(); });
  socket.on('disconnect', () => { S.online = false; renderConn(); });
  socket.on('connect_error', (e) => { S.online = false; S.authError = /unauthorized/.test(e.message); renderConn(); });
  socket.on('room:update', enqueue);
  socket.on('hello', async (h) => {
    S.me = h.user;
    if (S.screen === 'home') showHome();
    if (S.queue.length && !S.pumping) pump();
    if (h.code) return; // room:update kelib, holatni tiklaydi
    const q = new URLSearchParams(location.search);
    const code = (h.startParam || tg?.initDataUnsafe?.start_param || q.get('room') || '').toUpperCase();
    if (/^[A-Z2-9]{6}$/.test(code) && !S.room) {
      const r = await emit(socket, 'room:join', { code });
      if (!r.ok) toast(errText(r.error));
      history.replaceState(null, '', location.pathname);
    }
  });
}

boot();
