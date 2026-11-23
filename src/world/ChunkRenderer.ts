import { BLOCK, CHUNK_PX, CHUNK_TILES, ROAD_W, TILE } from '../config';
import { mulberry32, tileRng } from '../core/rng';
import { hexStr, makeCanvas, shade } from '../gfx/SpriteFactory';
import type { Building, CityMap, Prop } from './CityMap';
import { Tile } from './Tiles';

type Ctx = CanvasRenderingContext2D;

const ROOFS: [string, string][] = [
  ['#2b3046', '#7ae0ff'],
  ['#3a2c42', '#ff9ad5'],
  ['#2b3b3a', '#ffd27a'],
  ['#3d382f', '#ffd27a'],
  ['#2a2a33', '#ff2bd6'],
  ['#3b3f48', '#ffe9b0'],
];
const LIT = ['#ffd27a', '#ffe9b0', '#7ae0ff', '#ff9ad5', '#fff3c4'];

function speckle(g: Ctx, r: () => number, ox: number, oy: number, n: number, cols: string[], size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(ox + Math.floor(r() * (TILE - size + 1)), oy + Math.floor(r() * (TILE - size + 1)), size, size);
  }
}

const isRoadLike = (t: number) => t === Tile.ROAD || t === Tile.PARKING || t === Tile.ALLEY;
const isWalk = (t: number) => t === Tile.SIDEWALK || t === Tile.BOARDWALK;

export class ChunkRenderer {
  constructor(private map: CityMap, private carCanvas: (variant: number) => HTMLCanvasElement) {}

  render(cx: number, cy: number): { base: HTMLCanvasElement; wet: HTMLCanvasElement } {
    const base = makeCanvas(CHUNK_PX, CHUNK_PX);
    const wet = makeCanvas(CHUNK_PX, CHUNK_PX);
    const g = base.getContext('2d')!;
    const w = wet.getContext('2d')!;
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
      g.fillStyle = '#8d93a3';
      g.fillRect(bay.x - ox - 16, bay.y - oy - 14, 1, 28);
      g.fillRect(bay.x - ox + 16, bay.y - oy - 14, 1, 28);
    }

    const near = (b: Building) =>
      b.x * TILE < ox + CHUNK_PX + 8 && (b.x + b.w) * TILE + 40 > ox && b.y * TILE < oy + CHUNK_PX + 8 && (b.y + b.h) * TILE + 40 > oy;
    const blds = this.map.buildings.filter(near);
    for (const b of blds) this.shadow(g, b, ox, oy);
    for (const p of this.map.props) {
      if (p.x < ox - 40 || p.x > ox + CHUNK_PX + 40 || p.y < oy - 40 || p.y > oy + CHUNK_PX + 40) continue;
      this.propShadow(g, p, ox, oy);
    }
    for (const b of blds) this.building(g, b, ox, oy);
    for (const p of this.map.props) {
      if (p.x < ox - 40 || p.x > ox + CHUNK_PX + 40 || p.y < oy - 40 || p.y > oy + CHUNK_PX + 40) continue;
      this.prop(g, p, ox, oy);
    }

    // neon + lamp reflections on the wet layer
    for (const s of this.map.signs) {
      if (s.x < ox - 80 || s.x > ox + CHUNK_PX + 80 || s.y < oy - 120 || s.y > oy + CHUNK_PX + 40) continue;
      const col = hexStr(s.color);
      const x = s.x - ox;
      const y = s.y - oy + 24;
      const grd = w.createLinearGradient(0, y, 0, y + 70);
      grd.addColorStop(0, col + '55');
      grd.addColorStop(1, col + '00');
      w.fillStyle = grd;
      const ww = s.vertical ? 10 : Math.min(60, s.text.length * 6);
      for (let i = 0; i < ww; i += 3) w.fillRect(x - ww / 2 + i, y + ((i * 7) % 5), 2, 70);
    }
    for (const p of this.map.props) {
      if (p.kind !== 'lamp' || p.x < ox - 60 || p.x > ox + CHUNK_PX + 60 || p.y < oy - 60 || p.y > oy + CHUNK_PX + 60) continue;
      const x = p.x - ox + Math.cos(p.angle) * 8;
      const y = p.y - oy + Math.sin(p.angle) * 8 + 10;
      const grd = w.createRadialGradient(x, y, 0, x, y, 30);
      grd.addColorStop(0, 'rgba(255,200,120,0.35)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      w.fillStyle = grd;
      w.fillRect(x - 30, y - 30, 60, 60);
    }
    return { base, wet };
  }

