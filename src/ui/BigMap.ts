import { MAP_H, MAP_W, TILE } from '../config';
import type { HudFrame } from './Hud';

const $ = (id: string) => document.getElementById(id)!;

export interface Waypoint {
  x: number;
  y: number;
}

/** Labels for places on the big map (world px). */
export interface Place {
  x: number;
  y: number;
  name: string;
}

/**
 * Full-screen city map. Opened from the mini-map or with M; the game pauses while it is open.
 * Tapping the map drops a waypoint (tap it again to remove it).
 */
export class BigMap {
  private root = $('bigmap');
  private canvas = $('bmCanvas') as HTMLCanvasElement;
  private g = this.canvas.getContext('2d')!;
  private frame?: HudFrame;
  isOpen = false;
  waypoint: Waypoint | null = null;
  onClose?: () => void;
  onWaypoint?: (w: Waypoint | null) => void;

  constructor(private base: HTMLCanvasElement, private places: Place[]) {
    $('bmClose').addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close(); // tap outside the map
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MAP_W * TILE;
      const y = ((e.clientY - r.top) / r.height) * MAP_H * TILE;
      const w = this.waypoint;
      this.waypoint = w && Math.hypot(w.x - x, w.y - y) < 4 * TILE ? null : { x, y };
      this.onWaypoint?.(this.waypoint);
      this.draw();
    });
    window.addEventListener('resize', () => this.isOpen && this.draw());
  }

  open(f: HudFrame) {
    this.frame = f;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.draw();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.onClose?.();
  }

  private draw() {
    const f = this.frame;
    if (!f) return;
    const dpr = Math.min(2, devicePixelRatio);
    const head = $('bmHead').offsetHeight + $('bmLegend').offsetHeight + 40;
    const css = Math.max(200, Math.floor(Math.min(innerWidth - 32, innerHeight - head)));
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    this.canvas.width = this.canvas.height = Math.floor(css * dpr);
    const W = this.canvas.width;
    const g = this.g;
    const k = W / 600; // marker scale
    const S = (v: number) => (v / (MAP_W * TILE)) * W;

    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, W, W);
    if (f.night) {
      g.fillStyle = `rgba(20,30,60,${f.night * 0.35})`;
      g.fillRect(0, 0, W, W);
    }

    // race route
    if (f.route && f.route.length > 1) {
      g.strokeStyle = 'rgba(224,90,30,0.9)';
      g.lineWidth = 4 * k;
      g.beginPath();
      f.route.forEach((p, i) => (i ? g.lineTo(S(p.x), S(p.y)) : g.moveTo(S(p.x), S(p.y))));
      g.closePath();
      g.stroke();
    }

    // place names
    g.textAlign = 'center';
    g.font = `800 ${13 * k}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
    for (const p of this.places) {
      const x = S(p.x);
      const y = S(p.y);
      const w = g.measureText(p.name).width + 10 * k;
      g.fillStyle = 'rgba(22,24,29,0.85)';
      g.fillRect(x - w / 2, y - 11 * k, w, 18 * k);
      g.fillStyle = '#f4f4f2';
      g.fillText(p.name, x, y + 3 * k);
    }

    for (const m of f.markers) {
      const x = S(m.x);
      const y = S(m.y);
      g.fillStyle = m.color;
      g.strokeStyle = m.color;
      if (m.kind === 'dot') g.fillRect(x - 2.5 * k, y - 2.5 * k, 5 * k, 5 * k);
      else if (m.kind === 'ring') {
        g.lineWidth = 3 * k;
        g.beginPath();
        g.arc(x, y, 9 * k, 0, Math.PI * 2);
        g.stroke();
      } else if (m.kind === 'flag') {
        g.fillStyle = '#1c1e24';
        g.fillRect(x - 2 * k, y - 24 * k, 3 * k, 26 * k);
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 3; j++) {
            g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
            g.fillRect(x + 1 * k + i * 4 * k, y - 24 * k + j * 4 * k, 4 * k, 4 * k);
          }
      } else if (m.kind === 'wrench') {
        g.fillRect(x - 9 * k, y - 9 * k, 18 * k, 18 * k);
        g.fillStyle = '#fff';
        g.font = `800 ${13 * k}px system-ui, sans-serif`;
        g.fillText('G', x, y + 5 * k);
      }
    }

    // waypoint pin
    if (this.waypoint) {
      const x = S(this.waypoint.x);
      const y = S(this.waypoint.y);
      g.fillStyle = '#e03a2e';
      g.strokeStyle = '#fff';
      g.lineWidth = 2 * k;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 8 * k, y - 16 * k);
      g.arc(x, y - 18 * k, 8 * k, Math.PI * 0.8, Math.PI * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y - 18 * k, 3 * k, 0, Math.PI * 2);
      g.fill();
    }

    // player
    g.save();
    g.translate(S(f.player.x), S(f.player.y));
    g.rotate(f.player.angle);
    g.fillStyle = '#e03a2e';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5 * k;
    g.beginPath();
    g.moveTo(13 * k, 0);
    g.lineTo(-9 * k, -9 * k);
    g.lineTo(-4 * k, 0);
    g.lineTo(-9 * k, 9 * k);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
}
