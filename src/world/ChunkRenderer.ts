import { BLOCK, CHUNK_PX, CHUNK_TILES, ROAD_W, TILE } from '../config';
import { mulberry32, tileRng } from '../core/rng';
import { makeCanvas, shade } from '../gfx/SpriteFactory';
import type { Building, CityMap, Prop } from './CityMap';
import { Tile } from './Tiles';

type Ctx = CanvasRenderingContext2D;

/** Roof colours: terracotta, slate, gravel, tar, copper, sandstone. */
const ROOFS = ['#9a4e36', '#6a7078', '#8c8a82', '#4c4c52', '#5e8a7a', '#b8ab8c'];
const GLASS = ['#3c5468', '#4a6680', '#6a8aa8', '#34495c'];
const LIT = ['#ffd890', '#ffe8b8', '#fff2d0', '#ffcf7a', '#bcd8ff'];

function speckle(g: Ctx, r: () => number, ox: number, oy: number, n: number, cols: string[], size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(ox + Math.floor(r() * (TILE - size + 1)), oy + Math.floor(r() * (TILE - size + 1)), size, size);
  }
}

const isPaved = (t: number) =>
  t === Tile.ROAD || t === Tile.PARKING || t === Tile.ALLEY || t === Tile.SIDEWALK || t === Tile.BOARDWALK || t === Tile.PLAZA;

/**
 * Draws one 512px chunk into three layers:
 *  - base:  the daylight world (ground, markings, buildings, props)
 *  - wet:   darker wet surfaces + puddles (alpha follows road wetness)
 *  - night: emissive light only — lit windows, lamp pools (added on top after dusk)
 */
export class ChunkRenderer {
  constructor(private map: CityMap, private carCanvas: (variant: number) => HTMLCanvasElement) {}

  render(cx: number, cy: number): { base: HTMLCanvasElement; wet: HTMLCanvasElement; night: HTMLCanvasElement } {
    const base = makeCanvas(CHUNK_PX, CHUNK_PX);
    const wet = makeCanvas(CHUNK_PX, CHUNK_PX);
    const night = makeCanvas(CHUNK_PX, CHUNK_PX);
    const g = base.getContext('2d')!;
    const w = wet.getContext('2d')!;
    const n = night.getContext('2d')!;
    const tx0 = cx * CHUNK_TILES;
    const ty0 = cy * CHUNK_TILES;
    const ox = tx0 * TILE;
    const oy = ty0 * TILE;

    for (let ty = ty0; ty < ty0 + CHUNK_TILES; ty++)
      for (let tx = tx0; tx < tx0 + CHUNK_TILES; tx++) {
        const lx = (tx - tx0) * TILE;
        const ly = (ty - ty0) * TILE;
        this.tile(g, tx, ty, lx, ly);
        this.markings(g, tx, ty, lx, ly);
        this.wetTile(w, tx, ty, lx, ly);
      }

    for (const bay of this.map.bays) {
      if (bay.x < ox - 32 || bay.x > ox + CHUNK_PX + 32 || bay.y < oy - 40 || bay.y > oy + CHUNK_PX + 40) continue;
      g.fillStyle = '#e8e8e4';
      g.fillRect(bay.x - ox - 16, bay.y - oy - 14, 1, 28);
      g.fillRect(bay.x - ox + 16, bay.y - oy - 14, 1, 28);
    }

    const inRange = (x: number, y: number, m = 40) => x > ox - m && x < ox + CHUNK_PX + m && y > oy - m && y < oy + CHUNK_PX + m;
    const blds = this.map.buildings.filter(
      (b) => b.x * TILE < ox + CHUNK_PX + 8 && (b.x + b.w) * TILE + 40 > ox && b.y * TILE < oy + CHUNK_PX + 8 && (b.y + b.h) * TILE + 40 > oy,
    );
    const props = this.map.props.filter((p) => inRange(p.x, p.y));
    for (const b of blds) this.shadow(g, b, ox, oy);
    for (const p of props) this.propShadow(g, p, ox, oy);
    for (const b of blds) this.building(g, n, b, ox, oy);
    for (const p of props) this.prop(g, p, ox, oy);

    // warm pools of light under street lamps
    for (const p of this.map.props) {
      if (p.kind !== 'lamp' || p.knocked || !inRange(p.x, p.y, 60)) continue;
      const x = p.x - ox + Math.cos(p.angle) * 8;
      const y = p.y - oy + Math.sin(p.angle) * 8;
      const grd = n.createRadialGradient(x, y, 0, x, y, 40);
      grd.addColorStop(0, 'rgba(255,196,120,0.42)');
      grd.addColorStop(0.5, 'rgba(255,180,100,0.16)');
      grd.addColorStop(1, 'rgba(255,170,90,0)');
      n.fillStyle = grd;
      n.fillRect(x - 40, y - 40, 80, 80);
    }
    return { base, wet, night };
  }

