/* Hintergrundmusik und Soundeffekte – komplett per Web Audio erzeugt (keine Audiodateien, keine Lizenzen). */
const Sound = (() => {
  const PREF = "sbq_sound";
  let ctx = null, master = null, music = null, noiseBuf = null;
  let enabled = false, playing = false, loopTimer = null, step = 0, nextTime = 0;

  const TEMPO = 144, STEP = 60 / TEMPO / 2; // Achtelnoten
  // Fröhliche 8-Takt-Melodie (MIDI-Noten, 0 = Pause) über C – Am – F – G
  const MEL = [
    76,79,84,79, 76, 0,79, 0,   81,84,88,84, 81, 0,79,76,   77,81,84,81, 77, 0,81,84,   86,83,79,83, 86, 0,84,83,
    76,79,84,79, 76, 0,79,81,   81,84,88,84, 81, 0,79,76,   77,81,84,86, 88, 0,86,84,   79,81,83,86, 84, 0, 0, 0,
  ];
  const ROOTS = [48,45,41,43, 48,45,41,43];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.28; music.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function tone(freq, t, dur, type = "square", vol = 0.15, dest = master, slideTo = null) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function hat(t, vol = 0.07) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 6000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f); f.connect(g); g.connect(music); s.start(t);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.2) {
      const i = step % MEL.length, bar = Math.floor(i / 8), pos = i % 8;
      if (MEL[i]) tone(hz(MEL[i]), nextTime, STEP * 0.85, "square", 0.09, music);
      const r = ROOTS[bar];
      if (pos % 2 === 0) tone(hz(pos % 4 === 0 ? r : r + 7), nextTime, STEP * 1.5, "triangle", 0.3, music);
      hat(nextTime, pos % 2 ? 0.05 : 0.025);
      nextTime += STEP; step++;
    }
  }

  function startMusic() {
    if (!enabled || playing || !ensure()) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setValueAtTime(0.28, ctx.currentTime);
    loopTimer = setInterval(schedule, 50); schedule();
  }
  function stopMusic() {
    playing = false; clearInterval(loopTimer);
    if (ctx) { music.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); setTimeout(() => { if (!playing) music.gain.value = 0.28; }, 300); }
  }

  const SFX = {
    start(t) { [72,76,79,84].forEach((m, i) => tone(hz(m), t + i * 0.07, 0.12, "square", 0.12)); },
    hint(t) { tone(hz(84), t, 0.1, "triangle", 0.2); tone(hz(91), t + 0.08, 0.15, "triangle", 0.2); },
    tick(t) { tone(1200, t, 0.05, "square", 0.08); },
    tickUrgent(t) { tone(1700, t, 0.07, "square", 0.12); },
    lock(t) { tone(hz(88), t, 0.08, "triangle", 0.18); },
    correct(t) { [72,76,79].forEach((m, i) => tone(hz(m), t + i * 0.09, 0.15, "square", 0.13)); tone(hz(84), t + 0.27, 0.45, "square", 0.13); },
    wrong(t) { // „Womp womp womp wooomp“
      [[58,0.22],[57,0.22],[56,0.22]].forEach(([m,d], i) => tone(hz(m), t + i * 0.26, d, "sawtooth", 0.1));
      tone(hz(55), t + 0.78, 0.7, "sawtooth", 0.1, master, hz(52));
    },
    reveal(t) { for (let i = 0; i < 10; i++) hat(t + i * 0.035, 0.12); tone(hz(72), t + 0.36, 0.5, "square", 0.1); tone(hz(76), t + 0.36, 0.5, "square", 0.08); tone(hz(79), t + 0.36, 0.5, "square", 0.08); },
    fanfare(t) {
      [[72,0.12],[72,0.12],[72,0.12],[77,0.5],[79,0.2],[81,0.2],[84,0.8]].reduce((at, [m, d]) => { tone(hz(m), at, d, "square", 0.13); tone(hz(m - 12), at, d, "triangle", 0.2); return at + d + 0.03; }, t);
    },
  };

  function sfx(name) {
    if (!enabled || !ensure() || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01);
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(PREF, on ? "1" : "0"); } catch (e) {}
    if (on) startMusic(); else stopMusic();
    document.querySelectorAll("[data-sound-toggle]").forEach(renderButton);
  }
  function renderButton(b) { b.textContent = enabled ? "🔊 Sound an" : "🔇 Sound aus"; b.setAttribute("aria-pressed", enabled); }

  /** Verbindet einen Button als Ein/Aus-Schalter. Ein gespeichertes „an“ startet beim ersten Klick/Tipp auf die Seite. */
  function bindToggle(btn) {
    btn.dataset.soundToggle = "1";
    btn.onclick = () => setEnabled(!enabled);
    let saved = false;
    try { saved = localStorage.getItem(PREF) === "1"; } catch (e) {}
    if (saved) {
      enabled = true;
      const resume = () => { document.removeEventListener("pointerdown", resume, true); if (enabled) startMusic(); };
      document.addEventListener("pointerdown", resume, true);
    }
    renderButton(btn);
  }

  return { bindToggle, sfx, startMusic, stopMusic, get enabled() { return enabled; } };
})();
