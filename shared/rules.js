// Ludo qoidalari uchun umumiy konstantalar va taxta geometriyasi.
// Server (hakam) ham, mijoz (chizish) ham shu faylni ishlatadi.

/** Soat yo'nalishi bo'yicha: TL, TR, BR, BL burchaklari */
export const COLORS = ['red', 'green', 'yellow', 'blue'];
/** Xonaga kirish tartibi bo'yicha o'rin: 2 kishida qarama-qarshi (ko'k va yashil) */
export const SEAT_ORDER = ['blue', 'green', 'yellow', 'red'];
/** Har bir rangning burchagi (soat yo'nalishi bo'yicha: 0=TL, 1=TR, 2=BR, 3=BL) */
export const CORNER = { red: 0, green: 1, yellow: 2, blue: 3 };

export const TRACK_LEN = 52;
/** Har rangning asosiy yo'ldagi boshlang'ich katagi */
export const START = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Xavfsiz kataklar: boshlang'ichlar va ulardan 8 qadam keyingi yulduzchalar */
export const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

/** Token holatlari: -1 uyda, 0..50 asosiy yo'l, 51..55 uy yo'lagi, 56 markaz (tugatdi) */
export const YARD = -1;
export const LAST_MAIN = 50;
export const FINISH = 56;
export const TOKENS_PER_PLAYER = 4;

/** Asosiy yo'l: 52 ta katak [qator, ustun], qizil boshlanishidan soat yo'nalishida */
export const TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0]
];

/** Uy yo'lagi (5 katak), markazga qarab */
export const HOME_COL = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

/** Uy (6x6) joylashuvi: yuqori-chap katak [qator, ustun] */
export const YARD_ORIGIN = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
/** Uy ichidagi 4 ta o'rin (uy burchagiga nisbatan, katak markazi koordinatalarida) */
export const YARD_SLOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];

/** Rangning yo'l indeksi (0..51) — faqat 0..50 holatlar uchun */
export function trackIndex(color, p) {
  return (START[color] + p) % TRACK_LEN;
}

/** Token pozitsiyasini taxta koordinatasiga aylantiradi (katak markazi, 0.5 siljishi bilan) */
export function centerOf(color, p, slot = 0) {
  if (p === YARD) {
    const [r0, c0] = YARD_ORIGIN[color];
    const [sr, sc] = YARD_SLOTS[slot];
    return [r0 + sr, c0 + sc];
  }
  if (p === FINISH) return [7.5, 7.5];
  if (p <= LAST_MAIN) {
    const [r, c] = TRACK[trackIndex(color, p)];
    return [r + 0.5, c + 0.5];
  }
  const [r, c] = HOME_COL[color][p - 51];
  return [r + 0.5, c + 0.5];
}

/** Taxtani 90° soat yo'nalishida k marta aylantirish (markaz koordinatalari uchun) */
export function rotateCenter([r, c], k) {
  let rr = r, cc = c;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const nr = cc;
    const nc = 15 - rr;
    rr = nr; cc = nc;
  }
  return [rr, cc];
}
