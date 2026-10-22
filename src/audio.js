// Synthesised sound effects and an ambient generative score (no audio files needed).
(function () {
  let ctx = null, master = null, sfxBus = null, musicBus = null, reverb = null;
  let noiseBuf = null;
  let musicTimer = null, musicArea = null;
  let muted = false;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    // simple reverb from decaying noise
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    musicBus.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);
    musicBus.connect(master);
    const sfxWet = ctx.createGain();
    sfxWet.gain.value = 0.18;
    sfxBus.connect(sfxWet);
    sfxWet.connect(reverb);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function noise(dur, freq, q, peak, type, sweepTo) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type || "bandpass";
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t, 0.005, peak, dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, peak, slideTo, delay, bus) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    env(g, t, 0.008, peak, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const SFX = {
    slash() { noise(0.14, 2400, 0.8, 0.5, "bandpass", 700); },
    hit() { noise(0.09, 900, 1.2, 0.8, "lowpass", 200); tone(160, 0.12, "square", 0.15, 60); },
    clang() { tone(1400, 0.25, "triangle", 0.2, 1100); noise(0.06, 5000, 2, 0.3, "highpass"); },
    jump() { noise(0.08, 600, 1, 0.18, "lowpass", 1400); },
    land() { noise(0.07, 300, 1, 0.25, "lowpass", 100); },
    dash() { noise(0.25, 300, 0.7, 0.4, "bandpass", 2600); },
    wings() { noise(0.3, 1200, 0.6, 0.35, "bandpass", 300); tone(500, 0.2, "sine", 0.08, 900); },
    hurt() { tone(90, 0.35, "sawtooth", 0.35, 40); noise(0.25, 700, 0.6, 0.6, "lowpass", 150); },
    die() { tone(110, 1.4, "sawtooth", 0.3, 30); noise(1.2, 400, 0.5, 0.5, "lowpass", 60); },
    shard() { tone(1600 + Math.random() * 400, 0.12, "triangle", 0.08); },
    soul() { tone(700, 0.25, "sine", 0.06, 1100); },
    cast() { noise(0.4, 400, 0.5, 0.6, "lowpass", 3000); tone(80, 0.5, "sawtooth", 0.25, 220); },
    focus() { tone(220, 0.9, "sine", 0.08, 440); },
    heal() { tone(523, 0.3, "triangle", 0.12); tone(784, 0.4, "triangle", 0.1, null, 0.08); },
    enemyDie() { noise(0.3, 500, 0.6, 0.6, "lowpass", 80); tone(200, 0.3, "square", 0.08, 50); },
    spit() { noise(0.15, 900, 2, 0.3, "bandpass", 400); },
    roar() { tone(70, 1.6, "sawtooth", 0.4, 45); noise(1.5, 250, 0.4, 0.5, "lowpass", 90); },
    boom() { noise(0.6, 200, 0.4, 0.9, "lowpass", 40); tone(55, 0.6, "sine", 0.5, 30); },
    pickup() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.6, "triangle", 0.12, null, i * 0.09)); },
    bench() { [262, 330, 392].forEach((f, i) => tone(f, 1.2, "sine", 0.1, null, i * 0.12)); },
    menu() { tone(880, 0.06, "triangle", 0.08); },
    select() { tone(660, 0.12, "triangle", 0.12); tone(990, 0.15, "triangle", 0.08, null, 0.05); },
    door() { noise(0.4, 150, 0.5, 0.4, "lowpass", 60); },
    wall() { noise(0.2, 300, 0.8, 0.6, "lowpass", 90); tone(120, 0.15, "square", 0.1, 60); },
    talk() { tone(300 + Math.random() * 120, 0.07, "triangle", 0.05); },
  };

  // ------------------------------------------------------------- music
  const SCALES = {
    pass: { root: 49, notes: [0, 3, 7, 10, 12, 15], tempo: 1.6 },
    village: { root: 52, notes: [0, 3, 5, 7, 10, 12], tempo: 1.4 },
    crossing: { root: 45, notes: [0, 2, 3, 7, 8, 12], tempo: 1.5 },
    nest: { root: 44, notes: [0, 1, 5, 6, 8, 12], tempo: 0.7 },
    depths: { root: 43, notes: [0, 1, 3, 7, 8, 10], tempo: 1.3 },
    throne: { root: 40, notes: [0, 3, 6, 7, 10, 12], tempo: 1.8 },
    boss: { root: 40, notes: [0, 1, 3, 6, 7, 12], tempo: 0.28 },
    title: { root: 45, notes: [0, 3, 7, 8, 12, 15], tempo: 1.7 },
  };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function playMusicStep() {
    if (!ctx || !musicArea) return;
    const sc = SCALES[musicArea] || SCALES.crossing;
    const boss = musicArea === "boss";
    const n = sc.root + 12 + HR.pick(sc.notes) + (Math.random() < 0.25 ? 12 : 0);
    tone(mtof(n), boss ? 0.35 : 2.6, boss ? "sawtooth" : "triangle", boss ? 0.045 : 0.07, null, 0, musicBus);
    if (Math.random() < (boss ? 0.5 : 0.3)) tone(mtof(sc.root + HR.pick(sc.notes)), boss ? 0.5 : 4, "sine", boss ? 0.09 : 0.08, null, 0, musicBus);
    if (boss && Math.random() < 0.5) noise(0.12, 120, 0.5, 0.35, "lowpass", 50);
    musicTimer = setTimeout(playMusicStep, sc.tempo * 1000 * (boss ? 1 : HR.rand(0.7, 1.4)));
  }

  function drone(area) {
    // low pad that sits under everything
    const sc = SCALES[area] || SCALES.crossing;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 3);
    g.connect(musicBus);
    const oscs = [0, 7].map((iv) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(sc.root - 12 + iv);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 260;
      o.connect(f); f.connect(g);
      o.start();
      return o;
    });
    return { g, oscs };
  }
  let currentDrone = null;

  HR.audio = {
    unlock() {
      init();
      if (ctx && ctx.state === "suspended") ctx.resume();
    },
    play(name) {
      if (!ctx || muted) return;
      const f = SFX[name];
      if (f) try { f(); } catch (e) { /* ignore audio glitches */ }
    },
    music(area) {
      if (!ctx || area === musicArea) return;
      musicArea = area;
      clearTimeout(musicTimer);
      if (currentDrone) {
        const d = currentDrone;
        d.g.gain.cancelScheduledValues(ctx.currentTime);
        d.g.gain.setValueAtTime(Math.max(d.g.gain.value, 0.0001), ctx.currentTime);
        d.g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
        setTimeout(() => d.oscs.forEach((o) => o.stop()), 1700);
      }
      currentDrone = area ? drone(area) : null;
      if (area) musicTimer = setTimeout(playMusicStep, 400);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    get muted() { return muted; },
  };
})();