  // ------------------------------------------------------------------ tiles
  private tile(g: Ctx, tx: number, ty: number, x: number, y: number) {
    const t = this.map.get(tx, ty);
    const r = tileRng(tx, ty);
    switch (t) {
      case Tile.ROAD:
      case Tile.PARKING:
        g.fillStyle = t === Tile.ROAD ? '#1f2129' : '#24262e';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 14, ['#262832', '#1a1c23', '#2b2d38', '#1c1e25']);
        if (r() < 0.06) {
          g.fillStyle = '#16171d';
          let cx = x + r() * 28;
          let cy = y + r() * 28;
          for (let i = 0; i < 8; i++) {
            g.fillRect(cx | 0, cy | 0, 1, 1);
            cx += r() * 3 - 1;
            cy += r() * 3 - 1;
          }
        }
        if (t === Tile.ROAD && r() < 0.015) {
          g.fillStyle = '#2f313b';
          g.fillRect(x + 11, y + 11, 10, 10);
          g.fillStyle = '#191a20';
          for (let i = 0; i < 4; i++) g.fillRect(x + 12, y + 12 + i * 2.5, 8, 1);
        }
        break;
      case Tile.ALLEY:
        g.fillStyle = '#1a1b21';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 12, ['#202129', '#15161b', '#2a2620']);
        if (r() < 0.2) {
          g.fillStyle = 'rgba(60,50,40,0.5)';
          g.fillRect(x + r() * 20, y + r() * 20, 6 + r() * 6, 3 + r() * 4);
        }
        break;
      case Tile.SIDEWALK:
        g.fillStyle = '#383b47';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#30333e';
        g.fillRect(x, y, TILE, 1);
        g.fillRect(x, y, 1, TILE);
        g.fillRect(x, y + 16, TILE, 1);
        g.fillRect(x + 16, y, 1, TILE);
        speckle(g, r, x, y, 6, ['#3f4250', '#33363f']);
        this.curbs(g, tx, ty, x, y);
        break;
      case Tile.BOARDWALK:
        g.fillStyle = '#4a3826';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#382a1b';
        for (let i = 0; i < TILE; i += 4) g.fillRect(x, y + i, TILE, 1);
        speckle(g, r, x, y, 5, ['#5a4632', '#2e2316']);
        this.curbs(g, tx, ty, x, y);
        break;
      case Tile.GRASS:
        g.fillStyle = '#16301d';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 26, ['#1d3d25', '#112617', '#21462a', '#183520']);
        if (r() < 0.08) {
          g.fillStyle = r() < 0.5 ? '#c66a9a' : '#c9c06a';
          g.fillRect(x + r() * 30, y + r() * 30, 1, 1);
        }
        break;
      case Tile.SAND:
        g.fillStyle = '#6f6044';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 22, ['#7b6a4b', '#62553c', '#857252']);
        break;
      case Tile.WATER: {
        g.fillStyle = '#0a1f35';
        g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#10304f';
        for (let i = 0; i < 5; i++) g.fillRect(x + Math.floor(r() * 26), y + Math.floor(r() * 30), 4 + Math.floor(r() * 4), 1);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const n = this.map.get(tx + dx, ty + dy);
          if (n === Tile.SAND || n === Tile.GRASS || n === Tile.SIDEWALK) {
            g.fillStyle = 'rgba(140,190,220,0.45)';
            if (dx === -1) g.fillRect(x, y, 2, TILE);
            if (dx === 1) g.fillRect(x + TILE - 2, y, 2, TILE);
            if (dy === -1) g.fillRect(x, y, TILE, 2);
            if (dy === 1) g.fillRect(x, y + TILE - 2, TILE, 2);
          }
        }
        break;
      }
      case Tile.GRAVEL:
        g.fillStyle = '#423e38';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 40, ['#55504a', '#37332e', '#605a50', '#4a453e']);
        break;
      case Tile.MUD:
        g.fillStyle = '#33261a';
        g.fillRect(x, y, TILE, TILE);
        speckle(g, r, x, y, 10, ['#271c12', '#3f2f20'], 3);
        speckle(g, r, x, y, 6, ['#4a3a29'], 1);
        if (r() < 0.3) {
          g.fillStyle = 'rgba(90,110,140,0.35)';
          g.fillRect(x + r() * 20, y + r() * 24, 8, 3);
        }
        break;
      case Tile.PLAZA:
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            g.fillStyle = (i + j + tx + ty) % 2 ? '#2e2840' : '#352f4a';
            g.fillRect(x + i * 16, y + j * 16, 16, 16);
          }
        g.fillStyle = '#3f3857';
        g.fillRect(x, y, TILE, 1);
        g.fillRect(x, y, 1, TILE);
        break;
      default:
        g.fillStyle = '#111';
        g.fillRect(x, y, TILE, TILE);
    }
  }

  private curbs(g: Ctx, tx: number, ty: number, x: number, y: number) {
    const n = (dx: number, dy: number) => this.map.get(tx + dx, ty + dy) === Tile.ROAD;
    g.fillStyle = '#5d6170';
    if (n(0, -1)) g.fillRect(x, y, TILE, 2);
    if (n(0, 1)) g.fillRect(x, y + TILE - 2, TILE, 2);
    if (n(-1, 0)) g.fillRect(x, y, 2, TILE);
    if (n(1, 0)) g.fillRect(x + TILE - 2, y, 2, TILE);
    g.fillStyle = '#7b8090';
    if (n(0, -1)) g.fillRect(x, y, TILE, 1);
    if (n(0, 1)) g.fillRect(x, y + TILE - 1, TILE, 1);
    if (n(-1, 0)) g.fillRect(x, y, 1, TILE);
    if (n(1, 0)) g.fillRect(x + TILE - 1, y, 1, TILE);
  }

  private markings(g: Ctx, tx: number, ty: number, x: number, y: number) {
    if (this.map.get(tx, ty) !== Tile.ROAD) return;
    const mx = tx % BLOCK;
    const my = ty % BLOCK;
    const inH = my < ROAD_W;
    const inV = mx < ROAD_W;
    const yellow = '#c9a227';
    const white = 'rgba(200,205,215,0.75)';
    if (inH && !inV) {
      const cross = mx === ROAD_W || mx === BLOCK - 1;
      if (cross) {
        g.fillStyle = white;
        for (let i = 0; i < TILE; i += 8) g.fillRect(x + 5, y + i + 2, 22, 4);
      } else {
        g.fillStyle = yellow;
        if (my === 1) g.fillRect(x, y + 28, TILE, 2);
        if (my === 2) g.fillRect(x, y + 2, TILE, 2);
        if (mx % 2 === 0) {
          g.fillStyle = 'rgba(200,205,215,0.25)';
          if (my === 0) g.fillRect(x + 4, y + 3, 16, 1);
          if (my === 3) g.fillRect(x + 4, y + 28, 16, 1);
        }
        g.fillStyle = white;
        if (mx === ROAD_W + 1 && my < 2) g.fillRect(x + 2, y, 3, TILE);
        if (mx === BLOCK - 2 && my >= 2) g.fillRect(x + 27, y, 3, TILE);
      }
    } else if (inV && !inH) {
      const cross = my === ROAD_W || my === BLOCK - 1;
      if (cross) {
        g.fillStyle = white;
        for (let i = 0; i < TILE; i += 8) g.fillRect(x + i + 2, y + 5, 4, 22);
      } else {
        g.fillStyle = yellow;
        if (mx === 1) g.fillRect(x + 28, y, 2, TILE);
        if (mx === 2) g.fillRect(x + 2, y, 2, TILE);
        if (my % 2 === 0) {
          g.fillStyle = 'rgba(200,205,215,0.25)';
          if (mx === 0) g.fillRect(x + 3, y + 4, 1, 16);
          if (mx === 3) g.fillRect(x + 28, y + 4, 1, 16);
        }
        g.fillStyle = white;
        if (my === ROAD_W + 1 && mx >= 2) g.fillRect(x, y + 2, TILE, 3);
        if (my === BLOCK - 2 && mx < 2) g.fillRect(x, y + 27, TILE, 3);
      }
    }
  }

  private wetTile(w: Ctx, tx: number, ty: number, x: number, y: number) {
    const t = this.map.get(tx, ty);
    if (!(isRoadLike(t) || isWalk(t) || t === Tile.PLAZA || t === Tile.MUD)) return;
    const r = tileRng(tx, ty, 7);
    w.fillStyle = 'rgba(70,95,140,0.16)';
    w.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 3; i++) {
      if (r() > 0.22) continue;
      const px = x + r() * 24;
      const py = y + r() * 26;
      const rw = 5 + r() * 12;
      const rh = 2 + r() * 4;
      w.fillStyle = 'rgba(120,150,205,0.28)';
      w.beginPath();
      w.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
      w.fill();
      w.fillStyle = 'rgba(200,220,255,0.25)';
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
    g.fillStyle = 'rgba(0,0,6,0.5)';
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

  private building(g: Ctx, b: Building, ox: number, oy: number) {
    const r = mulberry32(b.seed);
    const x = b.x * TILE - ox;
    const y = b.y * TILE - oy;
    const w = b.w * TILE;
    const h = b.h * TILE;
    const wall = 4 + b.height * 3;
    const [roofCol, winTint] = ROOFS[b.style % ROOFS.length];
    const facade = shade(roofCol, -0.35);
    const facadeE = shade(roofCol, -0.5);

    // south facade
    g.fillStyle = facade;
    g.fillRect(x, y + h - wall, w, wall);
    // east facade
    g.fillStyle = facadeE;
    g.fillRect(x + w - wall, y, wall, h);
    // windows
    for (let wy = y + h - wall + 2; wy < y + h - 2; wy += 4)
      for (let wx = x + 3; wx < x + w - wall - 2; wx += 4) {
        g.fillStyle = r() < 0.38 ? (r() < 0.7 ? winTint : LIT[Math.floor(r() * LIT.length)]) : '#12131c';
        g.fillRect(wx, wy, 2, 2);
      }
    for (let wx = x + w - wall + 2; wx < x + w - 2; wx += 4)
      for (let wy = y + 3; wy < y + h - 2; wy += 5) {
        g.fillStyle = r() < 0.3 ? winTint : '#0f1018';
        g.fillRect(wx, wy, 2, 3);
      }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, y + h - 2, w, 2);

    // roof
    const rw = w - wall;
    const rh = h - wall;
    g.fillStyle = roofCol;
    g.fillRect(x, y, rw, rh);
    g.fillStyle = shade(roofCol, 0.18);
    g.fillRect(x, y, rw, 2);
    g.fillRect(x, y, 2, rh);
    g.fillStyle = shade(roofCol, -0.25);
    g.fillRect(x, y + rh - 2, rw, 2);
    g.fillRect(x + rw - 2, y, 2, rh);
    g.fillStyle = shade(roofCol, -0.1);
    g.fillRect(x + 3, y + 3, rw - 6, rh - 6);
    // roof texture
    for (let i = 0; i < (rw * rh) / 90; i++) {
      g.fillStyle = r() < 0.5 ? shade(roofCol, -0.18) : shade(roofCol, 0.06);
      g.fillRect(x + 3 + r() * (rw - 7), y + 3 + r() * (rh - 7), 1, 1);
    }

    if (b.kind === 'garage') {
      g.fillStyle = shade(roofCol, 0.08);
      for (let i = 4; i < rw - 4; i += 4) g.fillRect(x + i, y + 4, 2, rh - 8);
      g.fillStyle = '#ffb347';
      g.fillRect(x + rw / 2 - 40, y, 80, 2);
      return;
    }
    if (b.kind === 'stage') {
      g.fillStyle = '#16131f';
      g.fillRect(x + 4, y + 4, rw - 8, rh - 8);
      g.strokeStyle = '#4a4560';
      g.lineWidth = 1;
      for (let i = 6; i < rw - 6; i += 12) {
        g.beginPath();
        g.moveTo(x + i + 0.5, y + 5);
        g.lineTo(x + i + 6.5, y + rh - 5);
        g.stroke();
      }
      for (let i = 6; i < rw - 6; i += 6) {
        g.fillStyle = LIT[(i / 6) % LIT.length | 0];
        g.fillRect(x + i, y + 2, 2, 2);
      }
      return;
    }

    const area = b.w * b.h;
    if (area >= 30 && b.height >= 4 && r() < 0.5) {
      const cx = x + rw / 2;
      const cy = y + rh / 2;
      const rad = Math.min(rw, rh) / 3.2;
      g.fillStyle = '#23262f';
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c9a227';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, rad - 3, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#c9a227';
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
          // AC unit
          g.fillStyle = '#1b1d24';
          g.fillRect(ux + 1, uy + 1, 9, 8);
          g.fillStyle = '#5d6270';
          g.fillRect(ux, uy, 9, 8);
          g.fillStyle = '#3b3f49';
          g.fillRect(ux + 2, uy + 2, 5, 4);
          g.fillStyle = '#7a8090';
          g.fillRect(ux + 4, uy + 3, 1, 2);
        } else if (kind < 0.7) {
          // water tank
          g.fillStyle = '#1b1d24';
          g.beginPath();
          g.arc(ux + 7, uy + 7, 6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#5a4536';
          g.beginPath();
          g.arc(ux + 6, uy + 6, 6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#6e5644';
          g.fillRect(ux + 2, uy + 5, 8, 1);
        } else if (kind < 0.85) {
          // skylight
          g.fillStyle = '#0f1726';
          g.fillRect(ux, uy, 12, 7);
          g.fillStyle = winTint;
          g.globalAlpha = 0.5;
          g.fillRect(ux + 1, uy + 1, 10, 5);
          g.globalAlpha = 1;
        } else {
          // roof garden
          g.fillStyle = '#1d3d25';
          g.fillRect(ux, uy, 12, 10);
          g.fillStyle = '#2a5a34';
          g.fillRect(ux + 2, uy + 2, 3, 3);
          g.fillRect(ux + 7, uy + 5, 3, 3);
        }
      }
      // vents
      for (let i = 0; i < 3; i++) {
        g.fillStyle = '#16171d';
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
    const x = p.x - ox;
    const y = p.y - oy;
    g.fillStyle = 'rgba(0,0,6,0.45)';
    if (p.kind === 'tree' || p.kind === 'palm') {
      g.beginPath();
      g.ellipse(x + 5, y + 5, 11, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private prop(g: Ctx, p: Prop, ox: number, oy: number) {
    const x = p.x - ox;
    const y = p.y - oy;
    const r = mulberry32((p.x * 31 + p.y * 17) | 0);
    switch (p.kind) {
      case 'tree': {
        const greens = [['#173d22', '#225a31', '#2f7440'], ['#1a3a2a', '#245238', '#356e4a'], ['#22401c', '#2f5a26', '#3f7432']][p.variant % 3];
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
        g.strokeStyle = '#2a5a2e';
        g.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const a = p.angle + (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
          g.stroke();
        }
        g.fillStyle = '#5a4030';
        g.fillRect(x - 2, y - 2, 4, 4);
        break;
      }
      case 'lamp': {
        g.fillStyle = '#16171d';
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = '#6a6e7c';
        g.fillRect(x - 1, y - 1, 3, 3);
        const ex = x + Math.cos(p.angle) * 8;
        const ey = y + Math.sin(p.angle) * 8;
        g.strokeStyle = '#4a4d58';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + 0.5, y + 0.5);
        g.lineTo(ex + 0.5, ey + 0.5);
        g.stroke();
        g.fillStyle = p.variant === 1 ? '#ffd2f2' : '#ffe2a8';
        g.fillRect(ex - 1, ey - 1, 3, 3);
        break;
      }
      case 'cone':
        g.fillStyle = '#ff6a1a';
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
        g.fillStyle = '#4a3624';
        g.fillRect(x - 7, y - 2, 14, 4);
        g.fillStyle = '#5e4630';
        g.fillRect(x - 7, y - 2, 14, 1);
        break;
      case 'parked': {
        const c = this.carCanvas(p.variant);
        g.save();
        g.translate(x, y);
        g.rotate(p.angle);
        g.fillStyle = 'rgba(0,0,6,0.45)';
        g.fillRect(-c.width / 2 + 3, -c.height / 2 + 3, c.width, c.height);
        g.drawImage(c, -c.width / 2, -c.height / 2);
        g.fillStyle = 'rgba(0,0,10,0.25)';
        g.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
        g.restore();
        break;
      }
    }
  }
}
