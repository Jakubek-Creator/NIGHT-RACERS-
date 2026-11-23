import { TILE } from '../config';
import { clamp } from '../core/math';
import type { CityMap } from '../world/CityMap';

/** Anything with a position, heading and two collision circles along its length. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  radius: number;
  circleOffset: number;
  mass: number;
}

export interface Hit {
  nx: number;
  ny: number;
  impact: number;
}

const tmp = { x: 0, y: 0 };

function circleCentre(b: Body, k: number) {
  const s = k === 0 ? 1 : -1;
  tmp.x = b.x + Math.cos(b.angle) * b.circleOffset * s;
  tmp.y = b.y + Math.sin(b.angle) * b.circleOffset * s;
  return tmp;
}

/** Push a body out of solid tiles and props. Returns the strongest impact speed. */
export function collideWorld(b: Body, map: CityMap, restitution = 0.35): number {
  let impact = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (let k = 0; k < 2; k++) {
      const c = circleCentre(b, k);
      const r = b.radius;
      let px = 0;
      let py = 0;
      let cx = c.x;
      let cy = c.y;
      const x0 = Math.floor((cx - r) / TILE);
      const x1 = Math.floor((cx + r) / TILE);
      const y0 = Math.floor((cy - r) / TILE);
      const y1 = Math.floor((cy + r) / TILE);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (!map.isSolid(tx, ty)) continue;
          const rx = tx * TILE;
          const ry = ty * TILE;
          const qx = clamp(cx, rx, rx + TILE);
          const qy = clamp(cy, ry, ry + TILE);
          const dx = cx - qx;
          const dy = cy - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          let nx: number;
          let ny: number;
          let pen: number;
          if (d2 < 1e-6) {
            const l = cx - rx;
            const rr = rx + TILE - cx;
            const t = cy - ry;
            const bb = ry + TILE - cy;
            const m = Math.min(l, rr, t, bb);
            if (m === l) [nx, ny, pen] = [-1, 0, l + r];
            else if (m === rr) [nx, ny, pen] = [1, 0, rr + r];
            else if (m === t) [nx, ny, pen] = [0, -1, t + r];
            else [nx, ny, pen] = [0, 1, bb + r];
          } else {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            pen = r - d;
          }
          cx += nx * pen;
          cy += ny * pen;
          px += nx * pen;
          py += ny * pen;
        }
      map.forPropsNear(cx, cy, r, (p) => {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const rr = r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) return;
        const d = Math.sqrt(d2);
        const pen = rr - d;
        cx += (dx / d) * pen;
        cy += (dy / d) * pen;
        px += (dx / d) * pen;
        py += (dy / d) * pen;
      });
      const plen = Math.hypot(px, py);
      if (plen < 1e-4) continue;
      b.x += px;
      b.y += py;
      const nx = px / plen;
      const ny = py / plen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        impact = Math.max(impact, -vn);
        b.vx -= (1 + restitution) * vn * nx;
        b.vy -= (1 + restitution) * vn * ny;
        // scrape friction along the wall
        const tx = -ny;
        const ty = nx;
        const vt = b.vx * tx + b.vy * ty;
        b.vx -= vt * 0.12 * tx;
        b.vy -= vt * 0.12 * ty;
        // glancing hits rotate the car
        const fx = Math.cos(b.angle);
        const fy = Math.sin(b.angle);
        const cross = fx * ny - fy * nx;
        b.spin += (k === 0 ? 1 : -1) * cross * Math.min(-vn, 350) * 0.006;
      }
    }
  }
  return impact;
}

/** Two dynamic bodies. Returns impact speed. */
export function collideBodies(a: Body, b: Body): number {
  let impact = 0;
  for (let i = 0; i < 2; i++) {
    const ca = circleCentre(a, i);
    const ax = ca.x;
    const ay = ca.y;
    for (let j = 0; j < 2; j++) {
      const cb = circleCentre(b, j);
      const dx = cb.x - ax;
      const dy = cb.y - ay;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const pen = rr - d;
      const im = a.mass + b.mass;
      a.x -= nx * pen * (b.mass / im);
      a.y -= ny * pen * (b.mass / im);
      b.x += nx * pen * (a.mass / im);
      b.y += ny * pen * (a.mass / im);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jImp = (-(1 + 0.3) * rv) / (1 / a.mass + 1 / b.mass);
        a.vx -= (jImp / a.mass) * nx;
        a.vy -= (jImp / a.mass) * ny;
        b.vx += (jImp / b.mass) * nx;
        b.vy += (jImp / b.mass) * ny;
        impact = Math.max(impact, -rv);
        a.spin += (i === 0 ? 1 : -1) * (Math.cos(a.angle) * ny - Math.sin(a.angle) * nx) * Math.min(-rv, 300) * 0.004;
        b.spin -= (j === 0 ? 1 : -1) * (Math.cos(b.angle) * ny - Math.sin(b.angle) * nx) * Math.min(-rv, 300) * 0.004;
      }
    }
  }
  return impact;
}

/** Dynamic body against a kinematic one (civilian traffic follows its lane and only stops). */
export function collideKinematic(a: Body, k: Body): number {
  let impact = 0;
  for (let i = 0; i < 2; i++) {
    const ca = circleCentre(a, i);
    const ax = ca.x;
    const ay = ca.y;
    for (let j = 0; j < 2; j++) {
      const cb = circleCentre(k, j);
      const dx = ax - cb.x;
      const dy = ay - cb.y;
      const rr = a.radius + k.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      a.x += nx * (rr - d);
      a.y += ny * (rr - d);
      const rv = (a.vx - k.vx) * nx + (a.vy - k.vy) * ny;
      if (rv < 0) {
        a.vx -= 1.3 * rv * nx;
        a.vy -= 1.3 * rv * ny;
        impact = Math.max(impact, -rv);
        a.spin += (i === 0 ? 1 : -1) * (Math.cos(a.angle) * ny - Math.sin(a.angle) * nx) * Math.min(-rv, 300) * 0.005;
      }
    }
  }
  return impact;
}
