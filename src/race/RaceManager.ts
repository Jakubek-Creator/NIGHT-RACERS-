import Phaser from 'phaser';
import { DEPTH, TILE, nodePos } from '../config';
import type { CityMap } from '../world/CityMap';
import { VEHICLES } from '../vehicles/VehicleData';
import { Vehicle } from '../vehicles/Vehicle';
import { RIVALS, RacerAI } from './RacerAI';

export interface Checkpoint {
  x: number;
  y: number;
  r: number;
}

export interface RaceDef {
  id: string;
  name: string;
  type: 'STREET';
  laps: number;
  route: [number, number][]; // intersections, in order, after the start line
  rewards: number[];
  rep: number[];
}

export const NEON_SPRINT: RaceDef = {
  id: 'neon-loop',
  name: 'NEON LOOP',
  type: 'STREET',
  laps: 2,
  route: [[6, 3], [6, 6], [4, 6], [4, 7], [1, 7], [1, 3], [3, 3]],
  rewards: [1500, 900, 500, 200],
  rep: [120, 70, 40, 15],
};

export interface Entry {
  name: string;
  car: Vehicle;
  ai?: RacerAI;
  isPlayer: boolean;
  lap: number;
  cp: number;
  finished: boolean;
  finishTime: number;
  color: number;
}

export type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

/** Circuit street race: start grid, checkpoints in order, laps, live positions, AI rivals. */
export class RaceManager {
  state: RaceState = 'idle';
  entries: Entry[] = [];
  checkpoints: Checkpoint[] = [];
  time = 0;
  countdown = 0;
  readonly startX: number;
  readonly startY: number;
  private gfx: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Image;
  bestLapStart = 0;
  lastLapTimes: number[] = [];

  constructor(private scene: Phaser.Scene, _map: CityMap, readonly def: RaceDef = NEON_SPRINT) {
    this.startX = (3 * 16 + 2 + 8) * TILE;
    this.startY = nodePos(3);
    for (const [i, j] of def.route) this.checkpoints.push({ x: nodePos(i), y: nodePos(j), r: 110 });
    this.checkpoints.push({ x: this.startX, y: this.startY, r: 90 });
    this.gfx = scene.add.graphics().setDepth(DEPTH.marker);
    this.glow = scene.add.image(0, 0, 'glow').setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  get player(): Entry | undefined {
    return this.entries.find((e) => e.isPlayer);
  }

  get active() {
    return this.state !== 'idle';
  }

  start(player: Vehicle) {
    const roster = VEHICLES.filter((v) => v.id !== player.def.id);
    Phaser.Utils.Array.Shuffle(roster);
    const rivals = Phaser.Utils.Array.Shuffle(RIVALS.slice()).slice(0, 3);
    const slots = [
      [this.startX - 40, this.startY - 30],
      [this.startX - 40, this.startY + 30],
      [this.startX - 100, this.startY - 30],
      [this.startX - 100, this.startY + 30],
    ];
    const colors = [0xff2bd6, 0xffe02b, 0x7dff5a, 0xff6a2b];
    this.entries = [];
    const points = this.checkpoints.map((c) => ({ x: c.x, y: c.y }));
    rivals.forEach((p, k) => {
      const [x, y] = slots[k];
      const car = new Vehicle(this.scene, roster[k], x, y, 0);
      car.sync();
      this.entries.push({ name: p.name, car, ai: new RacerAI(car, p, points), isPlayer: false, lap: 0, cp: 0, finished: false, finishTime: 0, color: colors[k + 1] });
    });
    player.place(slots[3][0], slots[3][1], 0);
    player.damage = Math.min(player.damage, 40);
    this.entries.push({ name: 'YOU', car: player, isPlayer: true, lap: 0, cp: 0, finished: false, finishTime: 0, color: 0x2bf0ff });
    this.state = 'countdown';
    this.countdown = 3.2;
    this.time = 0;
    this.lastLapTimes = [];
    this.bestLapStart = 0;
    this.drawCheckpoint();
  }

  /** Called every frame. Returns events for the HUD. */
  update(dt: number, isVisible: (x: number, y: number) => boolean = () => false): { finished?: boolean; lap?: number; go?: boolean } {
    const ev: { finished?: boolean; lap?: number; go?: boolean } = {};
    if (this.state === 'idle') return ev;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      for (const e of this.entries) e.car.input = { throttle: 0, brake: 0, steer: 0, handbrake: true };
      if (this.countdown <= 0) {
        this.state = 'running';
        ev.go = true;
      }
      return ev;
    }
    this.time += dt;
    const leader = this.player?.car;
    for (const e of this.entries) {
      if (e.ai) {
        const behind = leader ? Math.hypot(leader.x - e.car.x, leader.y - e.car.y) : 0;
        const ahead = this.progress(e) > (this.player ? this.progress(this.player) : 0);
        const rubber = ahead ? (behind > 500 ? 0.93 : 1) : behind > 500 ? 1.06 : 1;
        if (e.finished) e.car.input = { throttle: 0, brake: 0.4, steer: 0, handbrake: false };
        else e.ai.drive(dt, rubber, !isVisible(e.car.x, e.car.y));
      }
      if (e.finished) continue;
      const cp = this.checkpoints[e.cp];
      if (Math.hypot(e.car.x - cp.x, e.car.y - cp.y) < cp.r) {
        e.cp++;
        if (e.cp >= this.checkpoints.length) {
          e.cp = 0;
          e.lap++;
          if (e.isPlayer) {
            this.lastLapTimes.push(this.time - this.bestLapStart);
            this.bestLapStart = this.time;
            ev.lap = e.lap;
          }
          if (e.lap >= this.def.laps) {
            e.finished = true;
            e.finishTime = this.time;
            if (e.isPlayer) {
              this.state = 'finished';
              ev.finished = true;
            }
          }
        }
        if (e.isPlayer) this.drawCheckpoint();
      }
    }
    return ev;
  }

