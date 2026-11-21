/* CT78.A10.Synth -- sound for the toy synthesizer.
 *
 * Same plan as CT55 / CT61 / CT72: ONE software synthesizer makes every sample, for the speakers and for the movie, so a
 * recording's sound is exactly what you hear and is locked to the picture.
 *   * Not recording: a ScriptProcessor pulls Synth.render() in real time (48 kHz).
 *   * Recording: each movie frame renders exactly 48000/fps samples in the frame loop; they go to the movie's audio
 *     encoder and to a small queue the speakers play from.
 * Notes (note on / note off) are applied at the start of each render() call (about 20 ms at most), then sound for the
 * rest of that block.
 *
 * Tones (the "Tone" button; A8: each song also picks its own, see CT78.A10.Synth_songs.js):
 *   0 Piano (A8): slightly stretched partials that die away faster the higher they are; the damper stops it on key up.
 *   1 Electric piano (A8): a bell-like sine with a little FM "bark" at the strike, a quick high "tine", a slow tremolo.
 *   2 Organ (A8): a church/drawbar organ: steady pipes at 16', 8', 4', 2 2/3', 2', 1 1/3', 1'; no decay while held.
 *   3 Toy organ (odd harmonics, buzzy), 4 Music box (bright partials that ring and die away), 5 Chip (a narrow pulse).
 * A short plastic "clack" is added when a key goes down and a softer one when it comes up.
 * A small stereo echo gives the toy a room.  Nothing is loaded from the internet; no sound files.
 */
