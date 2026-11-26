import {
  COLORS, CORNER, TRACK, START, SAFE, HOME_COL, YARD_ORIGIN, YARD_SLOTS,
  YARD, FINISH, centerOf, rotateCenter
} from '../../shared/rules.js';

const ARROWS = ['↑', '→', '↓', '←'];

/** Mening rangim pastki-chap burchakda bo'lishi uchun nechta 90° burish kerak */
export function rotationFor(color) {
  return (3 - CORNER[color] + 4) % 4;
}
/** Rang burilgandan keyin qaysi burchakda (0 TL, 1 TR, 2 BR, 3 BL) */
export function cornerOf(color, k) {
  return (CORNER[color] + k) % 4;
}

/** Mantiqiy kataklar jadvali (burilishsiz) */
function logicalCells() {
  const cells = {};
  const set = (r, c, v) => { cells[r + ',' + c] = { ...(cells[r + ',' + c] || {}), ...v }; };
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cr = r < 6 || r > 8, cc = c < 6 || c > 8;
      if ((cr && cc) || (!cr && !cc)) set(r, c, { void: true });
    }
  }
  for (const color of COLORS) {
    HOME_COL[color].forEach(([r, c]) => set(r, c, { color }));
    const [sr, sc] = TRACK[START[color]];
    set(sr, sc, { color });
  }
  TRACK.forEach(([r, c], i) => { if (SAFE.has(i) && ![0, 13, 26, 39].includes(i)) set(r, c, { star: true }); });
  // kirish strelkalari (uy yo'lagi oldidan)
  const arrows = [[0, 7, 2, 'green'], [7, 0, 1, 'red'], [7, 14, 3, 'yellow'], [14, 7, 0, 'blue']];
  for (const [r, c, dir, color] of arrows) set(r, c, { arrow: dir, color });
  return cells;
}

export function buildBoard(container, { rotation, players }) {
  const k = rotation;
  container.innerHTML = '';
  const board = el('div', 'board');
  const grid = el('div', 'grid');
  const cells = logicalCells();
  // burilgan koordinatada joylashtirish
  const placed = new Array(225);
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const info = cells[r + ',' + c] || {};
      const [nr, nc] = rotateCenter([r + 0.5, c + 0.5], k);
      placed[Math.floor(nr) * 15 + Math.floor(nc)] = info;
    }
  }
  for (const info of placed) {
    const d = el('div', 'cell');
    if (info.void) d.classList.add('void');
    else if (info.arrow !== undefined) {
      d.classList.add('ar', 'c-' + info.color);
      d.textContent = ARROWS[(info.arrow + k) % 4];
    } else if (info.color) d.classList.add(info.color);
    else if (info.star) d.textContent = '☆';
    grid.append(d);
  }
  board.append(grid);

  for (const color of COLORS) {
    const [r0, c0] = YARD_ORIGIN[color];
    const [cr, cc] = rotateCenter([r0 + 3, c0 + 3], k);
    const yard = el('div', `yard ${color} c-${color}`);
    const present = players.find((p) => p.color === color);
    if (!present) yard.classList.add('off');
    yard.style.left = ((cc - 3) / 15) * 100 + '%';
    yard.style.top = ((cr - 3) / 15) * 100 + '%';
    const pad = el('div', 'pad');
    for (const [sr, sc] of YARD_SLOTS) {
      const spot = el('i', 'spot');
      spot.style.left = ((sc - 1) / 4 * 100) / 1 + '%'; // 2..4 -> pad ichida 25%..75%
      spot.style.top = ((sr - 1) / 4 * 100) / 1 + '%';
      pad.append(spot);
    }
    yard.append(pad);
    board.append(yard);
  }

  const center = el('div', 'hub');
  center.style.background = `conic-gradient(from ${-45 + k * 90}deg, var(--green-500) 0 25%, var(--yellow-500) 25% 50%, var(--blue-500) 50% 75%, var(--red-500) 75% 100%)`;
  board.append(center);

  const layer = el('div', 'tokens');
  board.append(layer);
  container.append(board);
  return { board, layer };
}

/** Tokenlar qatlami: pozitsiya, yurish animatsiyasi, bosish */
export class Tokens {
  constructor(layer, rotation, onPick) {
    this.layer = layer;
    this.k = rotation;
    this.onPick = onPick;
    this.pos = {};      // color -> [progress...]
    this.els = {};      // 'color:i' -> element
    this.can = new Set();
  }

  ensure(color, i) {
    const key = color + ':' + i;
    if (!this.els[key]) {
      const t = el('div', 'tok c-' + color);
      t.innerHTML = '<span class="bob"><span class="pinicon"></span></span><button class="hit" aria-label="Tokenni yurgizish"></button>';
      t.addEventListener('click', () => { if (t.classList.contains('can')) this.onPick(color, i); });
      this.layer.append(t);
      this.els[key] = t;
    }
    return this.els[key];
  }

  setAll(tokens) {
    this.pos = {};
    for (const [color, arr] of Object.entries(tokens)) this.pos[color] = [...arr];
    this.layout();
  }

  setCan(color, list) {
    this.can = new Set(list.map((i) => color + ':' + i));
    for (const [key, t] of Object.entries(this.els)) t.classList.toggle('can', this.can.has(key));
  }

  layout(slow = false) {
    // bir katakdagi tokenlarni yonma-yon joylashtirish
    const groups = {};
    for (const [color, arr] of Object.entries(this.pos)) {
      arr.forEach((p, i) => {
        const [r, c] = centerOf(color, p, i);
        const key = p === YARD ? `y${color}${i}` : p === FINISH ? 'fin' : r + ',' + c;
        (groups[key] ||= []).push({ color, i, r, c });
      });
    }
    for (const list of Object.values(groups)) {
      list.forEach((t, idx) => {
        const [rr, cc] = rotateCenter([t.r, t.c], this.k);
        const off = (idx - (list.length - 1) / 2) * 0.42;
        const e = this.ensure(t.color, t.i);
        e.classList.toggle('slow', slow);
        e.style.left = ((cc + off) / 15) * 100 + '%';
        e.style.top = (rr / 15) * 100 + '%';
        e.style.zIndex = Math.round(rr * 10) + idx;
      });
    }
    for (const key of Object.keys(this.els)) {
      const [color, i] = key.split(':');
      this.els[key].classList.toggle('can', this.can.has(key));
      if (!this.pos[color]) this.els[key].style.opacity = 0;
    }
  }

  /** Tanlangan token qayerga tushishini ko'rsatuvchi nishonlar */
  setDest(color, list) {
    this.layer.querySelectorAll('.dest').forEach((d) => d.remove());
    for (const p of new Set(list)) {
      const [r, c] = rotateCenter(centerOf(color, p, 0), this.k);
      const d = el('i', 'dest');
      d.style.left = (c / 15) * 100 + '%';
      d.style.top = (r / 15) * 100 + '%';
      this.layer.prepend(d);
    }
  }

  async step(color, i, from, to, stepMs = 130) {
    const set = (p) => { this.pos[color][i] = p; this.layout(); };
    if (from === YARD) { set(0); await sleep(stepMs * 2); return; }
    for (let p = from + 1; p <= to; p++) { set(p); await sleep(stepMs); }
  }

  async sendHome(list) {
    for (const { color, token } of list) this.pos[color][token] = YARD;
    this.layout(true);
    await sleep(450);
    this.layout(false);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function el(tag, cls = '') { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
