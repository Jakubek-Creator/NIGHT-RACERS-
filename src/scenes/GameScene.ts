import Phaser from 'phaser';
import { DEPTH, DIRS, GRID, TILE, WORLD_H, WORLD_W, nodePos } from '../config';
import { clamp, damp } from '../core/math';
import { TrafficSystem } from '../ai/Traffic';
import { registerTextures, SpriteBank, hexStr } from '../gfx/SpriteFactory';
import { collideBodies, collideKinematic, collideWorld } from '../physics/Collision';
import { RaceManager } from '../race/RaceManager';
import { AudioEngine } from '../systems/Audio';
import { DayNight } from '../systems/DayNight';
import { Input } from '../systems/Input';
import { SaveData, writeSave } from '../systems/Save';
import { Weather } from '../systems/Weather';
import { BigMap } from '../ui/BigMap';
import { Hud, Marker, fmtTime } from '../ui/Hud';
import { closeOverlay, showPause, showResults } from '../ui/Menus';
import { TouchControls } from '../ui/TouchControls';
import { Vehicle } from '../vehicles/Vehicle';
import { vehicleById } from '../vehicles/VehicleData';
import { ChunkManager } from '../world/ChunkManager';
import { CityMap } from '../world/CityMap';

const SKIDS = 360;

export class GameScene extends Phaser.Scene {
  private map!: CityMap;
  private bank!: SpriteBank;
  private chunks!: ChunkManager;
  private player!: Vehicle;
  private traffic!: TrafficSystem;
  private race!: RaceManager;
  private weather!: Weather;
  private dayNight = new DayNight(Number(new URLSearchParams(location.search).get('hour') ?? 15) % 24);
  private darkness!: Phaser.GameObjects.Rectangle;
  private sound2 = new AudioEngine();
  private touch!: TouchControls;
  private input2!: Input;
  private hud!: Hud;
  private bigMap!: BigMap;

  private skids: Phaser.GameObjects.Image[] = [];
  private skidIdx = 0;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private markerFx: { ring: Phaser.GameObjects.Graphics; glow: Phaser.GameObjects.Image; label: Phaser.GameObjects.Image; x: number; y: number }[] = [];

  private paused = false;
  private editingControls = false;
  private showFps = new URLSearchParams(location.search).has('fps');
  private userZoom = 1;
  private zoom = 1;
  private camX = 0;
  private camY = 0;
  private lookX = 0;
  private lookY = 0;
  private view = new Phaser.Geom.Rectangle();
  private time0 = 0;
  private lastCountdown = -1;
  private resultsShown = false;
  private stuckT = 0;
  private context: 'race' | 'garage' | null = null;

  constructor(private save: SaveData) {
    super('game');
  }

