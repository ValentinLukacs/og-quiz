import { handler, readBody, send, HttpError } from "../lib/http.js";
import { getSession, saveSession, getPlayers, setPlayer, resetPlayers, getAnswers, acquireRevealLock } from "../lib/store.js";
import { pickQuestion, scoreRound } from "../lib/game.js";

export default handler(["POST"], async (req, res) => {
  const body = await readBody(req);
  const code = (body.code || "").toString().toUpperCase();
  const s = await getSession(code);
  if (!s) throw new HttpError(404, "Session nicht gefunden oder abgelaufen.");
  if (body.hostKey !== s.hostKey) throw new HttpError(403, "Keine Host-Berechtigung.");

  switch (body.action) {
    case "next": {
      if (s.phase === "question") throw new HttpError(409, "Bitte zuerst auflösen.");
      if (s.cfg.maxRounds && s.round >= s.cfg.maxRounds) throw new HttpError(409, "Alle Runden gespielt – zeig das Endergebnis!");
      const q = pickQuestion(s);
      if (!q) throw new HttpError(409, "Keine Fragen mehr übrig – zeig das Endergebnis!");
      s.used.push(...q.fields.map((f) => q.ri + "|" + f));
      s.current = q; s.round++; s.phase = "question"; s.result = null;
      break;
    }
    case "hint": {
      if (s.phase !== "question" || !s.cfg.progressive) throw new HttpError(409, "Gerade kein Hinweis möglich.");
      if (s.current.hintIdx >= s.current.fields.length) throw new HttpError(409, "Keine weiteren Hinweise.");
      s.current.hintIdx++;
      break;
    }
    case "reveal": {
      if (s.phase !== "question") throw new HttpError(409, "Gerade läuft keine Frage.");
      if (!(await acquireRevealLock(code, s.gid, s.round))) throw new HttpError(409, "Wird bereits aufgelöst.");
      const [answers, players] = await Promise.all([getAnswers(code, s.gid, s.round), getPlayers(code)]);
      s.result = scoreRound(s, answers, players);
      await Promise.all(Object.keys(s.result.won).map((pid) => setPlayer(code, pid, players[pid])));
      s.phase = "revealed";
      break;
    }
    case "end": {
      if (s.phase === "question") throw new HttpError(409, "Bitte zuerst auflösen.");
      s.phase = "end";
      break;
    }
    case "reset": {
      const players = await getPlayers(code);
      Object.values(players).forEach((p) => { p.score = 0; });
      await resetPlayers(code, players);
      Object.assign(s, { gid: s.gid + 1, phase: "lobby", round: 0, used: [], current: null, result: null });
      break;
    }
    case "settings": {
      if (s.phase === "question") throw new HttpError(409, "Nicht während einer laufenden Frage.");
      if ("progressive" in body) s.cfg.progressive = !!body.progressive;
      if ("maxRounds" in body) s.cfg.maxRounds = Math.max(0, Math.min(500, parseInt(body.maxRounds, 10) || 0));
      break;
    }
    default:
      throw new HttpError(400, "Unbekannte Aktion.");
  }
  await saveSession(s);
  send(res, 200, { ok: true, phase: s.phase, round: s.round });
});
