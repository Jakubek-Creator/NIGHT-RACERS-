import { BLOCK, COAST_X, GRID, MAP_H, MAP_W, ROAD_W, TILE, nodePos } from '../config';
import { clamp } from '../core/math';
import { mulberry32 } from '../core/rng';
import { SURFACES, Surface, Tile, isSolidTile } from './Tiles';

export type BuildingKind = 'tower' | 'shop' | 'garage' | 'stage' | 'office';
export interface Building {
  x: number; // tiles
  y: number;
  w: number;
  h: number;
  height: number; // 1..6 storeys-ish, drives facade depth + shadow
  style: number;
  kind: BuildingKind;
  seed: number;
  beacon: boolean;
}

export interface Sign {
  x: number; // px centre
  y: number;
  text: string;
  color: number;
  vertical: boolean;
  flicker: boolean;
}

export type PropKind = 'tree' | 'palm' | 'lamp' | 'cone' | 'parked' | 'collider' | 'bench' | 'barrier';
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  r: number;
  solid: boolean;
  angle: number;
  variant: number;
}

export type BlockKind = 'downtown' | 'park' | 'parking' | 'construction' | 'festival' | 'garage' | 'coast';

export const NEON = [0xff2bd6, 0x2bf0ff, 0xffe02b, 0x7dff5a, 0xff6a2b, 0xa35bff, 0xff3b5c];
const WORDS = ['BAR', '24/7', 'HOTEL', 'NOVA', 'PIZZA', 'RAMEN', 'CLUB', 'DINER', 'ARCADE', 'MOTEL', 'TACO', 'JAZZ', 'NEON', 'GYM', 'CAFE', 'SUSHI', 'TOYS', 'BOWL', 'DISCO', 'PAWN', 'TATTOO', 'NOODLE', 'CINEMA', 'HI-FI', 'VIDEO'];

/** Hand-placed block layout for the Neon City prototype (bi,bj grid cells). */
const LAYOUT: Record<string, BlockKind> = {
  '3,3': 'festival',
  '2,3': 'garage',
  '1,1': 'park',
  '5,6': 'park',
  '0,5': 'park',
  '4,1': 'parking',
  '2,6': 'parking',
  '6,3': 'parking',
  '1,6': 'construction',
  '6,0': 'construction',
};

export interface Bay {
  x: number;
  y: number;
}

export class CityMap {
  readonly tiles = new Uint8Array(MAP_W * MAP_H);
  readonly buildings: Building[] = [];
  readonly props: Prop[] = [];
  readonly signs: Sign[] = [];
  readonly bays: Bay[] = [];
  readonly blocks: BlockKind[][] = [];
  readonly beams: { x: number; y: number; color: number; phase: number }[] = [];
  private readonly propGrid: Prop[][] = new Array(MAP_W * MAP_H);

  readonly zones = {
    garage: { x: 0, y: 0 },
    raceStart: { x: 0, y: 0 },
    spawn: { x: 0, y: 0, angle: 0 },
  };

  constructor(seed = 1337) {
    this.generate(seed);
    for (const p of this.props) {
      if (!p.solid) continue;
      const tx = clamp(Math.floor(p.x / TILE), 0, MAP_W - 1);
      const ty = clamp(Math.floor(p.y / TILE), 0, MAP_H - 1);
      const i = ty * MAP_W + tx;
      (this.propGrid[i] ??= []).push(p);
    }
  }

  get(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return this.tiles[ty * MAP_W + tx];
  }

  isSolid(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t < 0 || isSolidTile(t);
  }

  surfaceAt(px: number, py: number): Surface {
    const t = this.get(Math.floor(px / TILE), Math.floor(py / TILE));
    return SURFACES[t < 0 ? Tile.ROAD : t];
  }

