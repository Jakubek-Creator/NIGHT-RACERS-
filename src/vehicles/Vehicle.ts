import Phaser from 'phaser';
import { DEPTH } from '../config';
import { clamp, wrapAngle } from '../core/math';
import type { Body } from '../physics/Collision';
import type { CityMap } from '../world/CityMap';
import { SURFACES, Surface } from '../world/Tiles';
import type { VehicleDef, VehicleStats } from './VehicleData';

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

/** Player / rival car: reusable arcade physics component + its sprites and lights. */
export class Vehicle implements Body {
  x: number;
  y: number;
  angle: number;
  vx = 0;
  vy = 0;
  spin = 0;
  yawRate = 0;
  radius: number;
  circleOffset: number;
  mass: number;
  len: number;
  wid: number;

  input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  forward = 0; // signed forward speed
  slip = 0; // lateral speed magnitude
  damage = 0; // 0..100
  surface: Surface = SURFACES[0];
  braking = false;

  readonly stats: VehicleStats;
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly coneL: Phaser.GameObjects.Image;
  readonly tailL: Phaser.GameObjects.Image;
  readonly tailR: Phaser.GameObjects.Image;
  readonly underglow?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, readonly def: VehicleDef, x: number, y: number, angle: number, opts: { underglow?: number } = {}) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.stats = def.stats;
    this.len = def.look.len;
    this.wid = def.look.wid;
    this.radius = this.wid / 2;
    this.circleOffset = this.len / 2 - this.radius;
    this.mass = def.stats.mass;
    const key = 'car_' + def.id;
    this.shadow = scene.add.image(x, y, key).setTint(0x000000).setAlpha(0.5).setDepth(DEPTH.shadow);
    if (opts.underglow !== undefined)
      this.underglow = scene.add.image(x, y, 'glow').setTint(opts.underglow).setAlpha(0.55).setDepth(DEPTH.underglow).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(x, y, key).setDepth(DEPTH.car);
    this.coneL = scene.add.image(x, y, 'cone').setOrigin(0, 0.5).setAlpha(0.32).setScale(1.1, 0.75).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
    this.tailL = scene.add.image(x, y, 'glow').setTint(0xff1030).setScale(0.32).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
    this.tailR = scene.add.image(x, y, 'glow').setTint(0xff1030).setScale(0.32).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt: number, map: CityMap, wetness: number) {
    const s = this.stats;
    const inp = this.input;
    const surf = map.surfaceAt(this.x, this.y);
    this.surface = surf;
    const pen = s.offroadPenalty;
    const f = (v: number) => 1 - (1 - v) * pen; // class-dependent surface sensitivity
    const wet = surf.paved ? 1 - 0.22 * wetness : 1;
    const dmg = 1 - (this.damage / 100) * 0.25;
    const grip = s.grip * f(surf.grip) * wet;
    const maxF = s.maxSpeed * f(surf.maxSpeed) * dmg;
    const accel = s.accel * f(surf.accel) * dmg;

    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const rx = -fy;
    const ry = fx;
    let vf = this.vx * fx + this.vy * fy;
    let vr = this.vx * rx + this.vy * ry;

    // engine & brakes
    this.braking = false;
    if (inp.throttle > 0 && vf < maxF) {
      const k = vf > 0 ? 1 - 0.65 * (vf / maxF) ** 2 : 1.4;
      vf = Math.min(maxF, vf + accel * inp.throttle * k * dt);
    }
    if (inp.brake > 0) {
      if (vf > 8) {
        vf = Math.max(0, vf - s.brake * inp.brake * dt);
        this.braking = true;
      } else if (vf > -s.reverse && !inp.handbrake) vf -= accel * 0.6 * inp.brake * dt;
    }
    // drag, rolling resistance, over-speed bleed (e.g. leaving the road)
    vf -= vf * (s.drag + surf.drag * pen) * dt;
    if (inp.throttle === 0 && inp.brake === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 60 * dt);
    if (vf > maxF) vf -= (vf - maxF) * 2.2 * dt;
    if (inp.handbrake) {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), 140 * dt);
      this.braking = true;
    }

    // lateral grip: handbrake lets the rear step out for drifts
    const latGrip = inp.handbrake ? s.driftGrip : grip;
    const keep = Math.exp(-latGrip * dt);
    const lost = vr * (1 - keep);
    vr -= lost;
    if (vf >= 0) vf += Math.abs(lost) * 0.3; // conserve some momentum through slides

    // steering
    const sf = clamp(Math.abs(vf) / 90, 0, 1);
    const hs = 1 - 0.45 * clamp(Math.abs(vf) / s.maxSpeed, 0, 1);
    let turn = inp.steer * s.turn * sf * hs * (vf >= 0 ? 1 : -1);
    if (inp.handbrake && Math.abs(vf) > 80) turn *= 1.45;
    if (surf.offroad) turn *= 0.85 + 0.15 * (1 - pen);
    this.yawRate += (turn - this.yawRate) * Math.min(1, 12 * dt);
    this.angle = wrapAngle(this.angle + (this.yawRate + this.spin) * dt);
    this.spin *= Math.exp(-5 * dt);

    this.vx = fx * vf + rx * vr;
    this.vy = fy * vf + ry * vr;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.forward = vf;
    this.slip = Math.abs(vr);
  }

  sync() {
    const { x, y, angle } = this;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.sprite.setPosition(x, y).setRotation(angle);
    this.shadow.setPosition(x + 3, y + 4).setRotation(angle);
    this.underglow?.setPosition(x, y).setRotation(angle).setScale(this.len / 40, this.wid / 34);
    const hl = this.len / 2 - 1;
    this.coneL.setPosition(x + c * hl, y + s * hl).setRotation(angle);
    const tb = this.len / 2 - 1;
    const side = this.wid / 2 - 3;
    this.tailL.setPosition(x - c * tb - s * side, y - s * tb + c * side);
    this.tailR.setPosition(x - c * tb + s * side, y - s * tb - c * side);
    const a = this.braking ? 0.95 : 0.35;
    const sc = this.braking ? 0.5 : 0.3;
    this.tailL.setAlpha(a).setScale(sc);
    this.tailR.setAlpha(a).setScale(sc);
    this.sprite.setTint(this.damage > 60 ? 0xb0a0a0 : 0xffffff);
  }

  place(x: number, y: number, angle: number) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = this.vy = this.spin = this.yawRate = 0;
    this.sync();
  }

  destroy() {
    for (const o of [this.sprite, this.shadow, this.coneL, this.tailL, this.tailR, this.underglow]) o?.destroy();
  }
}
