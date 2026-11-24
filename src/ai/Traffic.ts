import Phaser from 'phaser';
import { DEPTH, DIRS, GRID, ROAD_W, TILE, nodePos } from '../config';
import type { Body } from '../physics/Collision';
import { lightState } from './TrafficLights';
import { TRAFFIC_LOOKS } from '../vehicles/VehicleData';

interface Seg {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  quad: boolean;
  len: number;
}

const HALF = (ROAD_W / 2) * TILE; // intersection half-size
const LANE = TILE; // lane centre offset from road centre

function line(x0: number, y0: number, x1: number, y1: number): Seg {
  return { x0, y0, x1, y1, cx: 0, cy: 0, quad: false, len: Math.hypot(x1 - x0, y1 - y0) };
}

function quad(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Seg {
  let len = 0;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return { x0, y0, cx, cy, x1, y1, quad: true, len };
}

const right = (d: number) => DIRS[(d + 1) % 4];
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < GRID && j < GRID;

/** Lane point where a car heading `d` leaves intersection (i,j). */
function exitPoint(i: number, j: number, d: number) {
  return { x: nodePos(i) + DIRS[d].x * HALF + right(d).x * LANE, y: nodePos(j) + DIRS[d].y * HALF + right(d).y * LANE };
}
/** Lane point where a car heading `d` reaches the stop line of intersection (i,j). */
function entryPoint(i: number, j: number, d: number) {
  return { x: nodePos(i) - DIRS[d].x * HALF + right(d).x * LANE, y: nodePos(j) - DIRS[d].y * HALF + right(d).y * LANE };
}

export class TrafficCar implements Body {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  spin = 0;
  mass = 1.2;
  radius = 8;
  circleOffset = 7;
  len = 30;
  speed = 0;
  cruise = 150;
  dir = 0;
  nextDir = 0;
  ti = 0; // target intersection
  tj = 0;
  seg: Seg = line(0, 0, 1, 0);
  s = 0;
  turning = false;
  committed = false;
  bump = 0;
  stuck = 0;
  ghost = 0;
  visible = true;
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly cone: Phaser.GameObjects.Image;
  readonly tail: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.image(0, 0, 'traffic_0').setTint(0).setAlpha(0.5).setDepth(DEPTH.shadow);
    this.sprite = scene.add.image(0, 0, 'traffic_0').setDepth(DEPTH.car);
    this.cone = scene.add.image(0, 0, 'cone').setOrigin(0, 0.5).setAlpha(0.22).setScale(0.9, 0.6).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
    this.tail = scene.add.image(0, 0, 'glow').setTint(0xff1030).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
    this.setVisible(false);
  }

  setLook(i: number) {
    const look = TRAFFIC_LOOKS[i];
    this.sprite.setTexture('traffic_' + i);
    this.shadow.setTexture('traffic_' + i);
    this.len = look.len;
    this.radius = look.wid / 2;
    this.circleOffset = look.len / 2 - this.radius;
    this.mass = look.len > 32 ? 1.6 : 1.2;
  }

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    for (const o of [this.sprite, this.shadow, this.cone, this.tail]) o.setVisible(v);
  }

  pointAt(s: number) {
    const g = this.seg;
    const t = Math.min(1, s / g.len);
    if (!g.quad) {
      this.x = g.x0 + (g.x1 - g.x0) * t;
      this.y = g.y0 + (g.y1 - g.y0) * t;
      this.angle = Math.atan2(g.y1 - g.y0, g.x1 - g.x0);
    } else {
      const u = 1 - t;
      this.x = u * u * g.x0 + 2 * u * t * g.cx + t * t * g.x1;
      this.y = u * u * g.y0 + 2 * u * t * g.cy + t * t * g.y1;
      const dx = 2 * u * (g.cx - g.x0) + 2 * t * (g.x1 - g.cx);
      const dy = 2 * u * (g.cy - g.y0) + 2 * t * (g.y1 - g.cy);
      this.angle = Math.atan2(dy, dx);
    }
  }

  sync(braking: boolean, night: number) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    this.sprite.setPosition(this.x, this.y).setRotation(this.angle);
    this.shadow.setPosition(this.x + 3, this.y + 4).setRotation(this.angle);
    this.cone.setPosition(this.x + c * (this.len / 2), this.y + s * (this.len / 2)).setRotation(this.angle).setAlpha(0.26 * night);
    this.shadow.setAlpha(0.45 * (1 - 0.6 * night));
    this.tail.setPosition(this.x - c * (this.len / 2), this.y - s * (this.len / 2)).setScale(braking ? 0.55 : 0.4, braking ? 0.7 : 0.5).setRotation(this.angle);
    this.tail.setAlpha(braking ? 0.9 : 0.1 + 0.25 * night);
  }
}

