/** Small deterministic PRNG so the city is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const tileRng = (x: number, y: number, salt = 0) =>
  mulberry32((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0);
