import Phaser from 'phaser';
import type { Sign } from '../world/CityMap';
import { TRAFFIC_LOOKS, VEHICLES } from '../vehicles/VehicleData';
import { drawCar } from './CarArt';
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

export { drawCar };

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
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 14);
    g.fillStyle = label === 'RACE' ? '#e03a2e' : '#3a8bd8';
    g.fillRect(0, 12, w, 2);
    drawText(g, label, 4, 2, 2, '#1c1c22');
    tex.addCanvas('label_' + label, c);
  }
  return { trafficKeys, carCanvas, trafficCanvases };
}

/** Painted shop-sign board texture (cached by content). */
export function signTexture(scene: Phaser.Scene, s: Sign): string {
  const key = `sign_${s.text}_${s.color}_${s.vertical ? 'v' : 'h'}`;
  if (scene.textures.exists(key)) return key;
  const board = hexStr(s.color);
  const light = ((s.color >> 16) & 255) + ((s.color >> 8) & 255) + (s.color & 255) > 500;
  const ink = light ? '#2a2a30' : '#f4f1e8';
  const w = s.vertical ? 12 : textWidth(s.text, 2) + 8;
  const h = s.vertical ? s.text.length * 12 + 4 : 16;
  const c = makeCanvas(w + 1, h + 1);
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.35)'; // drop shadow
  g.fillRect(1, 1, w, h);
  g.fillStyle = shade(board, -0.4);
  g.fillRect(0, 0, w, h);
  g.fillStyle = board;
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = shade(board, 0.25);
  g.fillRect(1, 1, w - 2, 1);
  if (s.vertical) drawTextVertical(g, s.text, 3, 3, 2, ink);
  else drawText(g, s.text, 4, 3, 2, ink);
  scene.textures.addCanvas(key, c);
  return key;
}