/**
 * Civilian traffic: lane-following cars on the road graph. They obey traffic lights,
 * queue behind other cars, turn at intersections and are recycled around the player.
 * Distant cars run a cheap update and are hidden.
 */
export class TrafficSystem {
  readonly cars: TrafficCar[] = [];
  private time = 0;

  constructor(private scene: Phaser.Scene, count: number) {
    for (let i = 0; i < count; i++) this.cars.push(new TrafficCar(scene));
  }

  setCount(count: number) {
    while (this.cars.length < count) this.cars.push(new TrafficCar(this.scene));
    this.cars.forEach((c, i) => {
      if (i >= count && c.active) this.despawn(c);
    });
  }

  private despawn(c: TrafficCar) {
    c.active = false;
    c.setVisible(false);
  }

  private spawn(c: TrafficCar, px: number, py: number, view: Phaser.Geom.Rectangle, minR: number, maxR: number): boolean {
    for (let attempt = 0; attempt < 12; attempt++) {
      const i = Math.floor(Math.random() * GRID);
      const j = Math.floor(Math.random() * GRID);
      const d = Math.floor(Math.random() * 4);
      const ni = i + DIRS[d].x;
      const nj = j + DIRS[d].y;
      if (!inGrid(ni, nj)) continue;
      const a = exitPoint(i, j, d);
      const b = entryPoint(ni, nj, d);
      const s = Math.random() * 0.8 * Math.hypot(b.x - a.x, b.y - a.y);
      const x = a.x + DIRS[d].x * s;
      const y = a.y + DIRS[d].y * s;
      const dist = Math.hypot(x - px, y - py);
      if (dist < minR || dist > maxR) continue;
      if (view.width > 0 && x > view.x - 48 && x < view.right + 48 && y > view.y - 48 && y < view.bottom + 48) continue;
      if (this.cars.some((o) => o.active && Math.abs(o.x - x) + Math.abs(o.y - y) < 60)) continue;
      c.active = true;
      c.dir = d;
      c.ti = ni;
      c.tj = nj;
      c.seg = line(a.x, a.y, b.x, b.y);
      c.s = s;
      c.turning = false;
      c.committed = false;
      c.bump = c.stuck = c.ghost = 0;
      c.cruise = 130 + Math.random() * 60;
      c.speed = c.cruise * 0.7;
      c.setLook(Math.floor(Math.random() * TRAFFIC_LOOKS.length));
      c.pointAt(s);
      return true;
    }
    return false;
  }

