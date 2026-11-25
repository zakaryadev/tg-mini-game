export function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min;
  const buf = new Uint32Array(1);
  const lim = Math.floor(0x100000000 / range) * range;
  do { crypto.getRandomValues(buf); } while (buf[0] >= lim);
  return min + (buf[0] % range);
}
export const randomUUID = () => crypto.randomUUID();
export default { randomInt, randomUUID };
