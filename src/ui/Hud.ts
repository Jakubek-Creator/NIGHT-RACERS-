import { MAP_H, MAP_W, TILE, toKmh } from '../config';
import { drawNova } from '../edu/Nova';
import type { CityMap } from '../world/CityMap';
import { Tile } from '../world/Tiles';

const $ = (id: string) => document.getElementById(id)!;

const MINI_COL: Record<number, string> = {
  [Tile.ROAD]: '#d8d8d4',
  [Tile.SIDEWALK]: '#a8a49a',
  [Tile.BUILDING]: '#6c6a66',
  [Tile.GRASS]: '#7aa85a',
  [Tile.SAND]: '#e6d49c',
  [Tile.WATER]: '#4a8cc0',
  [Tile.GRAVEL]: '#a8a092',
  [Tile.MUD]: '#8a6a48',
  [Tile.PARKING]: '#c4c4c0',
  [Tile.PLAZA]: '#d8b878',
  [Tile.ALLEY]: '#b8b8b4',
  [Tile.BOARDWALK]: '#b08a60',
};

export interface Marker {
  x: number;
  y: number;
  color: string;
  kind: 'dot' | 'ring' | 'flag' | 'wrench';
}

export interface HudFrame {
  speed: number;
  maxSpeed: number;
  throttle: number;
  damage: number;
  money: number;
  streetRep: number;
  weather: string;
  player: { x: number; y: number; angle: number };
  markers: Marker[];
  route?: { x: number; y: number }[];
  race?: { pos: number; total: number; lap: number; laps: number; time: number; cpAngle: number | null };
  fps?: number;
  night?: number;
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

/** DOM HUD: money/rep chips, mini-map, speedometer, race panel, toasts and Nova messages. */
export class Hud {
  private mini = $('minimap') as HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private speedo = $('speedo') as HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private toastTimer = 0;
  private novaTimer = 0;
  private last = 0;

  constructor(map: CityMap) {
    const dpr = Math.min(2, devicePixelRatio);
    this.mini.width = 150 * dpr;
    this.mini.height = 150 * dpr;
    this.mctx = this.mini.getContext('2d')!;
    this.speedo.width = 170 * dpr;
    this.speedo.height = 100 * dpr;
    this.sctx = this.speedo.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = MAP_W;
    this.base.height = MAP_H;
    const g = this.base.getContext('2d')!;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        g.fillStyle = MINI_COL[map.get(x, y)] ?? '#000';
        g.fillRect(x, y, 1, 1);
      }
    drawNova($('novaFace') as HTMLCanvasElement);
  }