  progress(e: Entry): number {
    if (e.finished) return 1e9 - e.finishTime;
    const cp = this.checkpoints[e.cp];
    return (e.lap * this.checkpoints.length + e.cp) * 10000 - Math.hypot(e.car.x - cp.x, e.car.y - cp.y);
  }

  standings(): Entry[] {
    return this.entries.slice().sort((a, b) => this.progress(b) - this.progress(a));
  }

  position(): number {
    return this.standings().findIndex((e) => e.isPlayer) + 1;
  }

  nextCheckpoint(): Checkpoint | undefined {
    const p = this.player;
    if (!p || this.state === 'idle') return undefined;
    return this.checkpoints[p.cp];
  }

  private drawCheckpoint() {
    const g = this.gfx;
    g.clear();
    const p = this.player;
    if (!p || p.finished) {
      this.glow.setVisible(false);
      return;
    }
    const cp = this.checkpoints[p.cp];
    const after = this.checkpoints[(p.cp + 1) % this.checkpoints.length];
    const isFinish = p.cp === this.checkpoints.length - 1 && p.lap === this.def.laps - 1;
    const col = isFinish ? 0xffffff : 0xffe02b;
    if (p.cp === this.checkpoints.length - 1) {
      // chequered start/finish line across the road
      for (let i = 0; i < 8; i++)
        for (let k = 0; k < 2; k++) {
          g.fillStyle((i + k) % 2 ? 0xffffff : 0x111111, 0.85);
          g.fillRect(cp.x - 8 + k * 8, cp.y - 64 + i * 16, 8, 16);
        }
    }
    g.lineStyle(4, col, 0.9);
    g.strokeCircle(cp.x, cp.y, 46);
    g.lineStyle(2, col, 0.4);
    g.strokeCircle(cp.x, cp.y, 56);
    // chevron toward the following checkpoint
    const a = Math.atan2(after.y - cp.y, after.x - cp.x);
    g.fillStyle(col, 0.85);
    for (let k = 0; k < 2; k++) {
      const d = k * 14 - 6;
      const bx = cp.x + Math.cos(a) * d;
      const by = cp.y + Math.sin(a) * d;
      g.fillTriangle(
        bx + Math.cos(a) * 10, by + Math.sin(a) * 10,
        bx + Math.cos(a + 2.4) * 12, by + Math.sin(a + 2.4) * 12,
        bx + Math.cos(a - 2.4) * 12, by + Math.sin(a - 2.4) * 12,
      );
    }
    this.glow.setPosition(cp.x, cp.y).setTint(col).setScale(3).setAlpha(0.35).setVisible(true);
  }

  pulse(time: number) {
    if (this.glow.visible) this.glow.setAlpha(0.25 + Math.sin(time * 6) * 0.12);
  }

  /** Remove rivals and reset. */
  end() {
    for (const e of this.entries) if (!e.isPlayer) e.car.destroy();
    this.entries = [];
    this.state = 'idle';
    this.gfx.clear();
    this.glow.setVisible(false);
  }

  rivals(): Vehicle[] {
    return this.entries.filter((e) => !e.isPlayer).map((e) => e.car);
  }
}
