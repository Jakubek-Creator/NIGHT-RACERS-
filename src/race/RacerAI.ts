import { clamp, wrapAngle } from '../core/math';
import type { Vehicle } from '../vehicles/Vehicle';

export interface Personality {
  name: string;
  skill: number; // 0.85..1 — cornering & top speed
  aggression: number; // later braking
  line: number; // lateral offset preference (px)
}

export const RIVALS: Personality[] = [
  { name: 'VIPER', skill: 0.97, aggression: 0.9, line: 10 },
  { name: 'MIRAGE', skill: 0.93, aggression: 0.4, line: -14 },
  { name: 'DOC TORQUE', skill: 0.9, aggression: 0.7, line: 18 },
  { name: 'LUNA', skill: 0.95, aggression: 0.55, line: -6 },
];

/** Waypoint-following race driver with braking for corners and stuck recovery. */
export class RacerAI {
  target = 0;
  private stuckT = 0;
  private reverseT = 0;
  private sinceProgress = 0;

  constructor(readonly v: Vehicle, readonly p: Personality, private points: { x: number; y: number }[]) {}

  /** canRescue: the car is off-screen, so a stuck rival may be quietly put back on the route. */
  drive(dt: number, rubber: number, canRescue: boolean) {
    const v = this.v;
    const n = this.points.length;
    let tgt = this.points[this.target % n];
    const switchR = Math.min(150, Math.max(70, 60 + Math.abs(v.forward) * 0.25));
    if (Math.hypot(tgt.x - v.x, tgt.y - v.y) < switchR) {
      this.target++;
      this.sinceProgress = 0;
      tgt = this.points[this.target % n];
    }
    const nxt = this.points[(this.target + 1) % n];
    const dx = tgt.x - v.x;
    const dy = tgt.y - v.y;
    const d = Math.hypot(dx, dy);

    this.sinceProgress += dt;
    if (this.sinceProgress > 9 && canRescue) {
      const prev = this.points[(this.target - 1 + n) % n];
      const a = Math.atan2(tgt.y - prev.y, tgt.x - prev.x);
      v.place(prev.x + Math.cos(a) * 70 - Math.sin(a) * 28, prev.y + Math.sin(a) * 70 + Math.cos(a) * 28, a);
      this.sinceProgress = 0;
      this.reverseT = 0;
      return;
    }

    // aim slightly to the personality's side of the lane
    const toA = Math.atan2(dy, dx);
    const ox = -Math.sin(toA) * this.p.line;
    const oy = Math.cos(toA) * this.p.line;
    const desired = Math.atan2(dy + oy, dx + ox);
    const diff = wrapAngle(desired - v.angle);

    const turn = Math.abs(wrapAngle(Math.atan2(nxt.y - tgt.y, nxt.x - tgt.x) - toA));
    const top = v.stats.maxSpeed * this.p.skill * rubber;
    const corner = turn > 0.3 ? 150 + 60 * this.p.skill - turn * 18 : top;
    const brakeDist = Math.max(0, (v.forward ** 2 - corner ** 2) / (2 * v.stats.brake * (0.5 + 0.25 * this.p.aggression))) + 20;

    let throttle = 1;
    let brake = 0;
    if (v.forward > top) throttle = 0;
    if (d - switchR < brakeDist && v.forward > corner) {
      throttle = 0;
      brake = 1;
    }
    if (Math.abs(diff) > 1.1 && v.forward > 160) {
      throttle = 0.2;
    }

    // stuck recovery: reverse out with opposite lock
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.input = { throttle: 0, brake: 1, steer: -Math.sign(diff), handbrake: false };
      return;
    }
    if (Math.abs(v.forward) < 25) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 1.2) {
      this.stuckT = 0;
      this.reverseT = 1.2;
    }
    v.input = { throttle, brake, steer: clamp(diff * 2.4, -1, 1), handbrake: Math.abs(diff) > 0.9 && v.forward > 220 && this.p.aggression > 0.6 };
  }
}
