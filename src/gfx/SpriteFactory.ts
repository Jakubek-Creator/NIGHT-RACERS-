import Phaser from 'phaser';
import type { Sign } from '../world/CityMap';
import { CarLook, TRAFFIC_LOOKS, VEHICLES } from '../vehicles/VehicleData';
import { drawText, drawTextVertical, textWidth } from './PixelFont';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function shade(hex: string, amt: number): string {
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

export const hexStr = (n: number) => '#' + n.toString(16).padStart(6, '0');

const GLASS = '#142238';
const GLASS_HI = '#4d6d9c';
const CABIN: Record<CarLook['kind'], [number, number]> = {
  coupe: [0.3, 0.58], sedan: [0.26, 0.62], hatch: [0.18, 0.6], taxi: [0.26, 0.62], van: [0.06, 0.8], pickup: [0.45, 0.68],
  muscle: [0.28, 0.55], rally: [0.26, 0.6], gt: [0.3, 0.56], super: [0.34, 0.58], truck4x4: [0.3, 0.62], buggy: [0.3, 0.62],
};

/** Detailed top-down car sprite, facing +x. */
export function drawCar(look: CarLook): HTMLCanvasElement {
  const L = look.len;
  const W = look.wid;
  const c = makeCanvas(L, W);
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const body = look.body;
  const light = shade(body, 0.3);
  const dark = shade(body, -0.3);
  const darker = shade(body, -0.55);
  const buggy = look.kind === 'buggy';
  const ins = buggy ? 2 : 1;

  // tyres poke out of the body
  const tw = look.kind === 'truck4x4' || buggy ? 7 : 6;
  const rw = Math.round(L * 0.14);
  const fw = Math.round(L * 0.68);
  px(rw, 0, tw, W, '#060608');
  px(fw, 0, tw, W, '#060608');
  px(rw + 1, 0, tw - 2, 1, '#2a2a30');
  px(fw + 1, W - 1, tw - 2, 1, '#2a2a30');

  // hull with dark outline
  px(2, ins, L - 4, W - ins * 2, '#07070c');
  px(1, ins + 1, L - 2, W - ins * 2 - 2, '#07070c');
  px(2, ins + 1, L - 4, W - ins * 2 - 2, body);
  px(3, ins + 1, L - 6, 1, light);
  px(3, W - ins - 2, L - 6, 1, dark);
  px(L - 3, ins + 2, 1, W - ins * 2 - 4, light); // nose highlight

  const [a, b] = CABIN[look.kind];
  const rs = Math.round(L * a);
  const re = Math.round(L * b);
  const gy = ins + 2;
  const gh = W - ins * 2 - 4;

  if (look.stripe) {
    const mid = W / 2;
    px(re + 3, mid - 2, L - re - 5, 1, look.accent);
    px(re + 3, mid + 1, L - re - 5, 1, look.accent);
    px(2, mid - 2, rs - 4, 1, look.accent);
    px(2, mid + 1, rs - 4, 1, look.accent);
  }

  if (buggy) {
    // open roll cage
    px(rs, gy, re - rs, gh, '#1a1a1e');
    px(rs, gy, re - rs, 1, '#9a9aa6');
    px(rs, gy + gh - 1, re - rs, 1, '#9a9aa6');
    px(rs, gy, 1, gh, '#9a9aa6');
    px(re - 1, gy, 1, gh, '#9a9aa6');
    px(rs + 3, gy + 2, 3, gh - 4, '#e04040'); // seat
  } else {
    px(rs - 2, gy, 2, gh, GLASS); // rear window
    px(rs, gy, re - rs, gh, look.kind === 'van' ? light : shade(body, -0.12));
    px(rs, gy, re - rs, 1, GLASS); // side windows
    px(rs, gy + gh - 1, re - rs, 1, GLASS);
    px(re, gy, 3, gh, GLASS); // windshield
    px(re + 1, gy + 1, 1, 2, GLASS_HI);
    px(rs + 1, gy + 1, re - rs - 2, 1, shade(body, 0.12)); // roof light
  }

  // mirrors
  px(re, 0, 2, 1, darker);
  px(re, W - 1, 2, 1, darker);
  // lights
  px(L - 3, ins + 1, 2, 3, '#fff4cc');
  px(L - 3, W - ins - 4, 2, 3, '#fff4cc');
  px(1, ins + 1, 2, 3, '#ff2440');
  px(1, W - ins - 4, 2, 3, '#ff2440');

  switch (look.kind) {
    case 'taxi':
      px(rs + 4, W / 2 - 2, 4, 4, '#111');
      px(rs + 5, W / 2 - 1, 2, 2, '#fff7a0');
      for (let x = 3; x < L - 3; x += 4) px(x, W - ins - 3, 2, 1, '#111');
      break;
    case 'pickup':
      px(3, gy, rs - 5, gh, darker);
      for (let y = gy + 1; y < gy + gh; y += 2) px(4, y, rs - 7, 1, dark);
      break;
    case 'van':
      for (let x = rs + 3; x < re - 2; x += 4) px(x, gy + 1, 1, gh - 2, dark);
      px(L - 6, W / 2 - 1, 3, 2, look.accent);
      break;
    case 'muscle':
      px(re + 4, W / 2 - 1, 5, 2, darker);
      px(re + 5, W / 2 - 1, 3, 1, '#333');
      break;
    case 'rally': {
      px(rs + 2, W / 2 - 3, 6, 6, '#f5f5f5');
      const n = String(look.number ?? 1);
      const tc = g.fillStyle;
      drawText(g, n.slice(-1), rs + 4, W / 2 - 2, 1, '#111');
      g.fillStyle = tc;
      for (let i = 0; i < 4; i++) px(L - 6, ins + 2 + i * Math.floor((W - 6) / 3), 1, 2, '#fff8d0'); // light pod
      px(2, ins + 1, L - 4, 1, look.accent);
      px(2, W - ins - 2, L - 4, 1, look.accent);
      break;
    }
    case 'gt':
    case 'super':
      px(1, ins, 3, W - ins * 2, '#0b0b10'); // wing
      px(2, ins, 1, W - ins * 2, look.accent);
      px(rs + 2, ins + 1, 4, 1, '#0b0b10'); // side intakes
      px(rs + 2, W - ins - 2, 4, 1, '#0b0b10');
      if (look.kind === 'super') px(re + 4, W / 2 - 2, 6, 4, shade(body, -0.2));
      break;
    case 'truck4x4':
      px(re - 2, gy, 1, gh, '#fff4cc'); // light bar
      px(3, gy, rs - 5, gh, darker); // bed
      px(4, gy + 1, rs - 7, gh - 2, '#2a2a2a');
      break;
  }
  return c;
}

function radial(size: number, stops: [number, number][]): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export interface SpriteBank {
  trafficKeys: string[];
  carCanvas: Map<string, HTMLCanvasElement>;
  trafficCanvases: HTMLCanvasElement[];
}

/** Generates every runtime texture procedurally (no external art files needed). */
export function registerTextures(scene: Phaser.Scene): SpriteBank {
  const tex = scene.textures;
  const linear = (key: string) => tex.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);

  tex.addCanvas('glow', radial(64, [[0, 1], [0.25, 0.55], [0.6, 0.15], [1, 0]]));
  linear('glow');
  tex.addCanvas('puff', radial(16, [[0, 0.9], [0.5, 0.5], [1, 0]]));
  linear('puff');

  // headlight cone, origin at the left-centre
  const cone = makeCanvas(160, 96);
  {
    const g = cone.getContext('2d')!;
    const grd = g.createRadialGradient(0, 48, 0, 0, 48, 160);
    grd.addColorStop(0, 'rgba(255,250,225,0.95)');
    grd.addColorStop(0.5, 'rgba(255,245,210,0.35)');
    grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.beginPath();
    g.moveTo(0, 42);
    g.lineTo(160, 0);
    g.lineTo(160, 96);
    g.lineTo(0, 54);
    g.closePath();
    g.fillStyle = grd;
    g.fill();
  }
  tex.addCanvas('cone', cone);
  linear('cone');

  const skid = makeCanvas(4, 4);
  skid.getContext('2d')!.fillStyle = '#000';
  skid.getContext('2d')!.fillRect(0, 0, 4, 4);
  tex.addCanvas('skid', skid);

  for (const [k, col] of [['r', '#ff2a3a'], ['y', '#ffc21a'], ['g', '#2bff7a']] as const) {
    const c = makeCanvas(6, 6);
    const g = c.getContext('2d')!;
    g.fillStyle = '#0c0c10';
    g.fillRect(0, 0, 6, 6);
    g.fillStyle = col;
    g.fillRect(1, 1, 4, 4);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(1, 1, 1, 1);
    tex.addCanvas('tl_' + k, c);
  }

  const carCanvas = new Map<string, HTMLCanvasElement>();
  for (const v of VEHICLES) {
    const c = drawCar(v.look);
    carCanvas.set(v.id, c);
    tex.addCanvas('car_' + v.id, c);
  }
  const trafficKeys: string[] = [];
  const trafficCanvases: HTMLCanvasElement[] = [];
  TRAFFIC_LOOKS.forEach((look, i) => {
    const c = drawCar(look);
    trafficCanvases.push(c);
    tex.addCanvas('traffic_' + i, c);
    trafficKeys.push('traffic_' + i);
  });

  // marker labels
  for (const label of ['RACE', 'GARAGE']) {
    const w = textWidth(label, 2) + 8;
    const c = makeCanvas(w, 14);
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(5,5,12,0.85)';
    g.fillRect(0, 0, w, 14);
    drawText(g, label, 4, 2, 2, '#ffffff');
    tex.addCanvas('label_' + label, c);
  }
  return { trafficKeys, carCanvas, trafficCanvases };
}

/** Pixel neon sign texture (cached by content). */
export function signTexture(scene: Phaser.Scene, s: Sign): string {
  const key = `sign_${s.text}_${s.color}_${s.vertical ? 'v' : 'h'}`;
  if (scene.textures.exists(key)) return key;
  const col = hexStr(s.color);
  const w = s.vertical ? 12 : textWidth(s.text, 2) + 8;
  const h = s.vertical ? s.text.length * 12 + 4 : 16;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = '#07060d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = shade(col, -0.55);
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, h - 1, w, 1);
  g.fillRect(0, 0, 1, h);
  g.fillRect(w - 1, 0, 1, h);
  if (s.vertical) drawTextVertical(g, s.text, 3, 3, 2, col);
  else drawText(g, s.text, 4, 3, 2, col);
  scene.textures.addCanvas(key, c);
  return key;
}
