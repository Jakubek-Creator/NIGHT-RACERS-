export type LightState = 'g' | 'y' | 'r';

const CYCLE = 14;

/** Deterministic signal timing per intersection. axis 0 = east/west traffic, 1 = north/south. */
export function lightState(i: number, j: number, axis: number, time: number): LightState {
  const t = (time + ((i * 5 + j * 3) % CYCLE)) % CYCLE;
  if (axis === 0) return t < 6 ? 'g' : t < 7.2 ? 'y' : 'r';
  return t < 7 ? 'r' : t < 13 ? 'g' : t < 14 ? 'y' : 'r';
}