  /** Visit solid props whose centre tile is near (x,y). Props are at most 12px in radius. */
  forPropsNear(x: number, y: number, r: number, fn: (p: Prop) => void) {
    const reach = r + 12;
    const x0 = Math.max(0, Math.floor((x - reach) / TILE));
    const x1 = Math.min(MAP_W - 1, Math.floor((x + reach) / TILE));
    const y0 = Math.max(0, Math.floor((y - reach) / TILE));
    const y1 = Math.min(MAP_H - 1, Math.floor((y + reach) / TILE));
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const list = this.propGrid[ty * MAP_W + tx];
        if (list) for (const p of list) fn(p);
      }
  }

  // ---------------------------------------------------------------- generation
  private set(tx: number, ty: number, t: number) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
    this.tiles[ty * MAP_W + tx] = t;
  }

  private fill(x: number, y: number, w: number, h: number, t: number) {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.set(tx, ty, t);
  }

  private generate(seed: number) {
    const rng = mulberry32(seed);
    for (let ty = 0; ty < MAP_H; ty++)
      for (let tx = 0; tx < MAP_W; tx++) {
        const road = ty % BLOCK < ROAD_W || tx % BLOCK < ROAD_W;
        this.set(tx, ty, road ? Tile.ROAD : Tile.GRASS);
      }

    for (let bi = 0; bi < GRID; bi++) {
      this.blocks[bi] = [];
      for (let bj = 0; bj < GRID; bj++) {
        const kind: BlockKind = bi === GRID - 1 ? 'coast' : LAYOUT[`${bi},${bj}`] ?? 'downtown';
        this.blocks[bi][bj] = kind;
        const x0 = bi * BLOCK + ROAD_W;
        const y0 = bj * BLOCK + ROAD_W;
        switch (kind) {
          case 'downtown':
            this.makeDowntown(x0, y0, bi, bj, rng);
            break;
          case 'park':
            this.makePark(x0, y0, rng);
            break;
          case 'parking':
            this.makeParking(x0, y0, rng);
            break;
          case 'construction':
            this.makeConstruction(x0, y0, rng);
            break;
          case 'festival':
            this.makeFestival(x0, y0, rng);
            break;
          case 'garage':
            this.makeGarage(x0, y0, rng);
            break;
          case 'coast':
            break;
        }
      }
    }
    this.makeCoast(rng);

    const startX = (3 * BLOCK + ROAD_W / 2 + 8) * TILE;
    this.zones.raceStart = { x: startX, y: (3 * BLOCK + ROAD_W + 1.6) * TILE };
    this.zones.spawn = { x: startX - 140, y: nodePos(3) + TILE, angle: 0 };
  }

  private ring(x0: number, y0: number, S: number, t: number) {
    this.fill(x0, y0, S, 1, t);
    this.fill(x0, y0 + S - 1, S, 1, t);
    this.fill(x0, y0, 1, S, t);
    this.fill(x0 + S - 1, y0, 1, S, t);
  }

  /** Lamps (and optionally street trees) along a block's sidewalk ring. */
  private sidewalkProps(x0: number, y0: number, S: number, rng: () => number, trees: boolean) {
    const place = (tx: number, ty: number, ox: number, oy: number, i: number) => {
      if (this.get(tx, ty) !== Tile.SIDEWALK) return;
      const cx = tx * TILE + 16;
      const cy = ty * TILE + 16;
      if (i % 4 === 1) this.props.push({ kind: 'lamp', x: cx + ox * 9, y: cy + oy * 9, r: 3, solid: true, angle: Math.atan2(oy, ox), variant: 0 });
      else if (trees && i % 4 === 3 && rng() < 0.6)
        this.props.push({ kind: 'tree', x: cx + ox * 4, y: cy + oy * 4, r: 6, solid: true, angle: 0, variant: Math.floor(rng() * 3) });
    };
    for (let i = 1; i < S - 1; i++) {
      place(x0 + i, y0, 0, -1, i);
      place(x0 + i, y0 + S - 1, 0, 1, i);
      place(x0, y0 + i, -1, 0, i);
      place(x0 + S - 1, y0 + i, 1, 0, i);
    }
  }

  private makeDowntown(x0: number, y0: number, bi: number, bj: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.SIDEWALK);
    const tall = clamp(1 - Math.hypot(bi - 3.5, bj - 3.5) / 4.5, 0, 1);
    const areas: { x: number; y: number; w: number; h: number }[] = [];
    if (rng() < 0.4) {
      if (rng() < 0.5) {
        this.fill(x0, y0 + 5, S, 2, Tile.ALLEY);
        areas.push({ x: x0 + 1, y: y0 + 1, w: 10, h: 4 }, { x: x0 + 1, y: y0 + 7, w: 10, h: 4 });
      } else {
        this.fill(x0 + 5, y0, 2, S, Tile.ALLEY);
        areas.push({ x: x0 + 1, y: y0 + 1, w: 4, h: 10 }, { x: x0 + 7, y: y0 + 1, w: 4, h: 10 });
      }
    } else areas.push({ x: x0 + 1, y: y0 + 1, w: 10, h: 10 });
    for (const a of areas) this.split(a, rng, 0, tall, x0, y0);
    this.sidewalkProps(x0, y0, S, rng, true);
  }

  private split(r: { x: number; y: number; w: number; h: number }, rng: () => number, depth: number, tall: number, x0: number, y0: number) {
    const canW = r.w >= 6;
    const canH = r.h >= 6;
    if (depth < 3 && (canW || canH) && rng() < (depth === 0 ? 0.85 : 0.5)) {
      const vertical = canW && (!canH || (r.w >= r.h ? rng() < 0.75 : rng() < 0.25));
      if (vertical) {
        const cut = 3 + Math.floor(rng() * (r.w - 5));
        this.split({ x: r.x, y: r.y, w: cut, h: r.h }, rng, depth + 1, tall, x0, y0);
        this.split({ x: r.x + cut, y: r.y, w: r.w - cut, h: r.h }, rng, depth + 1, tall, x0, y0);
      } else {
        const cut = 3 + Math.floor(rng() * (r.h - 5));
        this.split({ x: r.x, y: r.y, w: r.w, h: cut }, rng, depth + 1, tall, x0, y0);
        this.split({ x: r.x, y: r.y + cut, w: r.w, h: r.h - cut }, rng, depth + 1, tall, x0, y0);
      }
      return;
    }
    const area = r.w * r.h;
    const height = clamp(Math.round(1 + rng() * 1.5 + tall * 3.5 + (area > 40 ? 1 : 0)), 1, 6);
    const b = this.addBuilding(r.x, r.y, r.w, r.h, height, area <= 16 ? 'shop' : 'tower', rng);
    this.maybeSign(b, rng, x0, y0, 0.7);
  }

  private addBuilding(x: number, y: number, w: number, h: number, height: number, kind: BuildingKind, rng: () => number): Building {
    const b: Building = {
      x, y, w, h, height, kind,
      style: Math.floor(rng() * 6),
      seed: Math.floor(rng() * 1e9),
      beacon: height >= 5 && w * h >= 20,
    };
    this.fill(x, y, w, h, Tile.BUILDING);
    this.buildings.push(b);
    return b;
  }

  /** Neon sign on a building edge that faces the street. */
  private maybeSign(b: Building, rng: () => number, x0: number, y0: number, chance: number, forced?: { text: string; side: number; color: number }) {
    if (!forced && rng() > chance) return;
    const S = BLOCK - ROAD_W;
    const sides: number[] = [];
    if (b.y === y0 + 1) sides.push(0); // north
    if (b.y + b.h === y0 + S - 1) sides.push(2); // south
    if (b.x === x0 + 1) sides.push(3); // west
    if (b.x + b.w === x0 + S - 1) sides.push(1); // east
    if (!forced && sides.length === 0) return;
    const side = forced ? forced.side : sides[Math.floor(rng() * sides.length)];
    const vertical = side === 1 || side === 3;
    const room = vertical ? b.h * TILE - 12 : b.w * TILE - 12;
    const fits = WORDS.filter((w) => (vertical ? w.length * 12 + 4 : w.length * 8 + 6) <= room);
    if (!forced && fits.length === 0) return;
    const text = forced ? forced.text : fits[Math.floor(rng() * fits.length)];
    const cx = (b.x + b.w / 2) * TILE;
    const cy = (b.y + b.h / 2) * TILE;
    const wall = 4 + b.height * 3;
    let x = cx;
    let y = cy;
    if (side === 0) y = b.y * TILE + 9;
    if (side === 2) y = (b.y + b.h) * TILE - wall - 9;
    if (side === 3) x = b.x * TILE + 8;
    if (side === 1) x = (b.x + b.w) * TILE - wall - 8;
    this.signs.push({ x, y, text, vertical, color: forced ? forced.color : NEON[Math.floor(rng() * NEON.length)], flicker: rng() < 0.2 });
  }

  private makePark(x0: number, y0: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.GRASS);
    this.ring(x0, y0, S, Tile.SIDEWALK);
    this.fill(x0, y0 + 6, S, 1, Tile.SIDEWALK);
    this.fill(x0 + 6, y0, 1, S, Tile.SIDEWALK);
    if (rng() < 0.7) {
      // pond in one quadrant
      const qx = x0 + (rng() < 0.5 ? 1 : 7);
      const qy = y0 + (rng() < 0.5 ? 1 : 7);
      for (let ty = 0; ty < 5; ty++)
        for (let tx = 0; tx < 5; tx++) {
          const d = Math.hypot(tx - 2, ty - 2);
          if (d < 2.2) this.set(qx + tx, qy + ty, Tile.WATER);
        }
    }
    for (let ty = y0 + 1; ty < y0 + S - 1; ty++)
      for (let tx = x0 + 1; tx < x0 + S - 1; tx++) {
        if (this.get(tx, ty) !== Tile.GRASS || rng() > 0.3) continue;
        this.props.push({ kind: 'tree', x: tx * TILE + 8 + rng() * 16, y: ty * TILE + 8 + rng() * 16, r: 7, solid: true, angle: 0, variant: Math.floor(rng() * 3) });
      }
    for (let i = 2; i < S - 1; i += 3) {
      this.props.push({ kind: 'bench', x: (x0 + i) * TILE + 16, y: (y0 + 6) * TILE + 4, r: 0, solid: false, angle: 0, variant: 0 });
    }
    this.sidewalkProps(x0, y0, S, rng, false);
  }

  private parkedCar(x: number, y: number, angle: number, rng: () => number) {
    this.props.push({ kind: 'parked', x, y, r: 0, solid: false, angle, variant: Math.floor(rng() * 1000) });
    const c = Math.cos(angle) * 7;
    const s = Math.sin(angle) * 7;
    this.props.push({ kind: 'collider', x: x + c, y: y + s, r: 8, solid: true, angle, variant: 0 });
    this.props.push({ kind: 'collider', x: x - c, y: y - s, r: 8, solid: true, angle, variant: 0 });
  }

  private makeParking(x0: number, y0: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.PARKING);
    this.ring(x0, y0, S, Tile.SIDEWALK);
    // entrances so the lot is a genuine shortcut
    this.fill(x0 + 5, y0, 2, 1, Tile.PARKING);
    this.fill(x0 + 5, y0 + S - 1, 2, 1, Tile.PARKING);
    this.fill(x0, y0 + 5, 1, 2, Tile.PARKING);
    this.fill(x0 + S - 1, y0 + 5, 1, 2, Tile.PARKING);
    for (const row of [1, 9]) {
      for (let i = 1; i < S - 1; i++) {
        if (i === 5 || i === 6) continue;
        const x = (x0 + i) * TILE + 16;
        const y = (y0 + row) * TILE + 32;
        this.bays.push({ x, y });
        if (rng() < 0.6) this.parkedCar(x, y, row === 1 ? Math.PI / 2 : -Math.PI / 2, rng);
      }
    }
    this.sidewalkProps(x0, y0, S, rng, false);
  }

  private makeConstruction(x0: number, y0: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.GRAVEL);
    for (let k = 0; k < 4; k++) {
      const cx = x0 + 2 + rng() * 8;
      const cy = y0 + 2 + rng() * 8;
      const r = 1.2 + rng() * 1.6;
      for (let ty = y0; ty < y0 + S; ty++)
        for (let tx = x0; tx < x0 + S; tx++) if (Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) < r) this.set(tx, ty, Tile.MUD);
    }
    const b = this.addBuilding(x0 + 8, y0 + 8, 3, 2, 1, 'office', rng);
    b.style = 5;
    for (let i = 0; i < S; i += 2) {
      this.props.push({ kind: 'cone', x: (x0 + i) * TILE + 16, y: y0 * TILE + 6, r: 0, solid: false, angle: 0, variant: 0 });
      this.props.push({ kind: 'cone', x: (x0 + i) * TILE + 16, y: (y0 + S) * TILE - 6, r: 0, solid: false, angle: 0, variant: 0 });
    }
    for (let i = 0; i < 3; i++)
      this.props.push({ kind: 'barrier', x: (x0 + 2 + i * 3) * TILE, y: (y0 + 4) * TILE, r: 0, solid: false, angle: rng() * Math.PI, variant: 0 });
  }

  private makeFestival(x0: number, y0: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.PLAZA);
    const stage = this.addBuilding(x0 + 2, y0 + 8, 8, 3, 2, 'stage', rng);
    stage.style = 4;
    this.signs.push({ x: (x0 + 6) * TILE, y: (y0 + 8) * TILE + 9, text: 'NEON BAY FESTIVAL', color: 0xff2bd6, vertical: false, flicker: false });
    this.beams.push(
      { x: (x0 + 2.5) * TILE, y: (y0 + 8.5) * TILE, color: 0xff2bd6, phase: 0 },
      { x: (x0 + 6) * TILE, y: (y0 + 8.3) * TILE, color: 0x2bf0ff, phase: 2 },
      { x: (x0 + 9.5) * TILE, y: (y0 + 8.5) * TILE, color: 0xffe02b, phase: 4 },
    );
    // food trucks
    this.parkedCar((x0 + 1) * TILE, (y0 + 5) * TILE, Math.PI / 2, rng);
    this.parkedCar((x0 + 11) * TILE, (y0 + 5) * TILE, -Math.PI / 2, rng);
    for (let i = 1; i < S; i += 3) {
      this.props.push({ kind: 'lamp', x: (x0 + i) * TILE + 16, y: y0 * TILE + 6, r: 3, solid: true, angle: -Math.PI / 2, variant: 1 });
    }
  }

  private makeGarage(x0: number, y0: number, rng: () => number) {
    const S = BLOCK - ROAD_W;
    this.fill(x0, y0, S, S, Tile.SIDEWALK);
    this.fill(x0, y0, S, 5, Tile.PARKING);
    const b = this.addBuilding(x0 + 1, y0 + 5, 10, 6, 2, 'garage', rng);
    b.style = 3;
    this.signs.push({ x: (x0 + 6) * TILE, y: (y0 + 5) * TILE + 9, text: 'GARAGE', color: 0x2bf0ff, vertical: false, flicker: false });
    this.zones.garage = { x: (x0 + 6) * TILE, y: (y0 + 2.5) * TILE };
    this.parkedCar((x0 + 1) * TILE + 16, (y0 + 2) * TILE, Math.PI / 2, rng);
    this.parkedCar((x0 + 10) * TILE + 16, (y0 + 2) * TILE, Math.PI / 2, rng);
    this.sidewalkProps(x0, y0, S, rng, false);
  }

  private makeCoast(rng: () => number) {
    for (let ty = 0; ty < MAP_H; ty++) {
      this.set(COAST_X, ty, Tile.BOARDWALK);
      for (let tx = COAST_X + 1; tx < COAST_X + 5; tx++) this.set(tx, ty, Tile.SAND);
      for (let tx = COAST_X + 5; tx < MAP_W; tx++) this.set(tx, ty, Tile.WATER);
      // wavy shoreline
      if (rng() < 0.35) this.set(COAST_X + 4, ty, Tile.WATER);
      if (ty % 4 === 2) this.props.push({ kind: 'lamp', x: COAST_X * TILE + 6, y: ty * TILE + 16, r: 3, solid: true, angle: Math.PI, variant: 0 });
      if (rng() < 0.22) this.props.push({ kind: 'palm', x: (COAST_X + 1.5 + rng() * 2) * TILE, y: ty * TILE + rng() * TILE, r: 5, solid: true, angle: rng() * Math.PI * 2, variant: 0 });
    }
  }
}
