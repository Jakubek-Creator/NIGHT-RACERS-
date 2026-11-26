import type { CarKind, CarLook } from '../vehicles/VehicleData';
import { drawText } from './PixelFont';

/**
 * Top-down pixel-art cars, facing +x. Every body style has its own silhouette
 * (width profile along the car), cabin placement, wheel stance and parts.
 */

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const GLASS = '#1c2a40';
const GLASS_HI = '#6a8cb8';
const TYRE = '#0a0a0d';
const OUTLINE = '#0b0b10';
const CHROME = '#c8ccd4';

const bump = (t: number, c: number, w: number) => Math.max(0, 1 - Math.abs(t - c) / w);
/** Rounded front/rear corners: r = how far the rounding reaches, k = how much it pinches. */
const round = (t: number, r: number, k: number) => (t < r ? 1 - k * (1 - t / r) ** 2 : t > 1 - r ? 1 - k * (1 - (1 - t) / r) ** 2 : 1);

interface Shape {
  /** half-width (0..1 of available half-width) at t: 0 = rear bumper, 1 = front bumper */
  prof: (t: number) => number;
  /** pixels the body is inset from the canvas edge (tyres stick out by this much) */
  inset: number;
  /** cabin as fractions of length: rear glass start, roof start, roof end, windscreen end */
  cabin: [number, number, number, number] | null;
  cabinHalf: number;
  wheels: [number, number];
  tyreLen: number;
}

const SHAPES: Record<CarKind, Shape> = {
  // sleek coupe: long tapered nose, fastback glass
  coupe: { prof: (t) => Math.min(round(t, 0.08, 0.3), t > 0.78 ? 1 - (t - 0.78) * 1.3 : 1), inset: 1, cabin: [0.2, 0.36, 0.56, 0.68], cabinHalf: 0.72, wheels: [0.2, 0.76], tyreLen: 6 },
  // short boxy hatchback: roof runs almost to the tail
  hatch: { prof: (t) => round(t, 0.05, 0.2), inset: 1, cabin: [0.06, 0.1, 0.56, 0.68], cabinHalf: 0.82, wheels: [0.18, 0.78], tyreLen: 5 },
  // three-box saloon: boot, cabin, bonnet
  sedan: { prof: (t) => round(t, 0.07, 0.25), inset: 1, cabin: [0.24, 0.3, 0.6, 0.7], cabinHalf: 0.8, wheels: [0.2, 0.77], tyreLen: 5 },
  taxi: { prof: (t) => round(t, 0.07, 0.25), inset: 1, cabin: [0.24, 0.3, 0.6, 0.7], cabinHalf: 0.8, wheels: [0.2, 0.77], tyreLen: 5 },
  // delivery van: one big box with a stubby nose
  van: { prof: (t) => round(t, 0.03, 0.12) * (t > 0.88 ? 1 - (t - 0.88) * 0.9 : 1), inset: 1, cabin: [0.8, 0.8, 0.8, 0.88], cabinHalf: 0.88, wheels: [0.16, 0.8], tyreLen: 6 },
  // pickup: cab + open bed
  pickup: { prof: (t) => round(t, 0.04, 0.15), inset: 1, cabin: [0.4, 0.43, 0.62, 0.72], cabinHalf: 0.84, wheels: [0.17, 0.79], tyreLen: 6 },
  // muscle: wide, coke-bottle hips, long bonnet, cabin set far back
  muscle: {
    prof: (t) => round(t, 0.04, 0.12) * (0.86 + 0.14 * Math.max(bump(t, 0.2, 0.17), bump(t, 0.78, 0.14))),
    inset: 1, cabin: [0.17, 0.23, 0.44, 0.53], cabinHalf: 0.66, wheels: [0.2, 0.78], tyreLen: 7,
  },
  // GT racer: wide rear fenders, pinched waist, narrow canopy, pointed splitter
  gt: {
    prof: (t) => (0.78 + 0.22 * Math.max(bump(t, 0.2, 0.2), 0.8 * bump(t, 0.78, 0.15))) * (t > 0.86 ? 1 - (t - 0.86) * 2.2 : 1) * round(t, 0.04, 0.2),
    inset: 1, cabin: [0.3, 0.36, 0.52, 0.62], cabinHalf: 0.56, wheels: [0.2, 0.78], tyreLen: 6,
  },
  // supercar: wedge, wide rear, sharp nose, cab-forward teardrop canopy
  super: {
    prof: (t) => (1 - 0.5 * Math.max(0, (t - 0.12) / 0.88) ** 1.4) * round(t, 0.03, 0.2),
    inset: 1, cabin: [0.4, 0.47, 0.6, 0.74], cabinHalf: 0.52, wheels: [0.2, 0.78], tyreLen: 6,
  },
  // rally hatch: compact, flared arches, mud flaps
  rally: {
    prof: (t) => round(t, 0.06, 0.25) * (0.84 + 0.16 * Math.max(bump(t, 0.2, 0.13), bump(t, 0.78, 0.13))),
    inset: 1, cabin: [0.13, 0.17, 0.58, 0.68], cabinHalf: 0.78, wheels: [0.2, 0.78], tyreLen: 6,
  },
  // lifted 4x4: square body, fat tyres well outside the body
  truck4x4: { prof: (t) => round(t, 0.04, 0.15), inset: 3, cabin: [0.4, 0.43, 0.66, 0.74], cabinHalf: 0.86, wheels: [0.17, 0.8], tyreLen: 8 },
  // dune buggy: slim spine, exposed wheels on arms, roll cage
  buggy: { prof: (t) => 0.45 + 0.4 * bump(t, 0.45, 0.55), inset: 4, cabin: null, cabinHalf: 0.7, wheels: [0.16, 0.82], tyreLen: 7 },
};

