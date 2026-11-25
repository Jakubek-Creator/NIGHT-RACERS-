import Phaser from 'phaser';
import { CHUNK_PX, CHUNKS_X, CHUNKS_Y, DEPTH, GRID, ROAD_W, TILE, nodePos } from '../config';
import { lightState } from '../ai/TrafficLights';
import { signTexture } from '../gfx/SpriteFactory';
import type { CityMap } from './CityMap';
import { ChunkRenderer } from './ChunkRenderer';
import { Tile } from './Tiles';

type Anim =
  | { kind: 'lamp'; glow: Phaser.GameObjects.Image; base: number }
  | { kind: 'light'; i: number; j: number; axis: number; head: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; last: string }
  | { kind: 'beacon'; obj: Phaser.GameObjects.Image; phase: number }
  | { kind: 'sparkle'; obj: Phaser.GameObjects.Image; phase: number; speed: number };

interface Chunk {
  key: string;
  base: Phaser.GameObjects.Image;
  wet: Phaser.GameObjects.Image;
  night: Phaser.GameObjects.Image;
  objects: Phaser.GameObjects.GameObject[];
  anims: Anim[];
}

const LIGHT_TINT: Record<string, number> = { g: 0x3cff8a, y: 0xffb31a, r: 0xff3030 };
const LAMP = 0xffc684;

/**
 * Streams the world in 512px chunks: chunks in view are built immediately, the surrounding
 * ring is pre-built one per frame, and far chunks are destroyed (textures freed).
 */
