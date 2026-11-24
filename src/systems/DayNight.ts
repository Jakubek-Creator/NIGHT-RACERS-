/**
 * Time-of-day cycle. A full 24h day lasts DAY_SECONDS of real time.
 * Provides a multiply tint for the world and a 0..1 "night" factor that drives lights.
 */
const DAY_SECONDS = 12 * 60;

// hour, tint (multiply colour), night factor
const KEYS: [number, number, number][] = [
  [0, 0x3a4670, 1],
  [4.5, 0x3a4670, 1],
  [5.8, 0x9a7c9a, 0.6],
  [6.8, 0xffcfa8, 0.15],
  [8, 0xffffff, 0],
  [16.5, 0xffffff, 0],
  [18, 0xffc890, 0.1],
  [19.2, 0xd88a78, 0.45],
  [20.2, 0x6a5a88, 0.85],
  [21, 0x3a4670, 1],
  [24, 0x3a4670, 1],
];

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class DayNight {
  hour: number;
  tint = 0xffffff;
  night = 0;
  paused = false;

  constructor(startHour = 15) {
    this.hour = startHour;
    this.update(0);
  }

  update(dt: number) {
    if (!this.paused) this.hour = (this.hour + (dt * 24) / DAY_SECONDS) % 24;
    for (let i = 0; i < KEYS.length - 1; i++) {
      const [h0, c0, n0] = KEYS[i];
      const [h1, c1, n1] = KEYS[i + 1];
      if (this.hour >= h0 && this.hour < h1) {
        const t = (this.hour - h0) / (h1 - h0);
        this.tint = mix(c0, c1, t);
        this.night = n0 + (n1 - n0) * t;
        return;
      }
    }
  }

  get clock(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
  }

  get phase(): string {
    const h = this.hour;
    if (h >= 5 && h < 7.5) return 'DAWN';
    if (h >= 7.5 && h < 17) return 'DAY';
    if (h >= 17 && h < 20) return 'SUNSET';
    return 'NIGHT';
  }
}