export function drawCar(look: CarLook): HTMLCanvasElement {
  const L = look.len;
  const W = look.wid;
  const c = document.createElement('canvas');
  c.width = L;
  c.height = W;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const S = SHAPES[look.kind];
  const body = look.body;
  const light = shade(body, 0.32);
  const dark = shade(body, -0.32);
  const darker = shade(body, -0.55);
  const cy = W / 2;
  const half = W / 2 - S.inset;
  const hwAt = (x: number) => S.prof(Math.min(1, Math.max(0, (x + 0.5) / L))) * half;
  const X = (t: number) => Math.round(t * L);

  // --- tyres (drawn first so the body overlaps them)
  for (const wt of S.wheels) {
    const x = X(wt) - Math.floor(S.tyreLen / 2);
    const out = S.inset >= 3;
    const tw = out ? S.inset + 1 : 2;
    px(x, 0, S.tyreLen, tw, TYRE);
    px(x, W - tw, S.tyreLen, tw, TYRE);
    for (let i = 1; i < S.tyreLen; i += 2) {
      px(x + i, 0, 1, 1, '#2a2a30');
      px(x + i, W - 1, 1, 1, '#2a2a30');
    }
    if (look.kind === 'buggy') {
      px(x + 2, tw, 2, cy - tw - 2, '#7a7a84'); // suspension arms
      px(x + 2, cy + 2, 2, cy - tw - 2, '#7a7a84');
      px(x + 2, 1, 2, 1, '#9a9aa6'); // hubs
      px(x + 2, W - 2, 2, 1, '#9a9aa6');
    }
  }

  // --- body silhouette with 1px outline
  for (let x = 0; x < L; x++) {
    const hw = hwAt(x);
    if (hw <= 0.5) continue;
    px(x, cy - hw - 1, 1, hw * 2 + 2, OUTLINE);
  }
  for (let x = 1; x < L - 1; x++) {
    const hw = hwAt(x);
    if (hw <= 1) continue;
    const y0 = Math.round(cy - hw);
    const y1 = Math.round(cy + hw);
    px(x, y0, 1, y1 - y0, body);
    px(x, y0, 1, 1, light); // top edge catches the light
    px(x, y1 - 1, 1, 1, dark); // lower edge in shade
  }
  // nose and tail shading
  for (let y = 0; y < W; y++) {
    if (Math.abs(y + 0.5 - cy) < hwAt(L - 2) - 1) px(L - 2, y, 1, 1, light);
    if (Math.abs(y + 0.5 - cy) < hwAt(1) - 1) px(1, y, 1, 1, dark);
  }

  // --- racing stripes / livery (under the cabin)
  if (look.stripe) {
    const sw = look.kind === 'muscle' ? 2 : 1;
    px(2, cy - 2 - sw + 1, L - 4, sw, look.accent);
    px(2, cy + 1, L - 4, sw, look.accent);
  }
  if (look.kind === 'rally') {
    px(3, cy - hwAt(L / 2) + 1, L - 6, 1, look.accent);
    px(3, cy + hwAt(L / 2) - 2, L - 6, 1, look.accent);
  }

  // --- cabin
  if (S.cabin) {
    const [a, b, cc, d] = S.cabin.map(X);
    for (let x = a; x < d; x++) {
      const endT = Math.min(x - a, d - 1 - x);
      const ch = S.cabinHalf * hwAt(x) * (endT < 1 ? 0.85 : 1);
      const y0 = Math.round(cy - ch);
      const y1 = Math.round(cy + ch);
      let col: string;
      if (x < b) col = GLASS;
      else if (x < cc) col = look.kind === 'van' ? light : shade(body, -0.12);
      else col = GLASS;
      px(x, y0, 1, y1 - y0, col);
      if (x >= b && x < cc && look.kind !== 'van') {
        px(x, y0, 1, 1, GLASS); // side windows
        px(x, y1 - 1, 1, 1, GLASS);
      }
      px(x, y0 - 1, 1, 1, darker); // pillar shadow
    }
    if (cc < d) px(cc + 1, cy - 2, 1, 2, GLASS_HI); // windscreen glint
    if (b > a + 1) px(a + 1, cy + 1, 1, 1, GLASS_HI);
  }

  // --- lights
  const hf = hwAt(L - 2);
  const hr = hwAt(1);
  const head = '#fff4cc';
  const tail = '#ff2440';
  switch (look.kind) {
    case 'super':
    case 'gt':
      px(L - 4, cy - hf + 1, 3, 1, head); // slim slits
      px(L - 4, cy + hf - 2, 3, 1, head);
      px(1, cy - hr + 1, 1, hr * 2 - 2, tail); // full-width light bar
      break;
    case 'muscle':
      px(L - 2, cy - hf + 1, 1, 2, head); // quad round lamps
      px(L - 2, cy - hf + 4, 1, 2, head);
      px(L - 2, cy + hf - 3, 1, 2, head);
      px(L - 2, cy + hf - 6, 1, 2, head);
      px(1, cy - hr + 1, 1, 4, tail);
      px(1, cy + hr - 5, 1, 4, tail);
      px(0, cy - hr, 1, hr * 2, CHROME); // chrome bumpers
      px(L - 1, cy - hf, 1, hf * 2, CHROME);
      break;
    case 'van':
    case 'truck4x4':
      px(L - 2, cy - hf + 1, 1, 3, head);
      px(L - 2, cy + hf - 4, 1, 3, head);
      px(1, cy - hr + 1, 1, 3, tail);
      px(1, cy + hr - 4, 1, 3, tail);
      break;
    case 'buggy':
      px(L - 3, cy - 2, 2, 1, head);
      px(L - 3, cy + 1, 2, 1, head);
      px(2, cy - 1, 1, 2, tail);
      break;
    default:
      px(L - 3, cy - hf + 1, 2, 2, head);
      px(L - 3, cy + hf - 3, 2, 2, head);
      px(1, cy - hr + 1, 1, 3, tail);
      px(1, cy + hr - 4, 1, 3, tail);
  }

  // --- class-specific parts
  const [, roofS, roofE] = S.cabin ? S.cabin.map(X) : [0, 0, 0];
  switch (look.kind) {
    case 'coupe':
      px(2, cy - hr + 2, 2, hr * 2 - 4, darker); // ducktail lip
      break;
    case 'hatch':
      px(2, cy - 1, 1, 3, '#222'); // rear wiper
      break;
    case 'sedan':
      px(X(0.22), cy - hwAt(X(0.22)) + 2, 1, hwAt(X(0.22)) * 2 - 4, dark); // boot shut-line
      break;
    case 'taxi': {
      const m = Math.round((roofS + roofE) / 2);
      px(m - 2, cy - 2, 4, 4, '#111');
      px(m - 1, cy - 1, 2, 2, '#fff7a0');
      for (let x = 3; x < L - 3; x += 2) px(x, cy + hwAt(x) - 2, 1, 1, x % 4 ? '#111' : '#f2f2f2'); // checker band
      break;
    }
    case 'van':
      for (let x = X(0.06); x < X(0.78); x += 3) px(x, cy - hwAt(x) * 0.8 + 1, 1, hwAt(x) * 1.6 - 2, dark); // roof ribs
      px(X(0.5), cy + hwAt(X(0.5)) - 1, 4, 1, darker); // sliding door
      px(L - 3, cy - 1, 1, 2, look.accent);
      break;
    case 'pickup': {
      const be = X(0.38);
      px(2, cy - hwAt(3) + 1, be - 2, hwAt(3) * 2 - 2, darker); // bed walls
      px(3, cy - hwAt(3) + 2, be - 4, hwAt(3) * 2 - 4, '#2a2a2e');
      for (let y = Math.round(cy - hwAt(3) + 3); y < cy + hwAt(3) - 2; y += 2) px(3, y, be - 4, 1, '#353539');
      break;
    }
    case 'muscle': {
      const s = X(0.66);
      px(s, cy - 2, 6, 4, darker); // shaker scoop
      px(s + 1, cy - 1, 4, 2, '#1a1a1a');
      px(s + 5, cy - 2, 1, 4, CHROME);
      break;
    }
    case 'gt':
      px(0, 0, 3, W, OUTLINE); // big rear wing overhanging the body
      px(1, 1, 1, W - 2, look.accent);
      px(0, 0, 3, 1, '#333');
      px(0, W - 1, 3, 1, '#333');
      px(X(0.8), cy - 3, 3, 1, OUTLINE); // bonnet vents
      px(X(0.8), cy + 2, 3, 1, OUTLINE);
      px(X(0.3) - 3, cy - hwAt(X(0.3)), 3, 1, OUTLINE); // side intakes
      px(X(0.3) - 3, cy + hwAt(X(0.3)) - 1, 3, 1, OUTLINE);
      break;
    case 'super': {
      for (let x = X(0.12); x < X(0.38); x += 2) px(x, cy - hwAt(x) * 0.6, 1, hwAt(x) * 1.2, darker); // engine louvres
      const ix = X(0.36);
      px(ix, cy - hwAt(ix), 4, 2, OUTLINE); // big side intakes
      px(ix, cy + hwAt(ix) - 2, 4, 2, OUTLINE);
      px(1, cy - hr, 2, hr * 2, darker); // ducktail
      px(1, cy - hr + 1, 1, hr * 2 - 2, look.accent);
      break;
    }
    case 'rally': {
      const m = Math.round((roofS + roofE) / 2);
      px(m - 3, cy - 3, 6, 6, '#f5f5f5'); // roof number roundel
      drawText(g, String(look.number ?? 1).slice(-1), m - 1, cy - 2, 1, '#111');
      px(roofS, cy - 1, 2, 2, darker); // roof scoop
      for (let i = 0; i < 4; i++) px(L - 4, cy - 4 + i * 2 + (i > 1 ? 1 : 0), 1, 1, '#fff8d0'); // light pod
      for (const wt of S.wheels) {
        const x = X(wt) - 4; // mud flaps behind each wheel
        px(x, cy - hwAt(x), 1, 2, '#111');
        px(x, cy + hwAt(x) - 2, 1, 2, '#111');
      }
      break;
    }
    case 'truck4x4': {
      const be = X(0.38);
      px(2, cy - hwAt(3) + 1, be - 2, hwAt(3) * 2 - 2, darker);
      px(3, cy - hwAt(3) + 2, be - 4, hwAt(3) * 2 - 4, '#26262a');
      px(be - 2, cy - hwAt(be) + 1, 1, hwAt(be) * 2 - 2, '#8a8a94'); // roll bar
      px(roofE - 2, cy - 4, 1, 8, '#fff4cc'); // roof light bar
      px(L - 1, cy - hf + 1, 1, hf * 2 - 2, '#5a5a64'); // bull bar
      px(X(0.68), cy - hwAt(X(0.68)), 2, 1, '#1a1a1a'); // snorkel
      break;
    }
    case 'buggy': {
      const a = X(0.32);
      const e = X(0.6);
      px(a, cy - 4, e - a, 8, '#16161a'); // cockpit tub
      px(a, cy - 4, e - a, 1, '#b0b0ba'); // roll cage
      px(a, cy + 3, e - a, 1, '#b0b0ba');
      px(a, cy - 4, 1, 8, '#b0b0ba');
      px(e - 1, cy - 4, 1, 8, '#b0b0ba');
      px(a + 1, cy - 4, e - a - 2, 8, 'rgba(0,0,0,0)');
      px(a + 2, cy - 2, 3, 4, '#d04030'); // seat
      px(3, cy - 3, X(0.22) - 3, 6, '#5a5a62'); // exposed engine
      px(4, cy - 2, 2, 4, '#8a8a94');
      px(X(0.7), cy - 1, 3, 2, look.accent); // number plate
      break;
    }
  }
  return c;
}
