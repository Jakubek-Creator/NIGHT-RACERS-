import Phaser from 'phaser';
import { CHUNK_PX, CHUNKS_X, CHUNKS_Y, DEPTH, GRID, ROAD_W, TILE, nodePos } from '../config';
import { lightState } from '../ai/TrafficLights';
import { signTexture } from '../gfx/SpriteFactory';
import type { CityMap } from './CityMap';
import { ChunkRenderer } from './ChunkRenderer';
import { Tile } from './Tiles';

type Anim =
  | { kind: 'flicker'; obj: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; seed: number; base: number }
  | { kind: 'light'; i: number; j: number; axis: number; head: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; last: string }
  | { kind: 'beacon'; obj: Phaser.GameObjects.Image; phase: number }
  | { kind: 'sparkle'; obj: Phaser.GameObjects.Image; phase: number; speed: number }
  | { kind: 'beam'; obj: Phaser.GameObjects.Image; phase: number };

interface Chunk {
  key: string;
  base: Phaser.GameObjects.Image;
  wet: Phaser.GameObjects.Image;
  objects: Phaser.GameObjects.GameObject[];
  anims: Anim[];
}

const LIGHT_TINT: Record<string, number> = { g: 0x2bff7a, y: 0xffc21a, r: 0xff2a3a };

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

  update(view: Phaser.Geom.Rectangle, time: number, wetness: number) {
    const cx0 = Math.floor(view.x / CHUNK_PX);
    const cy0 = Math.floor(view.y / CHUNK_PX);
    const cx1 = Math.floor((view.right - 1) / CHUNK_PX);
    const cy1 = Math.floor((view.bottom - 1) / CHUNK_PX);

    // must-have: visible chunks
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.ensure(cx, cy);
    // preload: one neighbouring chunk per frame
    outer: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++)
      for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (!this.chunks.has(`${cx},${cy}`) && this.ensure(cx, cy)) break outer;
      }
    // unload far
    for (const [key, ch] of this.chunks) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx < cx0 - 2 || cx > cx1 + 2 || cy < cy0 - 2 || cy > cy1 + 2) this.unload(ch);
    }
    this.loadedCount = this.chunks.size;

    const wetA = Math.min(1, wetness) * 0.9;
    for (const ch of this.chunks.values()) {
      ch.wet.setAlpha(wetA);
      ch.wet.setVisible(wetA > 0.02);
      for (const a of ch.anims) this.animate(a, time, wetness);
    }
  }

  private animate(a: Anim, time: number, wetness: number) {
    switch (a.kind) {
      case 'flicker': {
        const s = Math.sin(time * 13 + a.seed) + Math.sin(time * 7.3 + a.seed * 2);
        const off = s > 1.55 || (Math.sin(time * 0.7 + a.seed) > 0.97 && Math.sin(time * 40) > 0);
        a.obj.setAlpha(off ? 0.25 : 1);
        a.glow.setAlpha(off ? 0.05 : a.base * (1 + wetness * 0.4));
        break;
      }
      case 'light': {
        const st = lightState(a.i, a.j, a.axis, time);
        if (st !== a.last) {
          a.last = st;
          a.head.setTexture('tl_' + st);
          a.glow.setTint(LIGHT_TINT[st]);
        }
        break;
      }
      case 'beacon':
        a.obj.setAlpha(Math.sin(time * 3 + a.phase) > 0.6 ? 0.9 : 0.08);
        break;
      case 'sparkle':
        a.obj.setAlpha(Math.max(0, Math.sin(time * a.speed + a.phase)) * 0.5);
        break;
      case 'beam':
        a.obj.setRotation(-Math.PI / 2 + Math.sin(time * 0.6 + a.phase) * 0.9);
        a.obj.setAlpha(0.16 + Math.sin(time * 2.1 + a.phase) * 0.04);
        break;
    }
  }

  private ensure(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= CHUNKS_X || cy >= CHUNKS_Y) return false;
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return false;
    const { base, wet } = this.renderer.render(cx, cy);
    const bk = `chunk_${key}`;
    const wk = `chunkwet_${key}`;
    this.scene.textures.addCanvas(bk, base);
    this.scene.textures.addCanvas(wk, wet);
    const x = cx * CHUNK_PX;
    const y = cy * CHUNK_PX;
    const baseImg = this.scene.add.image(x, y, bk).setOrigin(0).setDepth(DEPTH.ground);
    const wetImg = this.scene.add.image(x, y, wk).setOrigin(0).setDepth(DEPTH.wet).setBlendMode(Phaser.BlendModes.ADD);
    const ch: Chunk = { key, base: baseImg, wet: wetImg, objects: [], anims: [] };
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

    for (const p of this.map.props) {
      if (p.kind !== 'lamp' || !inChunk(p.x, p.y)) continue;
      const hx = p.x + Math.cos(p.angle) * 8;
      const hy = p.y + Math.sin(p.angle) * 8;
      add(this.glow(hx, hy, p.variant === 1 ? 0xff7ad9 : 0xffc47a, 1.5, 0.42));
      add(this.glow(hx, hy, 0xfff0d0, 0.25, 0.9));
    }

    for (const s of this.map.signs) {
      if (!inChunk(s.x, s.y)) continue;
      const key = signTexture(this.scene, s);
      const img = add(this.scene.add.image(s.x, s.y, key).setDepth(DEPTH.sign));
      const gw = add(this.glow(s.x, s.y, s.color, 1, 0.55, DEPTH.sign - 0.1));
      gw.setScale((img.width + 40) / 40, (img.height + 40) / 40);
      if (s.flicker) ch.anims.push({ kind: 'flicker', obj: img, glow: gw, seed: (s.x * 13 + s.y) % 100, base: 0.55 });
    }

    for (const b of this.map.buildings) {
      if (!b.beacon) continue;
      const wall = 4 + b.height * 3;
      const bx = (b.x + b.w) * TILE - wall - 8;
      const by = b.y * TILE + 6;
      if (!inChunk(bx, by)) continue;
      const g = add(this.glow(bx, by, 0xff2030, 0.5, 0.8, DEPTH.sign));
      ch.anims.push({ kind: 'beacon', obj: g, phase: b.seed % 7 });
    }

    // traffic lights at intersections whose centre lies in this chunk
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) {
        const nx = nodePos(i);
        const ny = nodePos(j);
        if (!inChunk(nx, ny)) continue;
        const o = (ROAD_W / 2) * TILE + 6;
        const heads: [number, number, number][] = [
          [nx + o, ny + o, 0], // for eastbound
          [nx - o, ny - o, 0], // westbound
          [nx - o, ny + o, 1], // southbound
          [nx + o, ny - o, 1], // northbound
        ];
        for (const [hx, hy, axis] of heads) {
          const t = this.map.get(Math.floor(hx / TILE), Math.floor(hy / TILE));
          if (t !== Tile.SIDEWALK && t !== Tile.PLAZA && t !== Tile.PARKING) continue;
          const head = add(this.scene.add.image(hx, hy, 'tl_r').setDepth(DEPTH.light));
          const gw = add(this.glow(hx, hy, LIGHT_TINT.r, 0.6, 0.6));
          ch.anims.push({ kind: 'light', i, j, axis, head, glow: gw, last: '' });
        }
      }

    // shimmering water
    for (let k = 0; k < 14; k++) {
      const x = x0 + ((k * 137) % CHUNK_PX);
      const y = y0 + ((k * 211 + 37) % CHUNK_PX);
      if (this.map.get(Math.floor(x / TILE), Math.floor(y / TILE)) !== Tile.WATER) continue;
      const g = add(this.glow(x, y, 0x7ad0ff, 0.35, 0, DEPTH.wet));
      g.setScale(0.6, 0.15);
      ch.anims.push({ kind: 'sparkle', obj: g, phase: k * 1.7, speed: 1 + (k % 3) * 0.6 });
    }

    // festival searchlights
    for (const b of this.map.beams) {
      if (!inChunk(b.x, b.y)) continue;
      const img = add(this.scene.add.image(b.x, b.y, 'cone').setOrigin(0, 0.5).setTint(b.color).setScale(4, 1.4).setDepth(DEPTH.beam).setBlendMode(Phaser.BlendModes.ADD));
      ch.anims.push({ kind: 'beam', obj: img, phase: b.phase });
    }
  }

  private unload(ch: Chunk) {
    ch.base.destroy();
    ch.wet.destroy();
    for (const o of ch.objects) o.destroy();
    this.scene.textures.remove(`chunk_${ch.key}`);
    this.scene.textures.remove(`chunkwet_${ch.key}`);
    this.chunks.delete(ch.key);
  }
}
