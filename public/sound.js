/* Hintergrundmusik und Soundeffekte – komplett per Web Audio erzeugt (keine Audiodateien, keine Lizenzen). */
const Sound = (() => {
  const PREFS = { music: "sbq_music", sfx: "sbq_sfx" };
  const on = { music: false, sfx: false };
  let ctx = null, master = null, music = null, noiseBuf = null;
  let playing = false, loopTimer = null, step = 0, nextTime = 0;

  const TEMPO = 144, STEP = 60 / TEMPO / 2; // Achtelnoten
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- Das Stück ----------
     Jeder Teil hat 8 Takte à 8 Achtel. Melodie als MIDI-Noten: 0 = Pause, -1 = vorherigen Ton halten.
     Akkorde: [Grundton (Bass-Oktave), Dur/Moll]. Danach folgt die Reihenfolge der Teile (ca. 1:45 min). */
  const M = true, m = false;
  const C = [48, M], Dm = [50, m], Em = [52, m], F = [41, M], G = [43, M], Am = [45, m];
  const PARTS = {
    // Hauptthema
    A: { chords: [C, Am, F, G, C, Am, F, G], mel: [
      76,79,84,79,76, 0,79, 0,  81,84,88,84,81, 0,79,76,  77,81,84,81,77, 0,81,84,  86,83,79,83,86, 0,84,83,
      76,79,84,79,76, 0,79,81,  81,84,88,84,81, 0,79,76,  77,81,84,86,88, 0,86,84,  79,81,83,86,84, 0, 0, 0 ] },
    // Ruhigerer Melodieteil mit langen Tönen
    B: { chords: [F, G, Em, Am, F, G, C, C], mel: [
      81,-1,-1,79,77,-1,76,77,  79,-1,-1,-1,74,-1,76,77,  79,-1,76,-1,71,-1,72,74,  76,-1,-1,-1, 0, 0,72,74,
      77,-1,-1,76,77,-1,81,-1,  79,-1,-1,77,79,-1,83,-1,  84,-1,83,-1,79,-1,76,-1,  72,-1,-1,-1, 0, 0, 0, 0 ] },
    // Hüpfender „Zirkus“-Teil, staccato
    E: { chords: [C, G, Am, Em, F, C, Dm, G], mel: [
      84, 0,84, 0,83,84, 0,79,  83, 0,83, 0,81,83, 0,79,  81, 0,81, 0,79,81, 0,76,  79, 0,78, 0,79, 0,83, 0,
      81, 0,77, 0,81, 0,84, 0,  84, 0,79, 0,76, 0,79, 0,  77, 0,81, 0,86,-1,84,-1,  83,-1,79,-1,86,-1,-1,-1 ] },
    // Breakdown: erst nur Bass + Arpeggios, dann eine tiefe Melodie
    D: { chords: [Am, F, C, G, Am, F, C, G], mel: [
       0, 0, 0, 0, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 0, 0,
      69,72,76,-1,74,72,74,-1,  72,-1,69,-1,65,-1, 0, 0,  67,72,76,-1,79,-1,76,-1,  74,-1,-1,-1,71,-1,74,-1 ] },
  };
  // part, Transposition, Drums, Bass, Arpeggio, Klangfarbe der Melodie
  const ORDER = [
    { p: "A", t: 0, drums: "full", bass: "oompah", arp: false, lead: "square" },
    { p: "B", t: 0, drums: "full", bass: "walk",   arp: false, lead: "square" },
    { p: "E", t: 0, drums: "four", bass: "pulse",  arp: true,  lead: "square" },
    { p: "D", t: 0, drums: "half", bass: "long",   arp: true,  lead: "triangle" },
    { p: "A", t: 0, drums: "four", bass: "walk",   arp: true,  lead: "square" },
    { p: "E", t: 2, drums: "full", bass: "oompah", arp: false, lead: "square" },
    { p: "B", t: 2, drums: "half", bass: "walk",   arp: true,  lead: "triangle" },
    { p: "A", t: 2, drums: "full", bass: "oompah", arp: true,  lead: "square" },
  ];
  const BAR = 8, PART_STEPS = 8 * BAR;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.28; music.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
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

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.2);
  }
  function snare(t, vol = 0.14) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = 1800;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f); f.connect(g); g.connect(music); s.start(t, Math.random() * 0.1, 0.15);
  }

  function drums(style, bar, pos, t, lastBar) {
    if (lastBar && pos >= 4) { snare(t, 0.08 + (pos - 4) * 0.03); if (pos === 7) hat(t, 0.08); return; } // Fill am Ende jedes Teils
    if (style === "full") { if (pos === 0 || pos === 4 || (pos === 5 && bar % 2)) kick(t); if (pos === 2 || pos === 6) snare(t); hat(t, pos % 2 ? 0.05 : 0.025); }
    else if (style === "four") { if (pos % 2 === 0) kick(t); if (pos === 2 || pos === 6) snare(t, 0.1); if (pos % 2) hat(t, 0.07); }
    else if (style === "half") { if (pos === 0) kick(t); if (pos === 4) snare(t, 0.1); if (pos % 2 === 0) hat(t, 0.03); }
  }

  function bass(style, [root, major], pos, t, tr) {
    const r = root + tr, third = r + (major ? 4 : 3), fifth = r + 7;
    if (style === "oompah") { if (pos % 2 === 0) tone(hz(pos % 4 === 0 ? r : fifth), t, STEP * 1.5, "triangle", 0.3, music); }
    else if (style === "walk") { if (pos % 2 === 0) tone(hz([r, third, fifth, r + 9][pos / 2]), t, STEP * 1.7, "triangle", 0.3, music); }
    else if (style === "pulse") tone(hz(pos === 3 || pos === 7 ? r + 12 : r), t, STEP * 0.8, "triangle", 0.28, music);
    else if (style === "long") { if (pos === 0) tone(hz(r), t, STEP * 7.5, "triangle", 0.32, music); }
  }

  function arp([root, major], pos, t, tr) {
    const r = root + tr + 24, notes = [r, r + (major ? 4 : 3), r + 7, r + 12];
    tone(hz(notes[[0, 1, 2, 3, 2, 1, 0, 2][pos]]), t, STEP * 0.7, "triangle", 0.07, music);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.2) {
      const songStep = step % (ORDER.length * PART_STEPS);
      const sec = ORDER[Math.floor(songStep / PART_STEPS)], part = PARTS[sec.p];
      const i = songStep % PART_STEPS, bar = Math.floor(i / BAR), pos = i % BAR;
      const chord = part.chords[bar], t = nextTime;

      const note = part.mel[i];
      if (note > 0) {
        let len = 1; while (part.mel[i + len] === -1) len++;
        tone(hz(note + sec.t), t, STEP * (len - 0.15), sec.lead, sec.lead === "triangle" ? 0.2 : 0.09, music);
      }
      bass(sec.bass, chord, pos, t, sec.t);
      if (sec.arp) arp(chord, pos, t, sec.t);
      drums(sec.drums, bar, pos, t, bar === 7);
      nextTime += STEP; step++;
    }
  }

  function startMusic() {
    if (!on.music || playing || !ensure()) return;
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
    if (!on.sfx || !ensure() || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01);
  }

  const LABELS = {
    music: ["🎵", "Musik an", "🔇", "Musik aus"],
    sfx: ["🔔", "Effekte an", "🔕", "Effekte aus"],
  };
  function render() {
    document.querySelectorAll("[data-sound-toggle]").forEach((b) => {
      const k = b.dataset.soundToggle;
      const [icon, text] = on[k] ? LABELS[k].slice(0, 2) : LABELS[k].slice(2);
      b.innerHTML = `${icon}<span class="lbl"> ${text}</span>`;
      b.title = text;
      b.setAttribute("aria-pressed", on[k]);
      b.classList.toggle("off", !on[k]);
    });
  }
  function set(kind, value) {
    on[kind] = value;
    try { localStorage.setItem(PREFS[kind], value ? "1" : "0"); } catch (e) {}
    if (kind === "music") { if (value) startMusic(); else stopMusic(); }
    else if (value) sfx("lock"); // kurze Hörprobe
    render();
  }

  /** Verbindet die Schalter für Musik und Effekte. Gespeichertes „an“ startet beim ersten Klick/Tipp auf die Seite. */
  function bindToggles(musicBtn, sfxBtn) {
    musicBtn.dataset.soundToggle = "music";
    sfxBtn.dataset.soundToggle = "sfx";
    musicBtn.onclick = () => set("music", !on.music);
    sfxBtn.onclick = () => set("sfx", !on.sfx);
    let legacy = null;
    try { legacy = localStorage.getItem("sbq_sound"); } catch (e) {}
    for (const k of ["music", "sfx"]) {
      let v = null;
      try { v = localStorage.getItem(PREFS[k]); } catch (e) {}
      on[k] = (v ?? legacy) === "1";
    }
    if (on.music || on.sfx) {
      const resume = (e) => {
        if (e.target.closest && e.target.closest("[data-sound-toggle]")) return; // Klick auf einen Schalter regelt sich selbst
        document.removeEventListener("pointerdown", resume, true);
        ensure(); if (on.music) startMusic();
      };
      document.addEventListener("pointerdown", resume, true);
    }
    render();
  }

  return { bindToggles, sfx, startMusic, stopMusic, get musicPlaying() { return playing; } };
})();
