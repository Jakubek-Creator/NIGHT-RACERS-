import { clamp } from '../core/math';

interface Drop {
  x: number;
  y: number;
  l: number;
  v: number;
}

const STATES = [
  { name: 'CLEAR', rain: 0 },
  { name: 'DRIZZLE', rain: 0.3 },
  { name: 'RAIN', rain: 0.65 },
  { name: 'STORM', rain: 1 },
];

/** Dynamic weather: rain intensity drifts between states, roads get wet and dry slowly. */
export class Weather {
  rain = 0;
  wetness = 0;
  private target = 0;
  private timer = 40;
  private drops: Drop[] = [];
  private ctx: CanvasRenderingContext2D;
  private flash = document.getElementById('flash')!;
  private lastCam = { x: 0, y: 0 };
  onThunder?: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get label(): string {
    let best = STATES[0];
    for (const s of STATES) if (Math.abs(s.rain - this.rain) < Math.abs(best.rain - this.rain)) best = s;
    return best.name;
  }

  private resize() {
    this.canvas.width = Math.floor(window.innerWidth * Math.min(2, devicePixelRatio));
    this.canvas.height = Math.floor(window.innerHeight * Math.min(2, devicePixelRatio));
  }

  update(dt: number, camX: number, camY: number, zoom: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 45 + Math.random() * 50;
      this.target = STATES[Math.floor(Math.random() * STATES.length)].rain;
    }
    this.rain += clamp(this.target - this.rain, -0.03 * dt, 0.03 * dt);
    if (this.rain > 0.15) this.wetness = Math.min(1, this.wetness + this.rain * 0.06 * dt);
    else this.wetness = Math.max(0, this.wetness - 0.012 * dt);

    if (this.rain > 0.85 && Math.random() < dt * 0.06) this.thunder();

    // rain streaks in screen space with a little camera parallax
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    const want = Math.floor(this.rain * 320);
    while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, v: 900 + Math.random() * 600 });
    if (this.drops.length > want) this.drops.length = want;
    const dpr = W / window.innerWidth;
    const dx = (camX - this.lastCam.x) * zoom * dpr;
    const dy = (camY - this.lastCam.y) * zoom * dpr;
    this.lastCam = { x: camX, y: camY };
    g.strokeStyle = 'rgba(170,195,255,0.33)';
    g.lineWidth = Math.max(1, dpr * 0.8);
    g.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt * dpr - dy * 0.6;
      d.x += -d.v * 0.18 * dt * dpr - dx * 0.6;
      if (d.y > H) {
        d.y -= H + 30;
        d.x = Math.random() * W;
      }
      if (d.y < -40) d.y += H;
      if (d.x < -20) d.x += W + 20;
      if (d.x > W + 20) d.x -= W + 20;
      g.moveTo(d.x, d.y);
      g.lineTo(d.x + d.l * 0.18 * dpr, d.y - d.l * dpr);
    }
    g.stroke();
    // splashes
    g.fillStyle = 'rgba(190,210,255,0.35)';
    for (let i = 0; i < this.rain * 30; i++) g.fillRect(Math.random() * W, Math.random() * H, 2 * dpr, 1 * dpr);
  }

  private thunder() {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '0.55';
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity 0.6s';
      this.flash.style.opacity = '0';
    });
    this.onThunder?.();
  }
}
