// Sof (toza) Ludo dvigateli: tarmoq ham, vaqt ham yo'q. Server hakam sifatida shuni ishlatadi.
import {
  COLORS, SAFE, YARD, LAST_MAIN, FINISH, TOKENS_PER_PLAYER, trackIndex
} from '../../shared/rules.js';

const MAX_SIXES = 3;

/** colors — qatnashayotgan ranglar (tartib avtomatik soat yo'nalishida bo'ladi) */
export function newGame(colors) {
  const order = COLORS.filter((c) => colors.includes(c));
  if (order.length < 2) throw new Error('kamida 2 ta o\'yinchi kerak');
  const tokens = {};
  for (const c of order) tokens[c] = Array(TOKENS_PER_PLAYER).fill(YARD);
  return {
    order,
    tokens,
    turn: order[0],
    phase: 'roll', // roll | move | over
    dice: null,
    sixes: 0,
    movable: [],
    winners: [],
    seq: 0
  };
}

export function legalMoves(state, color, dice) {
  const res = [];
  state.tokens[color].forEach((p, i) => {
    if (p === FINISH) return;
    if (p === YARD) { if (dice === 6) res.push(i); return; }
    if (p + dice <= FINISH) res.push(i);
  });
  return res;
}

function finished(state, color) {
  return state.tokens[color].every((p) => p === FINISH);
}

function nextColor(state, from) {
  const n = state.order.length;
  let i = state.order.indexOf(from);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    const c = state.order[i];
    if (!state.winners.includes(c)) return c;
  }
  return from;
}

function passTurn(state) {
  state.turn = nextColor(state, state.turn);
  state.phase = 'roll';
  state.dice = null;
  state.sixes = 0;
  state.movable = [];
}

/** Zar tashlash. value — 1..6 (serverda kriptografik tasodifiy). */
export function roll(state, value) {
  if (state.phase !== 'roll') throw new Error('hozir zar tashlab bo\'lmaydi');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('noto\'g\'ri zar');
  const color = state.turn;
  state.seq++;
  state.dice = value;
  state.sixes = value === 6 ? state.sixes + 1 : 0;
  const ev = { type: 'roll', color, value };

  if (state.sixes >= MAX_SIXES) {
    ev.forfeited = true;
    passTurn(state);
    ev.next = state.turn;
    return ev;
  }
  state.movable = legalMoves(state, color, value);
  if (state.movable.length === 0) {
    ev.noMoves = true;
    passTurn(state);
    ev.next = state.turn;
    return ev;
  }
  state.phase = 'move';
  return ev;
}

/** Tokenni yurgizish. */
export function move(state, tokenIdx) {
  if (state.phase !== 'move') throw new Error('hozir yurib bo\'lmaydi');
  if (!state.movable.includes(tokenIdx)) throw new Error('bu token yura olmaydi');
  const color = state.turn;
  const dice = state.dice;
  const from = state.tokens[color][tokenIdx];
  const to = from === YARD ? 0 : from + dice;
  state.tokens[color][tokenIdx] = to;
  state.seq++;

  const captured = [];
  if (to >= 0 && to <= LAST_MAIN) {
    const idx = trackIndex(color, to);
    if (!SAFE.has(idx)) {
      for (const other of state.order) {
        if (other === color) continue;
        state.tokens[other].forEach((p, i) => {
          if (p >= 0 && p <= LAST_MAIN && trackIndex(other, p) === idx) {
            state.tokens[other][i] = YARD;
            captured.push({ color: other, token: i, from: p });
          }
        });
      }
    }
  }

  const reachedHome = to === FINISH;
  const ev = { type: 'move', color, token: tokenIdx, from, to, dice, captured, reachedHome };

  if (finished(state, color)) {
    state.winners.push(color);
    ev.finishedAll = true;
  }
  const alive = state.order.filter((c) => !state.winners.includes(c));
  if (alive.length <= 1) {
    for (const c of alive) state.winners.push(c);
    state.phase = 'over';
    state.movable = [];
    state.dice = null;
    ev.gameOver = true;
    return ev;
  }

  const extra = !finished(state, color) && (dice === 6 || captured.length > 0 || reachedHome);
  if (extra) {
    state.phase = 'roll';
    state.movable = [];
    // sixes ketma-ketligi saqlanadi (3 ta oltilik jazosi uchun)
    ev.extraTurn = true;
    ev.next = color;
  } else {
    passTurn(state);
    ev.next = state.turn;
  }
  return ev;
}

/** O'yinchi o'yindan chiqsa: tokenlari olib tashlanadi (yoki bot bo'ladi — rooms hal qiladi) */
export function removeColor(state, color) {
  if (!state.order.includes(color) || state.winners.includes(color)) return null;
  const wasTurn = state.turn === color && state.phase !== 'over';
  state.order = state.order.filter((c) => c !== color);
  delete state.tokens[color];
  state.winners = state.winners.filter((c) => c !== color);
  state.seq++;
  const alive = state.order.filter((c) => !state.winners.includes(c));
  if (alive.length <= 1) {
    for (const c of alive) state.winners.push(c);
    state.phase = 'over';
    state.movable = [];
    state.dice = null;
    return { type: 'over', reason: 'left' };
  }
  if (wasTurn) {
    const idx = COLORS.filter((c) => state.order.includes(c));
    // keyingi rangni topish
    const before = state.order;
    state.turn = before.find((c) => COLORS.indexOf(c) > COLORS.indexOf(color)) || before[0];
    state.phase = 'roll';
    state.dice = null;
    state.sixes = 0;
    state.movable = [];
    void idx;
  }
  return { type: 'left', color };
}