(function (global) {
  'use strict';
  const SR = 48000, TAU = Math.PI * 2;
  const TONES = [
    // A8: the three instruments the songs use. `gen` voices: partial k at frequency f*ratio[k], amplitude amp[k], dying at decay(k, f) per second
    { name: 'Piano', icon: 'piano', gen: true, att: 0.002, rel: 0.16, gain: 0.95, clack: 0.35,
      ratios: Array.from({ length: 10 }, (_, i) => (i + 1) * Math.sqrt(1 + 0.00035 * (i + 1) * (i + 1))),
      amps: [1, 0.62, 0.42, 0.3, 0.2, 0.16, 0.07, 0.09, 0.05, 0.04],
      decay: (k, f) => (0.32 + 0.24 * k) * (0.55 + f / 520) },
    { name: 'Electric piano', icon: 'epiano', gen: true, att: 0.003, rel: 0.22, gain: 1.05, clack: 0.25, fm: { index: 1.5, floor: 0.12, rate: 3.2 }, trem: 0.13,
      ratios: [1, 2, 7.1], amps: [1, 0.12, 0.22], decay: (k, f) => [0.38 + f / 1600, 0.9, 13][k] },
    { name: 'Organ', icon: 'organ', gen: true, att: 0.035, rel: 0.09, gain: 0.62, clack: 0.2, organ: true,
      ratios: [0.5, 1, 2, 3, 4, 6, 8], amps: [0.42, 1, 0.62, 0.3, 0.34, 0.14, 0.12], decay: () => 0 },
    { name: 'Toy organ', amps: [1, 0.0, 0.42, 0.0, 0.26, 0.0, 0.16, 0.0, 0.1], att: 0.006, dec: 0.15, sus: 0.8, rel: 0.12, perc: 0 },
    { name: 'Music box', amps: [1, 0, 0, 0.0], partials: [1, 2.756, 5.404, 8.933], pamps: [1, 0.55, 0.3, 0.14], att: 0.002, dec: 0.9, sus: 0.0, rel: 0.35, perc: 1 },
    { name: 'Chip', amps: [1, 0.5, 0.33, 0.25, 0.2, 0.0, 0.14, 0.12, 0.11], att: 0.003, dec: 0.2, sus: 0.7, rel: 0.08, perc: 0 },
  ];
  const DELAY_L = Math.round(SR * 0.19), DELAY_R = Math.round(SR * 0.235);

  class Synth {
    constructor() {
      this.voices = [];                 // {note, f, ph, env, stage, age, vel, pan, tone, held}
      this.pending = [];                // note events waiting for the next render()
      this.tone = 0; this.volume = 0.8; this.muted = true;
      this.seed = 0x78a1;
      this.dl = new Float32Array(DELAY_L); this.dr = new Float32Array(DELAY_R); this.di = 0;
      this.click = [];                  // {age, amp, f}
      this.lp = [0, 0];
    }
    rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
    noteOn(note, vel = 0.8) { this.pending.push({ on: true, note, vel }); }
    noteOff(note) { this.pending.push({ on: false, note }); }
    allOff() { this.pending.push({ all: true }); }
    setTone(i) { this.tone = ((i % TONES.length) + TONES.length) % TONES.length; }
    get toneName() { return TONES[this.tone].name; }
    get toneIcon() { return TONES[this.tone].icon || 'toy'; }   // A8: for the toy's display
    get toneCount() { return TONES.length; }
    _apply() {
      for (const e of this.pending) {
        if (e.all) { for (const v of this.voices) v.held = false; continue; }
        if (e.on) {
          for (const v of this.voices) if (v.note === e.note) v.held = false;     // retrigger: the old one releases
          const v = { note: e.note, f: 440 * Math.pow(2, (e.note - 69) / 12), ph: 0, env: 0, stage: 0, age: 0, vel: e.vel,
            pan: Math.max(-0.7, Math.min(0.7, (e.note - 60) / 24)), tone: this.tone, held: true, vib: this.rnd() * TAU };
          const T = TONES[this.tone];
          if (T.gen) {   // A8: each partial's amplitude, and what it is multiplied by every sample (its decay)
            const bright = 0.55 + 0.45 * e.vel;
            v.pa = T.amps.map((a, k) => a * Math.pow(bright, k * 0.5));
            v.pm = T.ratios.map((r, k) => Math.exp(-T.decay(k, v.f) / SR));
            if (T.fm) { v.fmI = T.fm.index - T.fm.floor; v.fmM = Math.exp(-T.fm.rate / SR); }
          }
          this.voices.push(v);
          this.click.push({ age: 0, amp: (0.05 + 0.09 * e.vel) * (T.clack === undefined ? 1 : T.clack), f: 0.35 + this.rnd() * 0.2, lp: 0 });
          if (this.voices.length > 24) this.voices.shift();
        } else {
          for (const v of this.voices) if (v.note === e.note && v.held) { v.held = false; this.click.push({ age: 0, amp: 0.02, f: 0.25, lp: 0 }); }
        }
      }
      this.pending.length = 0;
    }
    /** n samples of planar stereo: out[0..n) left, out[n..2n) right */
    render(n) {
      this._apply();
      const out = new Float32Array(2 * n), dt = 1 / SR, m = this.muted ? 0 : this.volume;
      const fb = 0.28;
      for (let s = 0; s < n; s++) {
        let L = 0, R = 0;
        for (const v of this.voices) {
          const T = TONES[v.tone];
          if (T.gen) {   // A8: piano, electric piano, organ
            if (v.held) { if (v.env < 1) v.env = Math.min(1, v.env + dt / T.att); }
            else { v.env -= v.env * dt / (T.rel * 0.37); if (v.env < 1e-4) v.dead = true; }
            v.age += dt;
            const vib = T.organ ? 1 + 0.0022 * Math.sin(TAU * 6.1 * v.age + v.vib) : 1;
            v.ph += v.f * vib * dt; if (v.ph > 1000) v.ph -= 1000;
            const fmx = T.fm ? (T.fm.floor + v.fmI) * Math.sin(TAU * v.ph) : 0;
            if (T.fm) v.fmI *= v.fmM;
            let x = 0, live = 0;
            for (let k = 0; k < v.pa.length; k++) {
              const a = v.pa[k]; if (a < 1e-5) continue; live++;
              if (v.f * T.ratios[k] < 12000) x += a * Math.sin(TAU * v.ph * T.ratios[k] + (k === 0 ? fmx : 0));
              v.pa[k] = a * v.pm[k];
            }
            if (!live) v.dead = true;
            if (T.trem) x *= 1 + T.trem * Math.sin(TAU * 4.6 * v.age + v.vib);
            const g = x * v.env * (0.35 + 0.65 * v.vel) * 0.3 * T.gain * 0.32;
            const pl = Math.cos((v.pan + 1) * Math.PI / 4), pr = Math.sin((v.pan + 1) * Math.PI / 4);
            L += g * pl * 1.41; R += g * pr * 1.41;
            continue;
          }
          // envelope
          if (v.held) {
            if (v.stage === 0) { v.env += dt / T.att; if (v.env >= 1) { v.env = 1; v.stage = 1; } }
            else if (v.stage === 1) { v.env += (T.sus - v.env) * dt / (T.dec * 0.37); }
          } else { v.env -= v.env * dt / (T.rel * 0.37); if (v.env < 1e-4) v.dead = true; }
          if (T.perc && v.held && v.stage === 1) { /* music box: rings and dies away whether held or not */ }
          v.age += dt;
          const vib = 1 + 0.0035 * Math.sin(TAU * 5.2 * v.age + v.vib) * Math.min(1, v.age * 2);
          v.ph += v.f * vib * dt; if (v.ph > 1000) v.ph -= 1000;
          let x = 0;
          if (T.partials) {
            for (let k = 0; k < T.partials.length; k++) {
              const f = v.f * T.partials[k]; if (f > 9000) break;
              x += Math.sin(TAU * v.ph * T.partials[k]) * T.pamps[k] * Math.exp(-v.age * (1.5 + 3.5 * k) * (v.held ? 1 : 2));
            }
            x *= 0.6;
          } else {
            for (let k = 0; k < T.amps.length; k++) { const a = T.amps[k]; if (a && v.f * (k + 1) < 9000) x += Math.sin(TAU * v.ph * (k + 1)) * a; }
            x *= 0.34;
          }
          const g = x * v.env * (0.35 + 0.65 * v.vel) * 0.32;
          const pl = Math.cos((v.pan + 1) * Math.PI / 4), pr = Math.sin((v.pan + 1) * Math.PI / 4);
          L += g * pl * 1.41; R += g * pr * 1.41;
        }
        for (const c of this.click) {                    // the plastic clack: a burst of noise through a one-pole low-pass
          c.age += dt; if (c.age > 0.035) continue;
          c.lp += (this.rnd() * 2 - 1 - c.lp) * c.f;
          const v = c.lp * c.amp * Math.exp(-c.age * 160); L += v; R += v;
        }
        // echo
        const el = this.dl[this.di % DELAY_L], er = this.dr[this.di % DELAY_R];
        const oL = L + el * 0.5, oR = R + er * 0.5;
        this.dl[this.di % DELAY_L] = L * 0.45 + er * fb; this.dr[this.di % DELAY_R] = R * 0.45 + el * fb; this.di++;
        out[s] = oL; out[n + s] = oR;
      }
      if (this.voices.length) this.voices = this.voices.filter((v) => !v.dead);
      if (this.click.length) this.click = this.click.filter((c) => c.age < 0.035);
      for (let i = 0; i < 2 * n; i++) out[i] = Math.tanh(out[i] * m * 1.3);
      return out;
    }
  }

  /** speakers: real-time pull when live; a queue fed by the movie frames while recording (from CT55.A7) */
  class Speaker {
    constructor(synth) { this.synth = synth; this.ctx = null; this.mode = 'live'; this.q = []; this.qLen = 0; this.qOff = 0; }
    get running() { return !!this.ctx && this.ctx.state === 'running'; }
    start() {
      if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
      const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return;
      try { this.ctx = new AC({ sampleRate: SR }); } catch { this.ctx = new AC(); }
      const node = this.ctx.createScriptProcessor(1024, 0, 2);
      node.onaudioprocess = (e) => {
        const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1), n = L.length;
        if (this.mode === 'live') { const b = this.synth.render(n); L.set(b.subarray(0, n)); R.set(b.subarray(n)); return; }
        let w = 0;
        while (w < n && this.q.length) {
          const b = this.q[0], bn = b.length / 2, take = Math.min(n - w, bn - this.qOff);
          L.set(b.subarray(this.qOff, this.qOff + take), w); R.set(b.subarray(bn + this.qOff, bn + this.qOff + take), w);
          w += take; this.qOff += take; this.qLen -= take;
          if (this.qOff >= bn) { this.q.shift(); this.qOff = 0; }
        }
        for (; w < n; w++) { L[w] = 0; R[w] = 0; }
      };
      node.connect(this.ctx.destination);
      this.node = node;
      if (this.ctx.state !== 'running') this.ctx.resume();
    }
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
    stop() { if (!this.ctx) return; try { if (this.node) { this.node.onaudioprocess = null; this.node.disconnect(); } this.ctx.close(); } catch (e) { /* already closed */ } this.ctx = null; this.node = null; }
    setMode(m) { this.mode = m; this.q.length = 0; this.qLen = 0; this.qOff = 0; }
    feed(buf) {
      if (this.mode !== 'film' || !this.running) return;
      this.q.push(buf); this.qLen += buf.length / 2;
      while (this.qLen > SR * 0.35 && this.q.length > 1) { const b = this.q.shift(); this.qLen -= b.length / 2 - this.qOff; this.qOff = 0; }
    }
  }

  global.CT78Sound = { SR, Synth, Speaker, TONES };
})(window);
