'use strict';
/* Sonido sintetizado con Web Audio: efectos y música procedural, sin archivos de audio. */
window.Sound = (() => {
  let ac = null, master, sfxBus, musBus, noiseBuf;
  let sfxOn = true, musOn = true;
  const SFX_VOL = 0.5, MUS_VOL = 0.2;
  const last = {};

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = 0.8; master.connect(comp);
      sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(master);
      musBus = ac.createGain(); musBus.gain.value = musOn ? MUS_VOL : 0; musBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  const startTime = o => (o.when != null ? o.when : ac.currentTime + (o.t || 0));

  function tone(f, o = {}) {
    const t0 = startTime(o), d = o.d || 0.1, v = o.v || 0.2;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + d + 0.03);
  }

  function noise(o = {}) {
    const t0 = startTime(o), d = o.d || 0.1, v = o.v || 0.2;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = o.ftype || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + d + 0.03);
  }

  const seq = (notes, step, o) => notes.forEach((f, i) => tone(f, Object.assign({}, o, { t: i * step })));

  const FX = {
    shoot:  () => tone(1000, { f2: 1600, type: 'triangle', d: 0.07, v: 0.06 }),
    disc:   () => tone(380, { f2: 900, type: 'sawtooth', d: 0.12, v: 0.04 }),
    zap:    () => { noise({ d: 0.25, v: 0.22, freq: 5000, ftype: 'highpass' }); tone(120, { f2: 40, type: 'sawtooth', d: 0.2, v: 0.1 }); },
    hit:    () => noise({ d: 0.05, v: 0.1, freq: 1800 }),
    kill:   () => tone(320, { f2: 90, type: 'square', d: 0.09, v: 0.045 }),
    gem:    () => tone(1400 + Math.random() * 400, { f2: 2200, type: 'sine', d: 0.06, v: 0.06 }),
    coin:   () => { tone(1320, { type: 'square', d: 0.06, v: 0.05 }); tone(1760, { type: 'square', d: 0.12, v: 0.05, t: 0.06 }); },
    level:  () => seq([523, 659, 784, 1047], 0.07, { type: 'triangle', d: 0.2, v: 0.15 }),
    click:  () => tone(700, { type: 'triangle', d: 0.05, v: 0.1 }),
    tick:   () => tone(1900, { type: 'square', d: 0.025, v: 0.045 }),
    pew:     () => tone(900, { f2: 500, type: 'square', d: 0.06, v: 0.05 }),
    shotgun: () => { noise({ d: 0.18, v: 0.22, freq: 1600 }); tone(140, { f2: 60, type: 'sawtooth', d: 0.12, v: 0.1 }); },
    smg:     () => { noise({ d: 0.04, v: 0.08, freq: 3000 }); tone(700, { f2: 400, type: 'square', d: 0.03, v: 0.03 }); },
    sniper:  () => { noise({ d: 0.3, v: 0.2, freq: 5000, ftype: 'highpass' }); tone(220, { f2: 50, type: 'sawtooth', d: 0.25, v: 0.12 }); },
    slash:   () => noise({ d: 0.12, v: 0.16, freq: 6000, ftype: 'highpass' }),
    launch:  () => { noise({ d: 0.25, v: 0.1, freq: 900 }); tone(300, { f2: 700, type: 'triangle', d: 0.2, v: 0.06 }); },
    boom:    () => { noise({ d: 0.45, v: 0.28, freq: 700 }); tone(90, { f2: 35, type: 'sine', d: 0.4, v: 0.3 }); },
    hurt:   () => { tone(220, { f2: 70, type: 'sawtooth', d: 0.22, v: 0.18 }); noise({ d: 0.12, v: 0.14, freq: 900 }); },
    chest:  () => seq([392, 523, 659, 784, 1047], 0.06, { type: 'square', d: 0.15, v: 0.07 }),
    evolve: () => { seq([523, 659, 784, 1047, 1319, 1568], 0.08, { type: 'triangle', d: 0.3, v: 0.14 }); noise({ d: 0.6, v: 0.08, freq: 5000, ftype: 'highpass', t: 0.1 }); },
    boss:   () => { tone(80, { f2: 40, type: 'sawtooth', d: 1.2, v: 0.28 }); tone(82, { f2: 41, type: 'square', d: 1.2, v: 0.12 }); },
    warn:   () => { tone(600, { type: 'square', d: 0.1, v: 0.07 }); tone(450, { type: 'square', d: 0.15, v: 0.07, t: 0.12 }); },
    win:    () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.12, { type: 'triangle', d: 0.3, v: 0.16 }),
    lose:   () => seq([392, 349, 311, 262], 0.2, { type: 'sawtooth', d: 0.35, v: 0.1 }),
    buy:    () => { tone(880, { type: 'square', d: 0.07, v: 0.08 }); tone(1320, { type: 'square', d: 0.15, v: 0.08, t: 0.07 }); },
    error:  () => tone(160, { type: 'square', d: 0.15, v: 0.1 }),
    ult:    () => { tone(60, { f2: 30, type: 'sawtooth', d: 1.0, v: 0.25 }); noise({ d: 0.9, v: 0.25, freq: 900 }); seq([392, 523, 659, 784, 1047], 0.05, { type: 'square', d: 0.25, v: 0.08 }); noise({ d: 0.5, v: 0.12, freq: 6000, ftype: 'highpass', t: 0.25 }); },
    revive: () => seq([262, 392, 523, 784, 1047], 0.06, { type: 'sine', d: 0.4, v: 0.18 }),
  };

  function play(name, gap = 0.03) {
    if (!ac || !sfxOn || ac.state !== 'running' || !FX[name]) return;
    const now = ac.currentTime;
    if (now - (last[name] ?? -1) < gap) return;
    last[name] = now;
    FX[name]();
  }

  // ---- Música procedural: progresión Am - F - C - G ----
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const PAT = [0, 1, 2, 1, 0, 2, 1, 2];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let timer = null, step = 0, nextT = 0, mode = 'calm';

  function playStep(s, t, sd) {
    const boss = mode === 'boss';
    const bar = Math.floor(s / 8) % 4, i = s % 8, ch = CHORDS[bar];
    if (i === 0 || i === 4 || (boss && i % 2 === 0)) tone(mtof(ch[0] - 24), { type: 'triangle', d: sd * 1.8, v: 0.35, when: t, bus: musBus });
    const note = ch[PAT[i]] + 12 + (boss && i % 4 === 3 ? 12 : 0);
    tone(mtof(note), { type: boss ? 'sawtooth' : 'square', d: sd * 0.9, v: boss ? 0.045 : 0.05, when: t, bus: musBus });
    if (boss || s % 2 === 1) noise({ d: 0.03, v: boss ? 0.07 : 0.035, freq: 7000, ftype: 'highpass', when: t, bus: musBus });
    if (boss && i % 4 === 0) tone(110, { f2: 40, type: 'sine', d: 0.15, v: 0.5, when: t, bus: musBus });
  }

  function schedule() {
    if (!ac || ac.state !== 'running') return;
    const sd = 60 / (mode === 'boss' ? 150 : 112) / 2;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.02;
    while (nextT < ac.currentTime + 0.2) { playStep(step, nextT, sd); nextT += sd; step++; }
  }

  function startMusic() {
    if (!ac) return;
    stopMusic();
    step = 0; nextT = ac.currentTime + 0.1; mode = 'calm';
    timer = setInterval(schedule, 60);
  }
  function stopMusic() { if (timer) clearInterval(timer); timer = null; }

  return {
    init, play, startMusic, stopMusic,
    setMode(m) { mode = m; },
    suspend() { if (ac && ac.state === 'running') ac.suspend(); },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },
    setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? SFX_VOL : 0; },
    setMusic(on) { musOn = on; if (musBus) musBus.gain.value = on ? MUS_VOL : 0; },
    get sfx() { return sfxOn; },
    get music() { return musOn; },
  };
})();
