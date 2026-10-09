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
  return { ri, fields, hintIdx: 1, startedAt: Date.now(), deadline: deadlineFor(s) };
}

/** Ende des Antwort-Fensters (null = ohne Timer). Startet bei jedem Hinweis neu. */
export function deadlineFor(s) {
  const sec = timerSeconds(s);
  return sec ? Date.now() + sec * 1000 : null;
}
export const timerSeconds = (s) => (s.cfg.timer ?? 15);

/** Kulanz für Netzwerk-Verzögerung, bevor eine Antwort als zu spät gilt. */
export const GRACE_MS = 1500;

// Punkte nach Reihenfolge der richtigen Antworten: 1. 500, 2. 400, 3. 300, 4. 250, alle weiteren 200.
const RANK_POINTS = [500, 400, 300, 250];
const OTHER_POINTS = 200;

/** Im Hinweis-Modus gibt es für spätere Hinweise anteilig weniger (z. B. 3 Hinweise: 100 % / 67 % / 33 %). */
function hintFactor(s, hintIdx) {
  if (!s.cfg.progressive) return 1;
  const max = s.current.fields.length;
  return (max + 1 - hintIdx) / max;
}
const round10 = (x) => Math.round(x / 10) * 10;

export function maxPointsNow(s) { return round10(RANK_POINTS[0] * hintFactor(s, s.current.hintIdx)); }

/** Wertet die Antworten aus und schreibt Punkte in die Spieler-Objekte. */
export function scoreRound(s, answers, players) {
  const counts = {};
  const won = {};
  for (const a of Object.values(answers)) counts[a.g] = (counts[a.g] || 0) + 1;
  Object.entries(answers)
    .filter(([pid, a]) => a.g === s.current.ri && players[pid])
    .sort((x, y) => x[1].t - y[1].t)
    .forEach(([pid, a], rank) => {
      const pts = round10((RANK_POINTS[rank] ?? OTHER_POINTS) * hintFactor(s, a.h));
      players[pid].score = (players[pid].score || 0) + pts;
      won[pid] = pts;
    });
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
    timer: timerSeconds(s),
    serverNow: Date.now(),
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
      pointsNow: maxPointsNow(s),
      deadline: s.current.deadline || null,
    };
  }

  // Der ganze Steckbrief wird nie ausgeliefert – sichtbar sind nur die gestellten Hinweise.
  if (s.phase === "revealed" && s.result) {
    out.reveal = {
      correct: s.current.ri,
      counts: s.result.counts,
      winners: Object.entries(s.result.won)
        .filter(([id]) => players[id])
        .map(([id, pts]) => ({ name: players[id].name, pts }))
        .sort((a, b) => b.pts - a.pts),
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