  toast(text: string, ms = 2200) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    this.toastTimer = ms / 1000;
  }

  nova(text: string, ms = 5000) {
    $('novaText').textContent = text;
    $('nova').classList.remove('hidden');
    this.novaTimer = ms / 1000;
  }

  countdown(text: string | null) {
    const el = $('countdown');
    if (text === null) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  update(dt: number, f: HudFrame) {
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) $('toast').classList.add('hidden');
    if (this.novaTimer > 0 && (this.novaTimer -= dt) <= 0) $('nova').classList.add('hidden');
    this.last += dt;
    if (this.last < 1 / 20) return; // 20 Hz HUD refresh is plenty
    this.last = 0;

    $('money').textContent = `$${f.money.toLocaleString()}`;
    $('rep').textContent = `STREET REP ${f.streetRep}`;
    $('weather').textContent = f.weather;
    const fps = $('fps');
    fps.classList.toggle('hidden', f.fps === undefined);
    if (f.fps !== undefined) fps.textContent = `${f.fps.toFixed(0)} FPS`;

    const ri = $('raceInfo');
    const arrow = $('cpArrow');
    if (f.race) {
      ri.classList.remove('hidden');
      $('rPos').textContent = `${f.race.pos}/${f.race.total}`;
      $('rLap').textContent = `${Math.min(f.race.lap + 1, f.race.laps)}/${f.race.laps}`;
      $('rTime').textContent = fmtTime(f.race.time);
      if (f.race.cpAngle !== null) {
        arrow.classList.remove('hidden');
        arrow.style.transform = `translateX(-50%) rotate(${f.race.cpAngle + Math.PI / 2}rad)`;
      } else arrow.classList.add('hidden');
    } else {
      ri.classList.add('hidden');
      arrow.classList.add('hidden');
    }

    this.drawSpeedo(f);
    this.drawMini(f);
  }

  private drawSpeedo(f: HudFrame) {
    const g = this.sctx;
    const W = this.speedo.width;
    const H = this.speedo.height;
    const k = W / 170;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.92;
    const r = 70 * k;
    const a0 = Math.PI;
    const frac = Math.min(1, Math.abs(f.speed) / (f.maxSpeed * 1.05));
    g.lineCap = 'butt';
    g.lineWidth = 9 * k;
    g.strokeStyle = 'rgba(20,22,28,0.7)';
    g.beginPath();
    g.arc(cx, cy, r, a0, 0);
    g.stroke();
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      if (t > frac) break;
      g.strokeStyle = t > 0.8 ? '#e03a2e' : t > 0.55 ? '#f0b429' : '#f2f2f2';
      g.beginPath();
      g.arc(cx, cy, r, a0 + t * Math.PI, a0 + (t + 1 / segs - 0.012) * Math.PI);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = `italic 800 ${34 * k}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 4 * k;
    g.fillText(String(toKmh(f.speed)), cx, cy - 18 * k);
    g.font = `bold ${11 * k}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
    g.fillStyle = '#c8ccd4';
    g.fillText('KM/H', cx, cy - 4 * k);
    g.shadowBlur = 0;
    // damage bar
    const dw = 60 * k;
    g.fillStyle = 'rgba(20,22,28,0.8)';
    g.fillRect(cx - dw / 2, cy + 2 * k, dw, 4 * k);
    g.fillStyle = f.damage > 66 ? '#ff3b3b' : f.damage > 33 ? '#ffb02b' : '#7dff5a';
    g.fillRect(cx - dw / 2, cy + 2 * k, dw * (1 - f.damage / 100), 4 * k);
  }

  private drawMini(f: HudFrame) {
    const g = this.mctx;
    const W = this.mini.width;
    const span = 52; // tiles shown across
    const scale = W / span;
    const ptx = f.player.x / TILE;
    const pty = f.player.y / TILE;
    const sx = ptx - span / 2;
    const sy = pty - span / 2;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#4a8cc0';
    g.fillRect(0, 0, W, W);
    g.drawImage(this.base, sx, sy, span, span, 0, 0, W, W);
    if (f.night) {
      g.fillStyle = `rgba(20,30,60,${f.night * 0.45})`;
      g.fillRect(0, 0, W, W);
    }
    const toS = (x: number, y: number) => [(x / TILE - sx) * scale, (y / TILE - sy) * scale] as const;

    if (f.route && f.route.length > 1) {
      g.strokeStyle = 'rgba(224,90,30,0.85)';
      g.lineWidth = 2.5 * (W / 150);
      g.beginPath();
      f.route.forEach((p, i) => {
        const [x, y] = toS(p.x, p.y);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.closePath();
      g.stroke();
    }

    const k = W / 150;
    for (const m of f.markers) {
      let [x, y] = toS(m.x, m.y);
      const inside = x >= 0 && y >= 0 && x <= W && y <= W;
      if (!inside && m.kind === 'dot') continue;
      x = Math.max(6 * k, Math.min(W - 6 * k, x));
      y = Math.max(6 * k, Math.min(W - 6 * k, y));
      g.fillStyle = m.color;
      g.strokeStyle = m.color;
      if (m.kind === 'dot') {
        g.fillRect(x - 1.5 * k, y - 1.5 * k, 3 * k, 3 * k);
      } else if (m.kind === 'ring') {
        g.lineWidth = 2 * k;
        g.beginPath();
        g.arc(x, y, 5 * k, 0, Math.PI * 2);
        g.stroke();
      } else if (m.kind === 'flag') {
        g.fillRect(x - 1 * k, y - 7 * k, 2 * k, 9 * k);
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
            g.fillRect(x + 1 * k + i * 2 * k, y - 7 * k + j * 2 * k, 2 * k, 2 * k);
          }
      } else {
        g.fillStyle = m.color;
        g.fillRect(x - 5 * k, y - 5 * k, 10 * k, 10 * k);
        g.fillStyle = '#ffffff';
        g.font = `bold ${9 * k}px monospace`;
        g.textAlign = 'center';
        g.fillText('G', x, y + 3 * k);
      }
    }

    // player arrow
    const [px, py] = toS(f.player.x, f.player.y);
    g.save();
    g.translate(px, py);
    g.rotate(f.player.angle);
    g.fillStyle = '#e03a2e';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5 * k;
    g.beginPath();
    g.moveTo(7 * k, 0);
    g.lineTo(-5 * k, -5 * k);
    g.lineTo(-2 * k, 0);
    g.lineTo(-5 * k, 5 * k);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
}

