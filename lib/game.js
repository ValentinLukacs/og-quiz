// Spiellogik: Fragen ziehen, Punkte vergeben, öffentlichen Zustand bauen.

const filled = (v) => (v ?? "").toString().trim() !== "";
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rand = (a) => a[Math.floor(Math.random() * a.length)];

export function allPairs(s) {
  const out = [];
  s.data.rows.forEach((r, ri) => s.cfg.fields.forEach((f) => { if (filled(r[f])) out.push({ ri, f }); }));
  return out;
}

export function remainingCount(s) {
  const used = new Set(s.used);
  return allPairs(s).filter((p) => !used.has(p.ri + "|" + p.f)).length;
}

/** Wählt die nächste Frage. Personen, die bisher seltener dran waren, werden bevorzugt. */
export function pickQuestion(s) {
  const used = new Set(s.used);
  const pool = allPairs(s).filter((p) => !used.has(p.ri + "|" + p.f));
  if (!pool.length) return null;

  const asked = {};
  s.used.forEach((k) => { const ri = +k.split("|")[0]; asked[ri] = (asked[ri] || 0) + 1; });
  const persons = [...new Set(pool.map((p) => p.ri))];
  const min = Math.min(...persons.map((ri) => asked[ri] || 0));
  let candidates = persons.filter((ri) => (asked[ri] || 0) === min);
  const last = s.current?.ri;
  if (candidates.length > 1) candidates = candidates.filter((ri) => ri !== last);
  const ri = rand(candidates);

  const own = shuffle(pool.filter((p) => p.ri === ri).map((p) => p.f));
  const fields = s.cfg.progressive ? own.slice(0, 3) : own.slice(0, 1);
  return { ri, fields, hintIdx: 1, startedAt: Date.now() };
}

/** Punkte für eine Antwort, abhängig davon, bei welchem Hinweis geantwortet wurde. */
export function pointsFor(s, hintIdx) {
  if (!s.cfg.progressive) return 1;
  return Math.max(1, s.current.fields.length + 1 - hintIdx);
}

/** Wertet die Antworten aus und schreibt Punkte in die Spieler-Objekte. */
export function scoreRound(s, answers, players) {
  const counts = {};
  const won = {};
  for (const [pid, a] of Object.entries(answers)) {
    counts[a.g] = (counts[a.g] || 0) + 1;
    if (a.g === s.current.ri && players[pid]) {
      const pts = pointsFor(s, a.h);
      players[pid].score = (players[pid].score || 0) + pts;
      won[pid] = pts;
    }
  }
  return { counts, won };
}

const photoOf = (s, r) => (s.cfg.photoCol ? (r[s.cfg.photoCol] || "").trim() : "");

/** Zustand, den Spieler (und Host) per Polling bekommen. Die Lösung ist vor der Auflösung nicht enthalten. */
export function publicState({ s, players, answers }, { pid, isHost }) {
  const rows = s.data.rows;
  const leaderboard = Object.entries(players)
    .map(([id, p]) => ({ name: p.name, score: p.score || 0, me: id === pid }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "de"));

  const out = {
    code: s.code,
    phase: s.phase,
    round: s.round,
    maxRounds: s.cfg.maxRounds || null,
    progressive: !!s.cfg.progressive,
    remaining: remainingCount(s),
    people: rows.map((r, i) => ({ i, name: r[s.cfg.nameCol] || `Person ${i + 1}`, photo: photoOf(s, r) })),
    playerCount: leaderboard.length,
    answeredCount: Object.keys(answers).length,
    leaderboard,
  };

  if (s.current && (s.phase === "question" || s.phase === "revealed")) {
    const r = rows[s.current.ri];
    const shown = s.phase === "revealed" ? s.current.fields.length : s.current.hintIdx;
    out.question = {
      hints: s.current.fields.slice(0, shown).map((f) => ({ label: f, value: r[f] })),
      hintIdx: s.current.hintIdx,
      maxHints: s.current.fields.length,
      pointsNow: pointsFor(s, s.current.hintIdx),
    };
  }

  // Der ganze Steckbrief wird nie ausgeliefert – sichtbar sind nur die gestellten Hinweise.
  if (s.phase === "revealed" && s.result) {
    out.reveal = {
      correct: s.current.ri,
      counts: s.result.counts,
      winners: Object.keys(s.result.won).map((id) => players[id]?.name).filter(Boolean),
    };
  }

  if (pid && players[pid]) {
    const a = answers[pid];
    out.me = {
      name: players[pid].name,
      score: players[pid].score || 0,
      rank: leaderboard.findIndex((x) => x.me) + 1,
      answer: a ? a.g : null,
      answeredAtHint: a ? a.h : null,
    };
    if (out.reveal) out.me.won = s.result.won[pid] || 0;
  }

  if (isHost) {
    out.host = {
      answered: Object.keys(answers).map((id) => players[id]?.name).filter(Boolean),
      waiting: Object.entries(players).filter(([id]) => !answers[id]).map(([, p]) => p.name),
      // Spielt der Host selbst mit, bekommt er die Lösung vor der Auflösung nicht.
      solution: s.current && !out.me ? s.current.ri : null,
      totalQuestions: allPairs(s).length,
    };
  }
  return out;
}