export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  private renderer: ChunkRenderer;
  loadedCount = 0;

  constructor(private scene: Phaser.Scene, private map: CityMap, carCanvas: (v: number) => HTMLCanvasElement) {
    this.renderer = new ChunkRenderer(map, carCanvas);
  }

  update(view: Phaser.Geom.Rectangle, time: number, wetness: number, night: number) {
    const cx0 = Math.floor(view.x / CHUNK_PX);
    const cy0 = Math.floor(view.y / CHUNK_PX);
    const cx1 = Math.floor((view.right - 1) / CHUNK_PX);
    const cy1 = Math.floor((view.bottom - 1) / CHUNK_PX);

    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.ensure(cx, cy);
    outer: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++)
      for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (!this.chunks.has(`${cx},${cy}`) && this.ensure(cx, cy)) break outer;
      }
    for (const [key, ch] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx < cx0 - 2 || cx > cx1 + 2 || cy < cy0 - 2 || cy > cy1 + 2) this.unload(ch);
    }
    this.loadedCount = this.chunks.size;

    const wetA = Math.min(1, wetness) * 0.85;
    for (const ch of this.chunks.values()) {
      ch.wet.setAlpha(wetA).setVisible(wetA > 0.02);
      ch.night.setAlpha(night).setVisible(night > 0.02);
      for (const a of ch.anims) this.animate(a, time, night, wetness);
    }
  }

  private animate(a: Anim, time: number, night: number, wetness: number) {
    switch (a.kind) {
      case 'lamp':
        a.glow.setAlpha(a.base * night * (1 + wetness * 0.3));
        break;
      case 'light': {
        const st = lightState(a.i, a.j, a.axis, time);
        if (st !== a.last) {
          a.last = st;
          a.head.setTexture('tl_' + st);
          a.glow.setTint(LIGHT_TINT[st]);
        }
        a.glow.setAlpha(0.15 + 0.5 * night);
        break;
      }
      case 'beacon':
        a.obj.setAlpha(night > 0.3 && Math.sin(time * 3 + a.phase) > 0.6 ? 0.9 * night : 0);
        break;
      case 'sparkle':
        a.obj.setAlpha(Math.max(0, Math.sin(time * a.speed + a.phase)) * 0.55 * (1 - night * 0.7));
        break;
    }
  }

  private ensure(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) return false;
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return false;
    const { base, wet, night } = this.renderer.render(cx, cy);
    this.scene.textures.addCanvas(`chunk_${key}`, base);
    this.scene.textures.addCanvas(`chunkwet_${key}`, wet);
    this.scene.textures.addCanvas(`chunknight_${key}`, night);
    const x = cx * CHUNK_PX;
    const y = cy * CHUNK_PX;
    const ch: Chunk = {
      key,
      base: this.scene.add.image(x, y, `chunk_${key}`).setOrigin(0).setDepth(DEPTH.ground),
      wet: this.scene.add.image(x, y, `chunkwet_${key}`).setOrigin(0).setDepth(DEPTH.wet),
      night: this.scene.add.image(x, y, `chunknight_${key}`).setOrigin(0).setDepth(DEPTH.night).setBlendMode(Phaser.BlendModes.ADD),
      objects: [],
      anims: [],
    };
    this.populate(ch, x, y);
    this.chunks.set(key, ch);
    return true;
  }

  private glow(x: number, y: number, tint: number, scale: number, alpha: number, depth: number = DEPTH.light) {
    return this.scene.add.image(x, y, 'glow').setTint(tint).setScale(scale).setAlpha(alpha).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  }

  private populate(ch: Chunk, x0: number, y0: number) {
    const inChunk = (x: number, y: number) => x >= x0 && x < x0 + CHUNK_PX && y >= y0 && y < y0 + CHUNK_PX;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      ch.objects.push(o);
      return o;
    };

    // street lamp heads (lit after dusk; the ground pool is baked into the night layer)
    for (const p of this.map.props) {
      if (p.kind !== 'lamp' || p.knocked || !inChunk(p.x, p.y)) continue;
      const hx = p.x + Math.cos(p.angle) * 8;
      const hy = p.y + Math.sin(p.angle) * 8;
      ch.anims.push({ kind: 'lamp', glow: add(this.glow(hx, hy, LAMP, 0.6, 0)), base: 0.8 });
    }

    // painted shop signs; some are lit at night
    for (const s of this.map.signs) {
      if (!inChunk(s.x, s.y)) continue;
      const img = add(this.scene.add.image(s.x, s.y, signTexture(this.scene, s)).setDepth(DEPTH.sign));
      if (s.lit) {
        const g = add(this.glow(s.x, s.y, 0xfff0d0, 1, 0));
        g.setScale((img.width + 16) / 48, (img.height + 16) / 48);
        ch.anims.push({ kind: 'lamp', glow: g, base: 0.35 });
      }
    }

    // red aircraft-warning beacons on tall buildings (night only)
    for (const b of this.map.buildings) {
      if (!b.beacon) continue;
      const wall = 4 + b.height * 3;
      const bx = (b.x + b.w) * TILE - wall - 8;
      const by = b.y * TILE + 6;
      if (!inChunk(bx, by)) continue;
      ch.anims.push({ kind: 'beacon', obj: add(this.glow(bx, by, 0xff2020, 0.45, 0)), phase: b.seed % 7 });
    }

    // traffic signals
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) {
        const nx = nodePos(i);
        const ny = nodePos(j);
        if (!inChunk(nx, ny)) continue;
        const o = (ROAD_W / 2) * TILE + 6;
        const heads: [number, number, number][] = [
          [nx + o, ny + o, 0],
          [nx - o, ny - o, 0],
          [nx - o, ny + o, 1],
          [nx + o, ny - o, 1],
        ];
        for (const [hx, hy, axis] of heads) {
          const t = this.map.get(Math.floor(hx / TILE), Math.floor(hy / TILE));
          if (t !== Tile.SIDEWALK && t !== Tile.PLAZA && t !== Tile.PARKING) continue;
          const head = add(this.scene.add.image(hx, hy, 'tl_r').setDepth(DEPTH.light));
          const gw = add(this.glow(hx, hy, LIGHT_TINT.r, 0.5, 0.2));
          ch.anims.push({ kind: 'light', i, j, axis, head, glow: gw, last: '' });
        }
      }

    // sun glints on the bay
    for (let k = 0; k < 14; k++) {
      const x = x0 + ((k * 137) % CHUNK_PX);
      const y = y0 + ((k * 211 + 37) % CHUNK_PX);
      if (this.map.get(Math.floor(x / TILE), Math.floor(y / TILE)) !== Tile.WATER) continue;
      const g = add(this.glow(x, y, 0xffffff, 0.35, 0, DEPTH.wet));
      g.setScale(0.5, 0.12);
      ch.anims.push({ kind: 'sparkle', obj: g, phase: k * 1.7, speed: 1 + (k % 3) * 0.6 });
    }
  }

  /** Rebuild every loaded chunk that draws something near (x, y). */
  refreshAround(x: number, y: number) {
    const m = 60;
    for (let cy = Math.floor((y - m) / CHUNK_PX); cy <= Math.floor((y + m) / CHUNK_PX); cy++)
      for (let cx = Math.floor((x - m) / CHUNK_PX); cx <= Math.floor((x + m) / CHUNK_PX); cx++) {
        const ch = this.chunks.get(`${cx},${cy}`);
        if (!ch) continue;
        this.unload(ch, false);
        this.ensure(cx, cy);
      }
  }

  private unload(ch: Chunk, restore = true) {
    if (restore) {
      // knocked-over street furniture is back in place next time you come by
      const [cx, cy] = ch.key.split(',').map(Number);
      for (const p of this.map.props)
        if (p.knocked && Math.floor(p.x / CHUNK_PX) === cx && Math.floor(p.y / CHUNK_PX) === cy) p.knocked = false;
    }
    ch.base.destroy();
    ch.wet.destroy();
    ch.night.destroy();
    for (const o of ch.objects) o.destroy();
    this.scene.textures.remove(`chunk_${ch.key}`);
    this.scene.textures.remove(`chunkwet_${ch.key}`);
    this.scene.textures.remove(`chunknight_${ch.key}`);
    this.chunks.delete(ch.key);
  }
}
