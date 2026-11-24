// Oddiy, lekin mantiqli bot: urish > uyga kirish > yo'lga chiqish > xavfsiz katak > oldinga yurish.
import { SAFE, YARD, LAST_MAIN, FINISH, trackIndex } from '../../shared/rules.js';

export function chooseMove(state) {
  const color = state.turn;
  const dice = state.dice;
  let best = state.movable[0];
  let bestScore = -Infinity;
  for (const i of state.movable) {
    const from = state.tokens[color][i];
    const to = from === YARD ? 0 : from + dice;
    let score = to; // ilgarilagan token afzal
    if (to === FINISH) score += 80;
    if (from === YARD) score += 50;
    if (to <= LAST_MAIN) {
      const idx = trackIndex(color, to);
      if (SAFE.has(idx)) score += 20;
      else {
        for (const other of state.order) {
          if (other === color) continue;
          for (const p of state.tokens[other]) {
            if (p >= 0 && p <= LAST_MAIN && trackIndex(other, p) === idx) score += 100;
          }
        }
      }
    }
    if (from >= 0 && from <= LAST_MAIN && SAFE.has(trackIndex(color, from))) score -= 5;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