  private chooseDir(i: number, j: number, d: number): number {
    const opts: number[] = [];
    for (const [nd, w] of [[d, 4], [(d + 1) % 4, 2], [(d + 3) % 4, 1.5]] as const) {
      if (inGrid(i + DIRS[nd].x, j + DIRS[nd].y)) for (let k = 0; k < w * 2; k++) opts.push(nd);
    }
    if (opts.length === 0) return (d + 2) % 4;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  /** Remove any car within r of a point (used to clear the race grid). */
  clearArea(x: number, y: number, r: number) {
    for (const c of this.cars) if (c.active && Math.hypot(c.x - x, c.y - y) < r) this.despawn(c);
  }

  update(dt: number, px: number, py: number, view: Phaser.Geom.Rectangle, others: Body[], night = 0) {
    this.time += dt;
    for (const c of this.cars) {
      if (!c.active) {
        this.spawn(c, px, py, view, 450, 1300);
        continue;
      }
      const dist = Math.hypot(c.x - px, c.y - py);
      if (dist > 1700) {
        this.despawn(c);
        continue;
      }
      const near = dist < 1100;
      this.step(c, dt, near, others);
      const vis = c.x > view.x - 64 && c.x < view.right + 64 && c.y > view.y - 64 && c.y < view.bottom + 64;
      c.setVisible(vis);
      if (vis) c.sync(c.speed < c.cruise * 0.5, night);
    }
  }

  private step(c: TrafficCar, dt: number, detailed: boolean, others: Body[]) {
    if (c.s >= c.seg.len) {
      if (!c.turning) {
        c.nextDir = this.chooseDir(c.ti, c.tj, c.dir);
        const a = entryPoint(c.ti, c.tj, c.dir);
        const b = exitPoint(c.ti, c.tj, c.nextDir);
        const nx = nodePos(c.ti);
        const ny = nodePos(c.tj);
        if (c.nextDir === c.dir) c.seg = line(a.x, a.y, b.x, b.y);
        else {
          const r1 = right(c.dir);
          const r2 = right(c.nextDir);
          c.seg = quad(a.x, a.y, nx + (r1.x + r2.x) * LANE, ny + (r1.y + r2.y) * LANE, b.x, b.y);
        }
        c.turning = true;
      } else {
        c.dir = c.nextDir;
        const i = c.ti;
        const j = c.tj;
        c.ti += DIRS[c.dir].x;
        c.tj += DIRS[c.dir].y;
        const a = exitPoint(i, j, c.dir);
        const b = entryPoint(c.ti, c.tj, c.dir);
        c.seg = line(a.x, a.y, b.x, b.y);
        c.turning = false;
        c.committed = false;
      }
      c.s = 0;
    }

    let target = c.turning ? c.cruise * (c.nextDir === c.dir ? 1 : 0.55) : c.cruise;

    // traffic lights
    if (!c.turning && !c.committed) {
      const remaining = c.seg.len - c.s;
      if (remaining < 140) {
        const st = lightState(c.ti, c.tj, c.dir % 2, this.time);
        if (st === 'g' || (st === 'y' && remaining < 30)) {
          if (remaining < 20) c.committed = true;
        } else target = Math.min(target, Math.sqrt(2 * 300 * Math.max(0, remaining - 3)));
      }
    }

    // queue behind whatever is ahead (other traffic, the player, rivals)
    let blocked = false;
    if (detailed && c.ghost <= 0) {
      const fx = Math.cos(c.angle);
      const fy = Math.sin(c.angle);
      let gap = Infinity;
      const test = (o: Body) => {
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const along = dx * fx + dy * fy;
        if (along <= 0 || along > 110) return;
        const lat = Math.abs(-dx * fy + dy * fx);
        if (lat < 15) gap = Math.min(gap, along);
      };
      for (const o of this.cars) if (o !== c && o.active) test(o);
      for (const o of others) test(o);
      if (gap < Infinity) {
        const lim = Math.sqrt(2 * 320 * Math.max(0, gap - 34));
        if (lim < target) {
          target = lim;
          blocked = lim < 5;
        }
      }
    }
    if (c.ghost > 0) c.ghost -= dt;

    if (c.bump > 0) {
      c.bump -= dt;
      target = 0;
    }
    if (c.speed < target) c.speed = Math.min(target, c.speed + 110 * dt);
    else c.speed = Math.max(target, c.speed - 480 * dt);

    // deadlock breaker
    if (blocked && c.speed < 2) {
      c.stuck += dt;
      if (c.stuck > 5) {
        c.ghost = 1.5;
        c.stuck = 0;
      }
    } else c.stuck = 0;

    c.s += c.speed * dt;
    c.pointAt(c.s);
    c.vx = Math.cos(c.angle) * c.speed;
    c.vy = Math.sin(c.angle) * c.speed;
  }
}
