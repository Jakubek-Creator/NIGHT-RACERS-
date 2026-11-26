const overlay = () => document.getElementById('overlay')!;
const panel = () => document.getElementById('panel')!;

export function closeOverlay() {
  overlay().classList.add('hidden');
  panel().innerHTML = '';
}

function open(html: string): HTMLElement {
  const p = panel();
  p.innerHTML = html;
  overlay().classList.remove('hidden');
  return p;
}

export interface PauseOptions {
  racing: boolean;
  touch: boolean;
  muted: boolean;
  fps: boolean;
  zoom: number;
  ctlScale: number;
  onResume(): void;
  onTime(hour: number): void;
  onZoom(z: number): void;
  onTouch(on: boolean): void;
  onEditControls(): void;
  onCtlScale(s: number): void;
  onResetControls(): void;
  onMute(m: boolean): void;
  onFps(on: boolean): void;
  onQuitRace(): void;
  onResetCar(): void;
}

export function showPause(o: PauseOptions) {
  const p = open(`
    <h2>PAUSED</h2>
    <button class="big" data-a="resume">RESUME</button>
    <div class="row"><span>TIME OF DAY</span><span class="seg"><button data-h="12">DAY</button><button data-h="18.3">SUNSET</button><button data-h="22">NIGHT</button></span></div>
    <div class="row"><span>ZOOM</span><input type="range" min="0.6" max="1.6" step="0.05" value="${o.zoom}" data-a="zoom"></div>
    <div class="row"><span>TOUCH CONTROLS</span><button data-a="touch">${o.touch ? 'ON' : 'OFF'}</button></div>
    <div class="row"><span>CONTROL SIZE</span><input type="range" min="0.6" max="1.6" step="0.05" value="${o.ctlScale}" data-a="scale"></div>
    <div class="row"><button data-a="edit">MOVE CONTROLS</button><button data-a="resetctl">RESET LAYOUT</button></div>
    <div class="row"><span>SOUND</span><button data-a="mute">${o.muted ? 'OFF' : 'ON'}</button></div>
    <div class="row"><span>SHOW FPS</span><button data-a="fps">${o.fps ? 'ON' : 'OFF'}</button></div>
    <div class="row"><button data-a="resetcar">RESET CAR</button>${o.racing ? '<button data-a="quit" class="danger">QUIT RACE</button>' : ''}</div>
    <p class="help">Keyboard: <b>W/↑</b> gas · <b>S/↓</b> brake/reverse · <b>A D/← →</b> steer · <b>SPACE</b> drift · <b>E</b> interact · <b>+/-</b> zoom · <b>ESC</b> pause</p>`);
  p.querySelector('[data-a=resume]')!.addEventListener('click', () => o.onResume());
  p.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) => b.addEventListener('click', () => o.onTime(Number(b.dataset.h))));
  (p.querySelector('[data-a=zoom]') as HTMLInputElement).addEventListener('input', (e) => o.onZoom(Number((e.target as HTMLInputElement).value)));
  (p.querySelector('[data-a=scale]') as HTMLInputElement).addEventListener('input', (e) => o.onCtlScale(Number((e.target as HTMLInputElement).value)));
  const toggle = (sel: string, get: () => boolean, set: (v: boolean) => void, onText = 'ON', offText = 'OFF') => {
    const b = p.querySelector(sel) as HTMLButtonElement;
    b.addEventListener('click', () => {
      set(!get());
      b.textContent = get() ? onText : offText;
    });
  };
  let touch = o.touch;
  toggle('[data-a=touch]', () => touch, (v) => o.onTouch((touch = v)));
  let muted = o.muted;
  toggle('[data-a=mute]', () => !muted, (v) => o.onMute((muted = !v)));
  let fps = o.fps;
  toggle('[data-a=fps]', () => fps, (v) => o.onFps((fps = v)));
  p.querySelector('[data-a=edit]')!.addEventListener('click', () => o.onEditControls());
  p.querySelector('[data-a=resetctl]')!.addEventListener('click', () => o.onResetControls());
  p.querySelector('[data-a=resetcar]')!.addEventListener('click', () => o.onResetCar());
  p.querySelector('[data-a=quit]')?.addEventListener('click', () => o.onQuitRace());
}

export interface ResultRow {
  place: number;
  name: string;
  car: string;
  time: string;
  you: boolean;
  color: string;
}

export function showResults(rows: ResultRow[], reward: number, rep: number, bestLap: string, onDone: () => void) {
  const table = rows
    .map((r) => `<tr class="${r.you ? 'you' : ''}"><td>${r.place}</td><td><i style="background:${r.color}"></i>${r.name}</td><td>${r.car}</td><td>${r.time}</td></tr>`)
    .join('');
  const p = open(`
    <h2>${rows.find((r) => r.you)!.place === 1 ? 'VICTORY!' : 'RACE COMPLETE'}</h2>
    <table class="results"><tr><th>#</th><th>DRIVER</th><th>CAR</th><th>TIME</th></tr>${table}</table>
    <p class="reward">PRIZE <b>$${reward}</b> · STREET REP <b>+${rep}</b> · BEST LAP <b>${bestLap}</b></p>
    <button class="big" data-a="done">COLLECT</button>`);
  p.querySelector('[data-a=done]')!.addEventListener('click', () => onDone());
}
