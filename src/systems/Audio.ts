/** Procedural Web Audio: engine, tyre squeal, crashes, rain. No audio files. */
export class AudioEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private engGain?: GainNode;
  private osc1?: OscillatorNode;
  private osc2?: OscillatorNode;
  private filter?: BiquadFilterNode;
  private skidGain?: GainNode;
  private rainGain?: GainNode;
  private noise?: AudioBuffer;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.05;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.filter.connect(this.engGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    this.skidGain = this.loopNoise('bandpass', 1700, 0);
    this.rainGain = this.loopNoise('lowpass', 1400, 0);
  }

  private loopNoise(type: BiquadFilterType, freq: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    return g;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** speedNorm 0..1, throttle 0..1 */
  engine(speedNorm: number, throttle: number) {
    if (!this.ctx || !this.osc1) return;
    const gears = 5;
    const sp = Math.min(0.999, Math.max(0, speedNorm));
    const gear = Math.floor(sp * gears);
    const frac = sp * gears - gear;
    const f = 48 + frac * 85 + gear * 9 + throttle * 8;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(f, t, 0.04);
    this.osc2!.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.filter!.frequency.setTargetAtTime(350 + throttle * 900 + sp * 600, t, 0.05);
    this.engGain!.gain.setTargetAtTime(0.035 + throttle * 0.04 + sp * 0.02, t, 0.05);
  }

  skid(v: number) {
    if (this.ctx) this.skidGain!.gain.setTargetAtTime(Math.min(0.12, v), this.ctx.currentTime, 0.05);
  }

  rain(v: number) {
    if (this.ctx) this.rainGain!.gain.setTargetAtTime(v * 0.06, this.ctx.currentTime, 0.3);
  }

  crash(intensity: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + intensity * 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(Math.min(0.5, 0.1 + intensity * 0.35), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, 0.4);
  }

  thunder() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = ctx.createGain();
    const t = ctx.currentTime + 0.4;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    src.stop(t + 2.6);
  }

  beep(freq: number, dur = 0.15) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur);
  }
}