  // ------------------------------------------------------------------ tiles
  private tile(g: Ctx, tx: number, ty: number, x: number, y: number) {
    const t = this.map.get(tx, ty);
    const r = tileRng(tx, ty);
    switch (t) {
      case Tile.ROAD:
      case Tile.PARKING:
        g.fillStyle = t === Tile.ROAD ? '#55575d' : '#5c5e63';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 16, ['#5c5e64', '#4e5056', '#62646a', '#505258']);
        if (r() < 0.06) {
          g.fillStyle = '#45474c';
          let cx = x + r() * 28;
          let cy = y + r() * 28;
          for (let i = 0; i < 8; i++) {
            g.fillRect(cx | 0, cy | 0, 1, 1);
            cx += r() * 3 - 1;
            cy += r() * 3 - 1;
          }
        }
        if (t === Tile.ROAD && r() < 0.015) {
          g.fillStyle = '#6a6c72';
          g.fillRect(x + 11, y + 11, 10, 10);
          g.fillStyle = '#47494e';
          for (let i = 0; i < 4; i++) g.fillRect(x + 12, y + 12 + i * 2.5, 8, 1);
        }
        break;
      case Tile.ALLEY:
        g.fillStyle = '#4a4a4e';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 12, ['#525256', '#424246', '#5a5048']);
        if (r() < 0.2) {
          g.fillStyle = 'rgba(70,55,40,0.35)';
          g.fillRect(x + r() * 20, y + r() * 20, 6 + r() * 6, 3 + r() * 4);
        }
        break;
      case Tile.SIDEWALK:
        g.fillStyle = '#a8a49a';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#96928a';
        g.fillRect(x, y, TILE, 1);
        g.fillRect(x, y, 1, TILE);
        g.fillRect(x, y + 16, TILE, 1);
        g.fillRect(x + 16, y, 1, TILE);
        speckle(g, r, x, y, 6, ['#b2aea4', '#9c988e']);
        this.curbs(g, tx, ty, x, y);
        break;
      case Tile.BOARDWALK:
        g.fillStyle = '#9a7650';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#7e5e3c';
        for (let i = 0; i < TILE; i += 4) g.fillRect(x, y + i, TILE, 1);
        speckle(g, r, x, y, 5, ['#a8845c', '#6e5232']);
        this.curbs(g, tx, ty, x, y);
        break;
      case Tile.GRASS:
        g.fillStyle = '#5a8a3e';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 28, ['#64963f', '#4e7a36', '#6ea248', '#52803a']);
        if (r() < 0.1) {
          g.fillStyle = ['#e8d84a', '#e86a8a', '#ffffff'][Math.floor(r() * 3)];
          g.fillRect(x + r() * 30, y + r() * 30, 1, 1);
        }
        break;
      case Tile.SAND:
        g.fillStyle = '#dcc88e';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 22, ['#e6d49c', '#cdb87e', '#efe0b0']);
        break;
      case Tile.WATER: {
        g.fillStyle = '#2f6e9e';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#3f84b8';
        for (let i = 0; i < 5; i++) g.fillRect(x + Math.floor(r() * 26), y + Math.floor(r() * 30), 4 + Math.floor(r() * 4), 1);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nb = this.map.get(tx + dx, ty + dy);
          if (nb === Tile.SAND || nb === Tile.GRASS || nb === Tile.SIDEWALK) {
            g.fillStyle = 'rgba(235,245,255,0.7)';
            if (dx === -1) g.fillRect(x, y, 2, TILE);
            if (dx === 1) g.fillRect(x + TILE - 2, y, 2, TILE);
            if (dy === -1) g.fillRect(x, y, TILE, 2);
            if (dy === 1) g.fillRect(x, y + TILE - 2, TILE, 2);
          }
        }
        break;
      }
      case Tile.GRAVEL:
        g.fillStyle = '#8e877a';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 40, ['#9c9486', '#7c766a', '#a8a092', '#857e72']);
        break;
      case Tile.MUD:
        g.fillStyle = '#6e5236';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 10, ['#5e4429', '#7e6040'], 3);
        if (r() < 0.3) {
          g.fillStyle = 'rgba(120,140,160,0.45)';
          g.fillRect(x + r() * 20, y + r() * 24, 8, 3);
        }
        break;
      case Tile.PLAZA:
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            g.fillStyle = (i + j + tx + ty) % 2 ? '#c2b49a' : '#b4a68c';
            g.fillRect(x + i * 16, y + j * 16, 16, 16);
          }
        g.fillStyle = '#a89a80';
        g.fillRect(x, y, TILE, 1);
        g.fillRect(x, y, 1, TILE);
        break;
      default:
        g.fillStyle = '#333';
        g.fillRect(x, y, TILE, TILE);
    }
  }

  private curbs(g: Ctx, tx: number, ty: number, x: number, y: number) {
    const nb = (dx: number, dy: number) => this.map.get(tx + dx, ty + dy) === Tile.ROAD;
    g.fillStyle = '#c8c4ba';
    if (nb(0, -1)) g.fillRect(x, y, TILE, 2);
    if (nb(0, 1)) g.fillRect(x, y + TILE - 2, TILE, 2);
    if (nb(-1, 0)) g.fillRect(x, y, 2, TILE);
    if (nb(1, 0)) g.fillRect(x + TILE - 2, y, 2, TILE);
    g.fillStyle = '#7a776f';
    if (nb(0, -1)) g.fillRect(x, y, TILE, 1);
    if (nb(0, 1)) g.fillRect(x, y + TILE - 1, TILE, 1);
    if (nb(-1, 0)) g.fillRect(x, y, 1, TILE);
    if (nb(1, 0)) g.fillRect(x + TILE - 1, y, 1, TILE);
  }

  private markings(g: Ctx, tx: number, ty: number, x: number, y: number) {
    if (this.map.get(tx, ty) !== Tile.ROAD) return;
    const mx = tx % BLOCK;
    const my = ty % BLOCK;
    const inH = my < ROAD_W;
    const inV = mx < ROAD_W;
    const yellow = '#e8b62c';
    const white = 'rgba(240,240,240,0.9)';
    const faint = 'rgba(240,240,240,0.35)';
    if (inH && !inV) {
      if (mx === ROAD_W || mx === BLOCK - 1) {
        g.fillStyle = white;
        for (let i = 0; i < TILE; i += 8) g.fillRect(x + 5, y + i + 2, 22, 4);
        return;
      }
      g.fillStyle = yellow;
      if (my === 1) g.fillRect(x, y + 28, TILE, 2);
      if (my === 2) g.fillRect(x, y + 2, TILE, 2);
      g.fillStyle = faint;
      if (my === 0) g.fillRect(x, y + 3, TILE, 1);
      if (my === 3) g.fillRect(x, y + 28, TILE, 1);
      g.fillStyle = white;
      if (mx === ROAD_W + 1 && my < 2) g.fillRect(x + 2, y, 3, TILE);
      if (mx === BLOCK - 2 && my >= 2) g.fillRect(x + 27, y, 3, TILE);
    } else if (inV && !inH) {
      if (my === ROAD_W || my === BLOCK - 1) {
        g.fillStyle = white;
        for (let i = 0; i < TILE; i += 8) g.fillRect(x + i + 2, y + 5, 4, 22);
        return;
      }
      g.fillStyle = yellow;
      if (mx === 1) g.fillRect(x + 28, y, 2, TILE);
      if (mx === 2) g.fillRect(x + 2, y, 2, TILE);
      g.fillStyle = faint;
      if (mx === 0) g.fillRect(x + 3, y, 1, TILE);
      if (mx === 3) g.fillRect(x + 28, y, 1, TILE);
      g.fillStyle = white;
      if (my === ROAD_W + 1 && mx >= 2) g.fillRect(x, y + 2, TILE, 3);
      if (my === BLOCK - 2 && mx < 2) g.fillRect(x, y + 27, TILE, 3);
    }
  }

  private wetTile(w: Ctx, tx: number, ty: number, x: number, y: number) {
    const t = this.map.get(tx, ty);
    if (!isPaved(t) && t !== Tile.MUD) return;
    const r = tileRng(tx, ty, 7);
    w.fillStyle = 'rgba(15,25,45,0.28)';
    w.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 3; i++) {
      if (r() > 0.22) continue;
      const px = x + r() * 24;
      const py = y + r() * 26;
      const rw = 5 + r() * 12;
      const rh = 2 + r() * 4;
      w.fillStyle = 'rgba(150,175,210,0.45)';
      w.beginPath();
      w.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
      w.fill();
      w.fillStyle = 'rgba(230,240,255,0.5)';
      w.fillRect(px - rw / 2, py - 1, rw * 0.6, 1);
    }
  }

  // -------------------------------------------------------------- buildings
  private shadow(g: Ctx, b: Building, ox: number, oy: number) {
    const x = b.x * TILE - ox;
    const y = b.y * TILE - oy;
    const w = b.w * TILE;
    const h = b.h * TILE;
    const s = 6 + b.height * 5;
    g.fillStyle = 'rgba(10,15,25,0.32)';
    g.beginPath();
    g.moveTo(x + w, y);
    g.lineTo(x + w + s, y + s);
    g.lineTo(x + w + s, y + h + s);
    g.lineTo(x + s, y + h + s);
    g.lineTo(x, y + h);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
  }

  private building(g: Ctx, n: Ctx, b: Building, ox: number, oy: number) {
    const r = mulberry32(b.seed);
    const x = b.x * TILE - ox;
    const y = b.y * TILE - oy;
    const w = b.w * TILE;
    const h = b.h * TILE;
    const wall = 4 + b.height * 3;
    const roofCol = ROOFS[b.style % ROOFS.length];
    const facade = shade(roofCol, -0.3);
    const facadeE = shade(roofCol, -0.45);

    g.fillStyle = facade;
    g.fillRect(x, y + h - wall, w, wall);
    g.fillStyle = facadeE;
    g.fillRect(x + w - wall, y, wall, h);
    // windows: glass by day, some lit at night (night layer)
    for (let wy = y + h - wall + 2; wy < y + h - 2; wy += 4)
      for (let wx = x + 3; wx < x + w - wall - 2; wx += 4) {
        g.fillStyle = GLASS[Math.floor(r() * GLASS.length)];
        g.fillRect(wx, wy, 2, 2);
        if (r() < 0.42) {
          n.fillStyle = LIT[Math.floor(r() * LIT.length)];
          n.fillRect(wx, wy, 2, 2);
        }
      }
    for (let wx = x + w - wall + 2; wx < x + w - 2; wx += 4)
      for (let wy = y + 3; wy < y + h - 2; wy += 5) {
        g.fillStyle = GLASS[Math.floor(r() * 2)];
        g.fillRect(wx, wy, 2, 3);
        if (r() < 0.32) {
          n.fillStyle = LIT[Math.floor(r() * 3)];
          n.fillRect(wx, wy, 2, 3);
        }
      }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, y + h - 2, w, 2);

    const rw = w - wall;
    const rh = h - wall;
    g.fillStyle = roofCol;
    g.fillRect(x, y, rw, rh);
    g.fillStyle = shade(roofCol, 0.2);
    g.fillRect(x, y, rw, 2);
    g.fillRect(x, y, 2, rh);
    g.fillStyle = shade(roofCol, -0.22);
    g.fillRect(x, y + rh - 2, rw, 2);
    g.fillRect(x + rw - 2, y, 2, rh);
    g.fillStyle = shade(roofCol, -0.08);
    g.fillRect(x + 3, y + 3, rw - 6, rh - 6);
    for (let i = 0; i < (rw * rh) / 80; i++) {
      g.fillStyle = r() < 0.5 ? shade(roofCol, -0.15) : shade(roofCol, 0.08);
      g.fillRect(x + 3 + r() * (rw - 7), y + 3 + r() * (rh - 7), 1, 1);
    }

    if (b.kind === 'garage') {
      g.fillStyle = shade(roofCol, 0.1);
      for (let i = 4; i < rw - 4; i += 4) g.fillRect(x + i, y + 4, 2, rh - 8);
      n.fillStyle = 'rgba(255,200,120,0.9)';
      n.fillRect(x + rw / 2 - 40, y, 80, 2);
      return;
    }
    if (b.kind === 'stage') {
      g.fillStyle = '#3a3842';
      g.fillRect(x + 4, y + 4, rw - 8, rh - 8);
      g.strokeStyle = '#8a8890';
      g.lineWidth = 1;
      for (let i = 6; i < rw - 6; i += 12) {
        g.beginPath();
        g.moveTo(x + i + 0.5, y + 5);
        g.lineTo(x + i + 6.5, y + rh - 5);
        g.stroke();
      }
      for (let i = 6; i < rw - 6; i += 6) {
        g.fillStyle = '#d8d4c8';
        g.fillRect(x + i, y + 2, 2, 2);
        n.fillStyle = '#fff0c8';
        n.fillRect(x + i, y + 2, 2, 2);
      }
      return;
    }

    const area = b.w * b.h;
    if (area >= 30 && b.height >= 4 && r() < 0.5) {
      const cx = x + rw / 2;
      const cy = y + rh / 2;
      const rad = Math.min(rw, rh) / 3.2;
      g.fillStyle = '#3a3c42';
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#e8b62c';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad - 3, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#f0f0f0';
      g.fillRect(cx - 6, cy - 7, 3, 14);
      g.fillRect(cx + 3, cy - 7, 3, 14);
      g.fillRect(cx - 3, cy - 1, 6, 3);
    } else {
      const units = 1 + Math.floor(area / 10);
      for (let i = 0; i < units; i++) {
        const ux = x + 6 + r() * Math.max(1, rw - 20);
        const uy = y + 6 + r() * Math.max(1, rh - 20);
        const kind = r();
        if (kind < 0.5) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(ux + 2, uy + 2, 9, 8);
          g.fillStyle = '#5a5e64';
          g.fillRect(ux, uy, 9, 8);
          g.fillStyle = '#b8bcc0';
          g.fillRect(ux, uy, 8, 7);
          g.fillStyle = '#8a8e94';
          g.fillRect(ux + 2, uy + 2, 4, 3);
        } else if (kind < 0.7) {
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.beginPath();
          g.arc(ux + 8, uy + 8, 6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#7a5a40';
          g.beginPath();
          g.arc(ux + 6, uy + 6, 6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#8e6c50';
          g.fillRect(ux + 2, uy + 5, 8, 1);
        } else if (kind < 0.85) {
          g.fillStyle = '#4a5a68';
          g.fillRect(ux, uy, 12, 7);
          g.fillStyle = '#8aaac8';
          g.fillRect(ux + 1, uy + 1, 10, 5);
          g.fillStyle = '#c8dcf0';
          g.fillRect(ux + 1, uy + 1, 4, 1);
          n.fillStyle = 'rgba(255,220,160,0.7)';
          n.fillRect(ux + 1, uy + 1, 10, 5);
        } else {
          g.fillStyle = '#4e7a36';
          g.fillRect(ux, uy, 12, 10);
          g.fillStyle = '#6ea248';
          g.fillRect(ux + 2, uy + 2, 3, 3);
          g.fillRect(ux + 7, uy + 5, 3, 3);
        }
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#5a5c60';
        g.fillRect(x + 4 + r() * (rw - 10), y + 4 + r() * (rh - 10), 3, 3);
      }
    }
    if (b.beacon) {
      g.fillStyle = '#5d6270';
      g.fillRect(x + rw - 9, y + 5, 3, 3);
    }
  }

  // ------------------------------------------------------------------ props
  private propShadow(g: Ctx, p: Prop, ox: number, oy: number) {
    if ((p.kind !== 'tree' && p.kind !== 'palm') || p.knocked) return;
    g.fillStyle = 'rgba(10,15,25,0.3)';
    g.beginPath();
    g.ellipse(p.x - ox + 5, p.y - oy + 5, 11, 9, 0, 0, Math.PI * 2);
    g.fill();
  }

  /** Knocked-over street furniture lying where it fell. */
  private fallen(g: Ctx, p: Prop, x: number, y: number, r: () => number) {
    const a = p.fallAngle ?? 0;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (p.kind === 'lamp') {
      g.fillStyle = '#2e3034';
      g.fillRect(x - 2, y - 2, 4, 4); // broken base
      g.strokeStyle = '#4a4c52';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + c * 16, y + s * 16);
      g.stroke();
      g.fillStyle = '#9a968c';
      g.fillRect(x + c * 16 - 2, y + s * 16 - 2, 4, 4);
      g.fillStyle = 'rgba(220,230,240,0.8)'; // glass shards
      for (let i = 0; i < 5; i++) g.fillRect(x + c * 18 + (r() - 0.5) * 10, y + s * 18 + (r() - 0.5) * 10, 1, 1);
    } else if (p.kind === 'tree') {
      g.fillStyle = '#6a4a2e';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3e7430';
      for (let i = 0; i < 14; i++) g.fillRect(x + c * 10 + (r() - 0.5) * 18, y + s * 10 + (r() - 0.5) * 18, 2, 2);
    } else if (p.kind === 'cone') {
      g.save();
      g.translate(x + c * 8, y + s * 8);
      g.rotate(a + 1.2);
      g.fillStyle = '#f07a1a';
      g.fillRect(-3, -2, 6, 4);
      g.fillStyle = '#f5f5f5';
      g.fillRect(-1, -2, 1, 4);
      g.restore();
    }
  }

  private prop(g: Ctx, p: Prop, ox: number, oy: number) {
    const x = p.x - ox;
    const y = p.y - oy;
    const r = mulberry32((p.x * 31 + p.y * 17) | 0);
    if (p.knocked) {
      this.fallen(g, p, x, y, r);
      return;
    }
    switch (p.kind) {
      case 'tree': {
        const greens = [['#2e5a26', '#3e7430', '#5a9442'], ['#2a5230', '#3a6a3e', '#56885a'], ['#3a5a22', '#4e7a2c', '#6a9a3a']][p.variant % 3];
        const rad = 9 + r() * 3;
        g.fillStyle = greens[0];
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
        for (let i = 0; i < 7; i++) {
          g.fillStyle = greens[1];
          const a = r() * Math.PI * 2;
          const d = r() * rad * 0.6;
          g.beginPath();
          g.arc(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 3 + r() * 2, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = greens[2];
        for (let i = 0; i < 6; i++) g.fillRect(x - rad / 2 + r() * rad * 0.7, y - rad / 2 + r() * rad * 0.7, 2, 2);
        break;
      }
      case 'palm': {
        g.strokeStyle = '#3e7a3a';
        g.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const a = p.angle + (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
          g.stroke();
        }
        g.fillStyle = '#7a5a3a';
        g.fillRect(x - 2, y - 2, 4, 4);
        break;
      }
      case 'lamp': {
        g.fillStyle = '#2e3034';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#6a6c72';
        g.fillRect(x - 1, y - 1, 3, 3);
        const ex = x + Math.cos(p.angle) * 8;
        const ey = y + Math.sin(p.angle) * 8;
        g.strokeStyle = '#4a4c52';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + 0.5, y + 0.5);
        g.lineTo(ex + 0.5, ey + 0.5);
        g.stroke();
        g.fillStyle = '#d8d4c8';
        g.fillRect(ex - 1, ey - 1, 3, 3);
        break;
      }
      case 'cone':
        g.fillStyle = '#f07a1a';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#f5f5f5';
        g.fillRect(x - 1, y, 3, 1);
        break;
      case 'barrier':
        g.save();
        g.translate(x, y);
        g.rotate(p.angle);
        g.fillStyle = '#e8e8e8';
        g.fillRect(-12, -2, 24, 4);
        g.fillStyle = '#d82a2a';
        for (let i = -12; i < 12; i += 6) g.fillRect(i, -2, 3, 4);
        g.restore();
        break;
      case 'bench':
        g.fillStyle = '#6e5236';
        g.fillRect(x - 7, y - 2, 14, 4);
        g.fillStyle = '#8a6a48';
        g.fillRect(x - 7, y - 2, 14, 1);
        break;
      case 'parked': {
        const c = this.carCanvas(p.variant);
        g.save();
        g.translate(x, y);
        g.rotate(p.angle);
        g.fillStyle = 'rgba(10,15,25,0.3)';
        g.fillRect(-c.width / 2 + 3, -c.height / 2 + 3, c.width, c.height);
        g.drawImage(c, -c.width / 2, -c.height / 2);
        g.restore();
        break;
      }
    }
  }
}
