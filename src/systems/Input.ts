import { clamp } from '../core/math';
import type { TouchControls } from '../ui/TouchControls';

export interface Frame {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  interact: boolean; // edge-triggered
  pause: boolean; // edge-triggered
  zoom: number; // -1, 0, +1 edge
}

/** Merges keyboard and touch into one drive frame. */
export class Input {
  private keys = new Set<string>();
  private edges = new Set<string>();
  private steerKb = 0;
  onAnyInput?: () => void;

  constructor(private touch: TouchControls) {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      this.onAnyInput?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.onAnyInput?.());
  }

  private k(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }
  private e(...codes: string[]) {
    return codes.some((c) => this.edges.has(c));
  }

  read(dt: number): Frame {
    const left = this.k('ArrowLeft', 'KeyA');
    const right = this.k('ArrowRight', 'KeyD');
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    // keyboard steering ramps in and out for a smoother arcade feel
    if (want === 0) this.steerKb -= Math.sign(this.steerKb) * Math.min(Math.abs(this.steerKb), 8 * dt);
    else {
      if (Math.sign(this.steerKb) !== want) this.steerKb *= 0.5;
      this.steerKb = clamp(this.steerKb + want * 7 * dt, -1, 1);
    }
    const t = this.touch.state;
    const f: Frame = {
      throttle: Math.max(this.k('ArrowUp', 'KeyW') ? 1 : 0, t.gas ? 1 : 0),
      brake: Math.max(this.k('ArrowDown', 'KeyS') ? 1 : 0, t.brake ? 1 : 0),
      steer: Math.abs(t.steer) > 0.02 ? t.steer : this.steerKb,
      handbrake: this.k('Space') || t.drift,
      interact: this.e('KeyE', 'Enter') || this.touch.consumeAct(),
      pause: this.e('Escape', 'KeyP'),
      zoom: this.e('Equal', 'NumpadAdd') ? 1 : this.e('Minus', 'NumpadSubtract') ? -1 : 0,
    };
    this.edges.clear();
    return f;
  }
}
