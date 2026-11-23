import { clamp } from '../core/math';

interface Pos {
  x: number; // centre, fraction of viewport width
  y: number; // centre, fraction of viewport height
}

interface Layout {
  scale: number;
  pos: Record<string, Pos>;
}

const DEFAULT: Layout = {
  scale: 1,
  pos: {
    stick: { x: 0.13, y: 0.76 },
    gas: { x: 0.9, y: 0.74 },
    brake: { x: 0.75, y: 0.86 },
    drift: { x: 0.77, y: 0.57 },
    act: { x: 0.62, y: 0.7 },
  },
};

const STORE = 'nr-touch-layout';

/**
 * On-screen controls: analog steering pad, gas, brake/reverse, drift (handbrake) and a
 * contextual action button. Layout (position and size) is editable and remembered per device.
 */
export class TouchControls {
  readonly state = { steer: 0, gas: false, brake: false, drift: false };
  private act = false;
  private root = document.getElementById('controls')!;
  private els: Record<string, HTMLElement> = {};
  private layout: Layout;
  private editing = false;
  enabled: boolean;

  constructor() {
    this.layout = this.loadLayout();
    this.enabled = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.build();
    this.applyLayout();
    this.setEnabled(this.enabled);
    window.addEventListener('resize', () => this.applyLayout());
  }

  private loadLayout(): Layout {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const l = JSON.parse(raw) as Layout;
        return { scale: l.scale ?? 1, pos: { ...DEFAULT.pos, ...l.pos } };
      }
    } catch {
      /* storage blocked */
    }
    return structuredClone(DEFAULT);
  }

  private saveLayout() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.layout));
    } catch {
      /* ignore */
    }
  }

  private build() {
    const mk = (id: string, cls: string, html: string) => {
      const el = document.createElement('div');
      el.className = `ctl ${cls}`;
      el.dataset.id = id;
      el.innerHTML = html;
      this.root.appendChild(el);
      this.els[id] = el;
      return el;
    };
    const stick = mk('stick', 'stick', '<div class="track"></div><div class="knob"></div><span class="hint">STEER</span>');
    mk('gas', 'btn gas', 'GAS');
    mk('brake', 'btn brake', 'BRAKE');
    mk('drift', 'btn drift', 'DRIFT');
    const act = mk('act', 'btn act hidden', 'RACE');
    const knob = stick.querySelector('.knob') as HTMLElement;

    const bindHold = (id: 'gas' | 'brake' | 'drift') => {
      const el = this.els[id];
      el.addEventListener('pointerdown', (e) => {
        if (this.editing) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        this.state[id] = true;
        el.classList.add('down');
      });
      const up = () => {
        this.state[id] = false;
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    bindHold('gas');
    bindHold('brake');
    bindHold('drift');

    act.addEventListener('pointerdown', (e) => {
      if (this.editing) return;
      e.preventDefault();
      this.act = true;
    });

    let stickId = -1;
    let originX = 0;
    const moveStick = (clientX: number) => {
      const r = stick.getBoundingClientRect();
      const range = r.width * 0.42;
      const dx = clamp(clientX - originX, -range, range);
      this.state.steer = dx / range;
      knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      if (this.editing) return;
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      originX = r.left + r.width / 2;
      moveStick(e.clientX);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) moveStick(e.clientX);
    });
    const release = () => {
      stickId = -1;
      this.state.steer = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    // layout editing: drag any control
    for (const [id, el] of Object.entries(this.els)) {
      let dragging = -1;
      el.addEventListener('pointerdown', (e) => {
        if (!this.editing) return;
        e.preventDefault();
        dragging = e.pointerId;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!this.editing || e.pointerId !== dragging) return;
        this.layout.pos[id] = { x: clamp(e.clientX / innerWidth, 0.05, 0.95), y: clamp(e.clientY / innerHeight, 0.1, 0.95) };
        this.applyLayout();
      });
      el.addEventListener('pointerup', () => {
        dragging = -1;
        this.saveLayout();
      });
    }
  }

  private applyLayout() {
    this.root.style.setProperty('--ctl-scale', String(this.layout.scale));
    for (const [id, el] of Object.entries(this.els)) {
      const p = this.layout.pos[id];
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch', on);
  }

  setEditing(on: boolean) {
    this.editing = on;
    this.root.classList.toggle('editing', on);
    if (on) this.setEnabled(true);
  }

  get scale() {
    return this.layout.scale;
  }

  setScale(s: number) {
    this.layout.scale = clamp(s, 0.6, 1.6);
    this.applyLayout();
    this.saveLayout();
  }

  resetLayout() {
    this.layout = structuredClone(DEFAULT);
    this.applyLayout();
    this.saveLayout();
  }

  /** Contextual action button label; null hides it. */
  setAction(label: string | null) {
    const el = this.els.act;
    el.classList.toggle('hidden', label === null && !this.editing);
    if (label) el.textContent = label;
  }

  consumeAct(): boolean {
    const a = this.act;
    this.act = false;
    return a;
  }
}