  create() {
    this.bank = registerTextures(this);
    this.map = new CityMap(1337);
    const tc = this.bank.trafficCanvases;
    this.chunks = new ChunkManager(this, this.map, (v) => tc[v % tc.length]);

    const sp = this.map.zones.spawn;
    this.player = new Vehicle(this, vehicleById('vandal'), sp.x, sp.y, sp.angle);
    this.traffic = new TrafficSystem(this, 34);
    this.race = new RaceManager(this, this.map);
    this.weather = new Weather(document.getElementById('fx') as HTMLCanvasElement);
    this.weather.onThunder = () => this.sound2.thunder();
    this.touch = new TouchControls();
    this.input2 = new Input(this.touch);
    this.input2.onAnyInput = () => this.sound2.unlock();
    this.hud = new Hud(this.map);

    for (let i = 0; i < SKIDS; i++) this.skids.push(this.add.image(-100, -100, 'skid').setDepth(DEPTH.skid).setAlpha(0).setScale(1, 0.8));
    this.dust = this.add.particles(0, 0, 'puff', {
      lifespan: 700, speed: { min: 5, max: 30 }, scale: { start: 0.5, end: 1.6 }, alpha: { start: 0.45, end: 0 }, emitting: false,
    }).setDepth(DEPTH.car - 0.1);
    this.smoke = this.add.particles(0, 0, 'puff', {
      lifespan: 1100, speed: { min: 8, max: 25 }, scale: { start: 0.4, end: 2 }, alpha: { start: 0.35, end: 0 }, tint: 0x555555, emitting: false,
    }).setDepth(DEPTH.light + 0.1);

    this.debris = this.add.particles(0, 0, 'skid', {
      lifespan: 500, speed: { min: 40, max: 120 }, scale: { start: 0.8, end: 0.3 }, alpha: { start: 1, end: 0 }, emitting: false,
    }).setDepth(DEPTH.car + 0.1);

    this.addMarker(this.map.zones.raceStart.x, this.map.zones.raceStart.y, 0xf0b429, 'label_RACE');
    this.addMarker(this.map.zones.garage.x, this.map.zones.garage.y, 0x3a8bd8, 'label_GARAGE');
    // day/night: everything below this multiply layer is tinted by the time of day
    this.darkness = this.add.rectangle(0, 0, 10, 10, 0xffffff).setDepth(DEPTH.darkness).setBlendMode(Phaser.BlendModes.MULTIPLY);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#05060a');
    cam.setRoundPixels(false);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.zoom = this.baseZoom();
    cam.setZoom(this.zoom);
    cam.centerOn(this.camX, this.camY);
    this.updateView();
    this.chunks.update(this.view, 0, this.weather.wetness, this.dayNight.night);
    this.traffic.update(0, this.player.x, this.player.y, new Phaser.Geom.Rectangle(), [], this.dayNight.night);

    document.getElementById('pauseBtn')!.addEventListener('click', () => (this.bigMap.isOpen ? this.bigMap.close() : this.togglePause()));
    const z = this.map.zones;
    this.bigMap = new BigMap(this.hud.base, [
      { x: z.raceStart.x, y: z.raceStart.y + 150, name: 'MOTOR FAIR' },
      { x: z.garage.x, y: z.garage.y + 110, name: 'GARAGE' },
      { x: 124 * TILE, y: 64 * TILE, name: 'BAY' },
      { x: 28 * TILE, y: 28 * TILE, name: 'NORTH PARK' },
      { x: 92 * TILE, y: 108 * TILE, name: 'SOUTH PARK' },
      { x: 28 * TILE, y: 108 * TILE, name: 'BUILDING SITE' },
    ]);
    this.bigMap.onClose = () => this.input2.reset();
    this.bigMap.onWaypoint = (w) => (this.waypoint = w);
    document.getElementById('minimap')!.addEventListener('click', () => this.openBigMap());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && !this.resultsShown) this.togglePause();
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.userZoom = clamp(this.userZoom * (dy > 0 ? 0.92 : 1.08), 0.6, 1.6);
    });
    document.getElementById('editDone')!.addEventListener('click', () => this.finishEditControls());
    (document.getElementById('editScale') as HTMLInputElement).addEventListener('input', (e) => this.touch.setScale(Number((e.target as HTMLInputElement).value)));

    document.getElementById('loading')!.classList.add('hidden');
    if (!this.save.seenIntro) {
      this.hud.hint('Welcome to Bayview! Cruise around town, then head to the Motor Fair flag to start the DOWNTOWN LOOP race.', 8000);
      this.save.seenIntro = true;
      writeSave(this.save);
    } else this.hud.hint('Welcome back to Bayview! The DOWNTOWN LOOP race is waiting at the Motor Fair.', 4500);
  }

  private addMarker(x: number, y: number, color: number, label: string) {
    const ring = this.add.graphics().setDepth(DEPTH.marker);
    ring.lineStyle(3, color, 0.9).strokeCircle(x, y, 28);
    ring.fillStyle(color, 0.12).fillCircle(x, y, 28);
    const glow = this.add.image(x, y, 'glow').setTint(color).setScale(2.2).setAlpha(0.4).setDepth(DEPTH.light).setBlendMode(Phaser.BlendModes.ADD);
    const lab = this.add.image(x, y - 40, label).setDepth(DEPTH.marker);
    this.markerFx.push({ ring, glow, label: lab, x, y });
  }

  private baseZoom() {
    return clamp(Math.min(window.innerWidth, window.innerHeight) / 430, 0.8, 2.6);
  }

  private updateView() {
    const cam = this.cameras.main;
    const w = cam.width / cam.zoom;
    const h = cam.height / cam.zoom;
    this.view.setTo(cam.midPoint.x - w / 2, cam.midPoint.y - h / 2, w, h);
  }

  // ------------------------------------------------------------------ pause
  private togglePause() {
    if (this.resultsShown) return;
    if (this.paused) {
      this.paused = false;
      closeOverlay();
      return;
    }
    this.paused = true;
    this.sound2.engine(0, 0);
    this.sound2.skid(0);
    showPause({
      racing: this.race.active,
      touch: this.touch.enabled,
      muted: this.sound2.muted,
      fps: this.showFps,
      zoom: this.userZoom,
      ctlScale: this.touch.scale,
      onResume: () => this.togglePause(),
      onTime: (h) => {
        this.dayNight.hour = h;
        this.dayNight.update(0);
        this.togglePause();
      },
      onZoom: (z) => (this.userZoom = z),
      onTouch: (on) => this.touch.setEnabled(on),
      onEditControls: () => {
        closeOverlay();
        this.editingControls = true;
        this.touch.setEditing(true);
        this.touch.setAction('ACTION');
        document.getElementById('editBar')!.classList.remove('hidden');
        (document.getElementById('editScale') as HTMLInputElement).value = String(this.touch.scale);
      },
      onCtlScale: (s) => this.touch.setScale(s),
      onResetControls: () => this.touch.resetLayout(),
      onMute: (m) => this.sound2.setMuted(m),
      onFps: (on) => (this.showFps = on),
      onQuitRace: () => {
        this.race.end();
        this.togglePause();
        this.hud.toast('RACE ABANDONED');
      },
      onResetCar: () => {
        this.resetCar();
        this.togglePause();
      },
    });
  }

  private finishEditControls() {
    this.editingControls = false;
    this.touch.setEditing(false);
    this.touch.setAction(null);
    document.getElementById('editBar')!.classList.add('hidden');
    this.paused = false;
  }

  /** Put the car back on the nearest road lane. */
  private resetCar() {
    let best = { i: 0, j: 0, d: Infinity };
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++) {
        const d = Math.hypot(nodePos(i) - this.player.x, nodePos(j) - this.player.y);
        if (d < best.d) best = { i, j, d };
      }
    const dir = best.i < GRID - 1 ? 0 : 2;
    this.player.place(nodePos(best.i) + DIRS[dir].x * 3 * TILE, nodePos(best.j) + (dir === 0 ? TILE : -TILE), dir === 0 ? 0 : Math.PI);
  }

  // ----------------------------------------------------------------- update
  update(_t: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const frame = this.input2.read(dt);
    if (frame.map) this.bigMap.isOpen ? this.bigMap.close() : this.openBigMap();
    if (frame.pause) this.bigMap.isOpen ? this.bigMap.close() : this.togglePause();
    if (this.bigMap.isOpen) return; // the world waits while you read the map
    if (this.paused || this.editingControls) {
      this.hud.update(dt, this.hudFrame());
      return;
    }
    this.time0 += dt;
    if (frame.zoom) this.userZoom = clamp(this.userZoom * (frame.zoom > 0 ? 1.1 : 0.9), 0.6, 1.6);

    const p = this.player;
    const racing = this.race.state;
    if (racing === 'countdown' || this.resultsShown) {
      p.input = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    } else {
      p.input = { throttle: frame.throttle, brake: frame.brake, steer: frame.steer, handbrake: frame.handbrake };
    }

    // race logic (sets AI inputs)
    const v = this.view;
    const ev = this.race.update(dt, (x, y) => x > v.x - 40 && x < v.right + 40 && y > v.y - 40 && y < v.bottom + 40);
    this.handleRaceEvents(ev);

    // physics, two sub-steps for stable collisions at speed
    const dyn: Vehicle[] = [p, ...this.race.rivals()];
    const steps = 2;
    const h = dt / steps;
    let impact = 0;
    for (let s = 0; s < steps; s++) {
      for (const v of dyn) {
        v.update(h, this.map, this.weather.wetness);
        const im = collideWorld(v, this.map);
        if (v === p) impact = Math.max(impact, im);
        else v.damage = Math.min(100, v.damage + Math.max(0, im - 120) * 0.02);
      }
      for (let i = 0; i < dyn.length; i++)
        for (let j = i + 1; j < dyn.length; j++) {
          const a = dyn[i];
          const b = dyn[j];
          if (Math.abs(a.x - b.x) > 60 || Math.abs(a.y - b.y) > 60) continue;
          const im = collideBodies(a, b);
          if (a === p) impact = Math.max(impact, im);
        }
      for (const v of dyn)
        for (const c of this.traffic.cars) {
          if (!c.active || Math.abs(v.x - c.x) > 50 || Math.abs(v.y - c.y) > 50) continue;
          const im = collideKinematic(v, c);
          if (im > 30) c.bump = 1.2 + im / 300;
          if (v === p) impact = Math.max(impact, im);
        }
    }
    if (impact > 90) {
      const k = clamp((impact - 90) / 400, 0, 1);
      this.cameras.main.shake(120 + k * 200, 0.002 + k * 0.01);
      this.sound2.crash(k);
      p.damage = Math.min(100, p.damage + k * 14);
      if (navigator.vibrate && k > 0.3) navigator.vibrate(30 + k * 60);
    }
    this.dayNight.update(dt);
    const night = this.dayNight.night;
    for (const v of dyn) v.sync(night);

    this.effects(dyn, dt);
    this.handleKnocked();
    this.updateCamera(dt);
    this.updateView();
    this.traffic.update(dt, p.x, p.y, this.view, dyn, night);
    this.chunks.update(this.view, this.time0, this.weather.wetness, night);
    // rain also dims the daylight a little
    const tint = this.dayNight.tint;
    const dim = 1 - this.weather.rain * 0.22;
    const ch = (s: number) => Math.round(((tint >> s) & 255) * dim);
    this.darkness.setFillStyle((ch(16) << 16) | (ch(8) << 8) | ch(0));
    this.darkness.setPosition(this.view.centerX, this.view.centerY).setSize(this.view.width + 200, this.view.height + 200);
    this.weather.update(dt, this.camX, this.camY, this.zoom);
    this.race.pulse(this.time0);
    this.updateContext(frame.interact);

    // audio
    const sn = Math.abs(p.forward) / p.stats.maxSpeed;
    this.sound2.engine(sn, p.input.throttle);
    this.sound2.skid(p.slip > 70 && p.speed > 60 ? (p.slip - 70) / 600 : 0);
    this.sound2.rain(this.weather.rain);

    // stuck helper
    if (p.speed < 10 && (p.input.throttle > 0 || p.input.brake > 0)) this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 3) {
      this.stuckT = 0;
      this.hud.toast('STUCK? PAUSE → RESET CAR', 3000);
    }

    this.hud.update(dt, this.hudFrame());
  }

  private handleRaceEvents(ev: { finished?: boolean; lap?: number; go?: boolean }) {
    if (this.race.state === 'countdown') {
      const n = Math.ceil(this.race.countdown);
      if (n !== this.lastCountdown && n <= 3 && n >= 1) {
        this.lastCountdown = n;
        this.hud.countdown(String(n));
        this.sound2.beep(440);
      }
    }
    if (ev.go) {
      this.hud.countdown('GO!');
      this.sound2.beep(880, 0.35);
      this.lastCountdown = -1;
      this.time.delayedCall(700, () => this.hud.countdown(null));
    }
    if (ev.lap && !ev.finished) {
      this.hud.toast(`LAP ${ev.lap + 1}/${this.race.def.laps} · ${fmtTime(this.race.lastLapTimes[this.race.lastLapTimes.length - 1])}`);
      if (ev.lap === this.race.def.laps - 1) this.hud.hint('Final lap! Watch for shortcuts through the parking lots.', 3000);
    }
    if (ev.finished) {
      this.hud.countdown('FINISH');
      this.time.delayedCall(1300, () => {
        this.hud.countdown(null);
        this.showRaceResults();
      });
    }
  }

  private showRaceResults() {
    this.resultsShown = true;
    const st = this.race.standings();
    const place = st.findIndex((e) => e.isPlayer) + 1;
    const reward = this.race.def.rewards[place - 1] ?? 0;
    const rep = this.race.def.rep[place - 1] ?? 0;
    const bestLap = Math.min(...this.race.lastLapTimes);
    const rows = st.map((e, i) => ({
      place: i + 1,
      name: e.name,
      car: e.car.def.name,
      time: e.finished ? fmtTime(e.finishTime) : 'RACING',
      you: e.isPlayer,
      color: hexStr(e.color),
    }));
    showResults(rows, reward, rep, fmtTime(bestLap), () => {
      this.save.money += reward;
      this.save.rep.street += rep;
      if (place === 1) this.save.racesWon++;
      const tt = this.race.player!.finishTime;
      if (this.save.bestRace === null || tt < this.save.bestRace) this.save.bestRace = tt;
      if (this.save.bestLap === null || bestLap < this.save.bestLap) this.save.bestLap = bestLap;
      writeSave(this.save);
      closeOverlay();
      this.race.end();
      this.resultsShown = false;
      this.hud.toast(`+$${reward}`);
      this.hud.hint(place === 1 ? 'Amazing driving! Race again any time at the Motor Fair flag.' : 'Good run! Try the parking-lot shortcuts next time.', 4500);
    });
  }

  private updateContext(interact: boolean) {
    const p = this.player;
    let ctx: 'race' | 'garage' | null = null;
    if (!this.race.active && !this.resultsShown) {
      const rs = this.map.zones.raceStart;
      const gz = this.map.zones.garage;
      if (Math.hypot(p.x - rs.x, p.y - rs.y) < 48) ctx = 'race';
      else if (Math.hypot(p.x - gz.x, p.y - gz.y) < 48) ctx = 'garage';
    }
    if (ctx !== this.context) {
      this.context = ctx;
      this.touch.setAction(ctx === 'race' ? 'RACE' : ctx === 'garage' ? 'REPAIR' : null);
      if (ctx === 'race') this.hud.toast(this.touch.enabled ? 'TAP RACE TO START DOWNTOWN LOOP' : 'PRESS E TO START DOWNTOWN LOOP', 3000);
      if (ctx === 'garage') this.hud.toast(this.touch.enabled ? 'TAP REPAIR TO FIX YOUR CAR' : 'PRESS E TO REPAIR', 3000);
    }
    for (const m of this.markerFx) {
      const on = !this.race.active;
      m.ring.setVisible(on);
      m.label.setVisible(on);
      m.glow.setVisible(on).setAlpha(0.3 + Math.sin(this.time0 * 4) * 0.12);
    }
    if (!interact || !ctx) return;
    if (ctx === 'race') {
      this.traffic.clearArea(this.race.startX - 60, this.race.startY, 420);
      this.race.start(p);
      this.hud.toast('GET READY', 1200);
      this.camX = p.x;
      this.camY = p.y;
      this.lastCountdown = -1;
      this.hud.hint('Two laps of downtown Bayview. Follow the yellow checkpoints. Beat the rivals!', 3500);
    } else if (ctx === 'garage') {
      if (p.damage < 1) this.hud.toast('YOUR CAR IS ALREADY PERFECT');
      else {
        const cost = Math.min(this.save.money, Math.ceil(p.damage * 2));
        this.save.money -= cost;
        p.damage = 0;
        writeSave(this.save);
        this.hud.toast(`REPAIRED · -$${cost}`);
        this.sound2.beep(660);
      }
    }
  }

  private effects(dyn: Vehicle[], dt: number) {
    for (const v of dyn) {
      const c = Math.cos(v.angle);
      const s = Math.sin(v.angle);
      const rear = v.len / 2 - 5;
      const side = v.wid / 2 - 3;
      const sliding = (v.slip > 70 || (v.input.handbrake && v.speed > 80)) && v.speed > 60;
      const burnout = v.input.throttle > 0 && v.forward < 60 && v.forward > -5 && v.speed < 60 && v === this.player && v.input.brake > 0;
      if ((sliding || burnout) && !v.surface.offroad) {
        for (const k of [-1, 1]) {
          const img = this.skids[this.skidIdx];
          this.skidIdx = (this.skidIdx + 1) % SKIDS;
          img.setPosition(v.x - c * rear - s * side * k, v.y - s * rear + c * side * k).setRotation(v.angle).setAlpha(0.32);
        }
      }
      if (v.surface.offroad && v.speed > 50 && Math.random() < dt * 30) {
        this.dust.setParticleTint(v.surface.dust);
        this.dust.emitParticleAt(v.x - c * rear, v.y - s * rear, 1);
      }
      if (v.damage > 55 && Math.random() < dt * (v.damage / 10)) this.smoke.emitParticleAt(v.x + c * (v.len / 2 - 4), v.y + s * (v.len / 2 - 4), 1);
    }
    // fade skids slowly
    if (Math.random() < 0.25) for (const sk of this.skids) if (sk.alpha > 0) sk.setAlpha(Math.max(0, sk.alpha - 0.004));
  }

  /** Redraw chunks where street furniture was knocked over, with debris and a thud. */
  private handleKnocked() {
    const q = this.map.knockQueue;
    if (!q.length) return;
    for (const prop of q.splice(0)) {
      this.chunks.refreshAround(prop.x, prop.y);
      const tint = prop.kind === 'tree' ? 0x3e7430 : prop.kind === 'cone' ? 0xf07a1a : 0xc8ccd4;
      this.debris.setParticleTint(tint);
      this.debris.emitParticleAt(prop.x, prop.y, prop.kind === 'tree' ? 10 : 6);
      const d = Math.hypot(prop.x - this.player.x, prop.y - this.player.y);
      if (d < 60) {
        this.sound2.crash(prop.kind === 'cone' ? 0.05 : 0.25);
        if (prop.kind !== 'cone') this.cameras.main.shake(90, 0.002);
      }
    }
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.cameras.main;
    // the look-ahead offset eases separately so the view doesn't swing when you turn
    const kl = damp(2.2, dt);
    this.lookX += (clamp(p.vx * 0.4, -160, 160) - this.lookX) * kl;
    this.lookY += (clamp(p.vy * 0.4, -110, 110) - this.lookY) * kl;
    const tx = p.x + this.lookX;
    const ty = p.y + this.lookY;
    const k = damp(6, dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    const sp = clamp(p.speed / p.stats.maxSpeed, 0, 1);
    const target = this.baseZoom() * this.userZoom * (1 - 0.16 * sp);
    this.zoom += (target - this.zoom) * damp(2, dt);
    cam.setZoom(this.zoom);
    cam.centerOn(this.camX, this.camY);
  }

  private waypoint: { x: number; y: number } | null = null;

  private openBigMap() {
    if (this.paused || this.resultsShown || this.editingControls) return;
    this.bigMap.waypoint = this.waypoint;
    this.sound2.engine(0, 0);
    this.sound2.skid(0);
    this.bigMap.open(this.hudFrame());
  }

  private hudFrame() {
    const p = this.player;
    const markers: Marker[] = [];
    for (const c of this.traffic.cars) if (c.active) markers.push({ x: c.x, y: c.y, color: 'rgba(40,40,48,0.7)', kind: 'dot' });
    const race = this.race;
    let raceInfo;
    if (race.active) {
      for (const e of race.entries) if (!e.isPlayer) markers.push({ x: e.car.x, y: e.car.y, color: hexStr(e.color), kind: 'dot' });
      const cp = race.nextCheckpoint();
      if (cp && race.state !== 'finished') markers.push({ x: cp.x, y: cp.y, color: '#f0b429', kind: 'ring' });
      raceInfo = {
        pos: race.position(),
        total: race.entries.length,
        lap: race.player?.lap ?? 0,
        laps: race.def.laps,
        time: race.time,
        cpAngle: cp && race.state === 'running' ? Math.atan2(cp.y - p.y, cp.x - p.x) : null,
      };
    } else {
      markers.push({ x: this.map.zones.raceStart.x, y: this.map.zones.raceStart.y, color: '#f0b429', kind: 'flag' });
      markers.push({ x: this.map.zones.garage.x, y: this.map.zones.garage.y, color: '#3a8bd8', kind: 'wrench' });
    }
    let waypointAngle: number | null = null;
    if (this.waypoint) {
      if (Math.hypot(this.waypoint.x - p.x, this.waypoint.y - p.y) < 80) {
        this.waypoint = null;
        this.hud.toast('WAYPOINT REACHED', 1800);
      } else {
        markers.push({ x: this.waypoint.x, y: this.waypoint.y, color: '#e03a2e', kind: 'pin' });
        if (!race.active) waypointAngle = Math.atan2(this.waypoint.y - p.y, this.waypoint.x - p.x);
      }
    }
    return {
      speed: p.forward,
      maxSpeed: p.stats.maxSpeed,
      throttle: p.input.throttle,
      damage: p.damage,
      money: this.save.money,
      streetRep: this.save.rep.street,
      weather: `${this.dayNight.clock} · ${this.weather.label}`,
      player: { x: p.x, y: p.y, angle: p.angle },
      markers,
      route: race.active ? race.checkpoints : undefined,
      night: this.dayNight.night,
      race: raceInfo,
      waypointAngle,
      fps: this.showFps ? this.game.loop.actualFps : undefined,
    };
  }
}
