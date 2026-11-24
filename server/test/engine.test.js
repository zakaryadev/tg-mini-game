import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, roll, move, legalMoves, removeColor } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';
import { TRACK, START, FINISH, trackIndex, TRACK_LEN, HOME_COL, SAFE } from '../../shared/rules.js';

test('yo\'l 52 ta noyob katakdan iborat va yopiq', () => {
  assert.equal(TRACK.length, TRACK_LEN);
  assert.equal(new Set(TRACK.map((c) => c.join(','))).size, 52);
  for (let i = 0; i < 52; i++) {
    const [a, b] = TRACK[i], [c, d] = TRACK[(i + 1) % 52];
    // Klassik taxtada 4 ta burchakda diagonal qadam bor (uy burchagi yonida), qolgani to'g'ri chiziq
    const dist = Math.max(Math.abs(a - c), Math.abs(b - d));
    assert.equal(dist, 1, `katak ${i} -> ${(i + 1) % 52} qo'shni emas`);
  }
  let diagonals = 0;
  for (let i = 0; i < 52; i++) {
    const [a, b] = TRACK[i], [c, d] = TRACK[(i + 1) % 52];
    if (a !== c && b !== d) diagonals++;
  }
  assert.equal(diagonals, 4);
});

test('boshlang\'ich kataklar va uy yo\'lagi to\'g\'ri joyda', () => {
  assert.deepEqual(TRACK[START.red], [6, 1]);
  assert.deepEqual(TRACK[START.green], [1, 8]);
  assert.deepEqual(TRACK[START.yellow], [8, 13]);
  assert.deepEqual(TRACK[START.blue], [13, 6]);
  // 50-qadamdan keyin uy yo'lagi qo'shni katakdan boshlanadi
  const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  for (const c of Object.keys(START)) {
    assert.ok(near(TRACK[trackIndex(c, 50)], HOME_COL[c][0]), c);
  }
  assert.equal(SAFE.size, 8);
});

test('6 tushmasa token uydan chiqmaydi, navbat o\'tadi', () => {
  const s = newGame(['blue', 'green']);
  s.turn = 'blue';
  const ev = roll(s, 3);
  assert.equal(ev.noMoves, true);
  assert.equal(s.turn, 'green');
  assert.equal(s.phase, 'roll');
});

test('6 tushsa token chiqadi va yana navbat beriladi', () => {
  const s = newGame(['blue', 'green']);
  s.turn = 'blue';
  roll(s, 6);
  assert.equal(s.phase, 'move');
  assert.deepEqual(s.movable, [0, 1, 2, 3]);
  const ev = move(s, 0);
  assert.equal(s.tokens.blue[0], 0);
  assert.equal(ev.extraTurn, true);
  assert.equal(s.turn, 'blue');
});

test('uchta ketma-ket 6 navbatni yoqotadi', () => {
  const s = newGame(['blue', 'green']);
  s.turn = 'blue';
  roll(s, 6); move(s, 0);
  roll(s, 6); move(s, 0);
  const ev = roll(s, 6);
  assert.equal(ev.forfeited, true);
  assert.equal(s.turn, 'green');
});

test('raqib tokeni urib yuboriladi (xavfsiz bo\'lmagan katakda)', () => {
  const s = newGame(['blue', 'green']);
  // ko'k: boshlanish 39. yashil token 39-idx dan 2 qadam keyin (41) turadi: yashil p = (41-13+52)%52 = 28
  s.tokens.green[0] = 28;
  s.tokens.blue[0] = 0; // idx 39
  s.turn = 'blue';
  roll(s, 2);
  const ev = move(s, 0);
  assert.equal(ev.captured.length, 1);
  assert.equal(s.tokens.green[0], -1);
  assert.equal(ev.extraTurn, true);
});

test('xavfsiz katakda urilmaydi', () => {
  const s = newGame(['blue', 'green']);
  // idx 47 xavfsiz (yulduz). yashil p=34 -> idx 47. ko'k p=8 -> idx 47
  s.tokens.green[0] = 34;
  s.tokens.blue[0] = 5;
  s.turn = 'blue';
  roll(s, 3);
  const ev = move(s, 0);
  assert.equal(ev.captured.length, 0);
  assert.equal(s.tokens.green[0], 34);
});

test('aniq son kerak: 56 dan oshib ketmaydi', () => {
  const s = newGame(['blue', 'green']);
  s.tokens.blue = [54, -1, -1, -1];
  s.turn = 'blue';
  assert.deepEqual(legalMoves(s, 'blue', 3), []);
  assert.deepEqual(legalMoves(s, 'blue', 2), [0]);
});

test('hamma tokenlar uyga kirsa g\'olib e\'lon qilinadi', () => {
  const s = newGame(['blue', 'green']);
  s.tokens.blue = [56, 56, 56, 55];
  s.turn = 'blue';
  roll(s, 1);
  const ev = move(s, 3);
  assert.equal(ev.gameOver, true);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, ['blue', 'green']);
});

test('noto\'g\'ri harakatlar rad etiladi', () => {
  const s = newGame(['blue', 'green']);
  assert.throws(() => move(s, 0));
  s.turn = 'blue';
  roll(s, 6);
  assert.throws(() => move(s, 9));
  assert.throws(() => roll(s, 2));
});

test('o\'yinchi chiqib ketsa navbat va holat to\'g\'ri', () => {
  const s = newGame(['red', 'green', 'blue']);
  s.turn = 'green';
  removeColor(s, 'green');
  assert.deepEqual(s.order, ['red', 'blue']);
  assert.equal(s.turn, 'blue');
  const r = removeColor(s, 'red');
  assert.equal(r.type, 'over');
  assert.equal(s.phase, 'over');
});

test('bot bilan 2/3/4 kishilik o\'yin oxirigacha tugaydi', () => {
  for (const colors of [['blue', 'green'], ['blue', 'green', 'yellow'], ['blue', 'green', 'yellow', 'red']]) {
    for (let g = 0; g < 30; g++) {
      const s = newGame(colors);
      let steps = 0;
      while (s.phase !== 'over' && steps++ < 20000) {
        if (s.phase === 'roll') roll(s, 1 + Math.floor(Math.random() * 6));
        else move(s, chooseMove(s));
      }
      assert.equal(s.phase, 'over', `${colors.length} kishilik o'yin tugamadi`);
      assert.equal(s.winners.length, colors.length);
    }
  }
});
