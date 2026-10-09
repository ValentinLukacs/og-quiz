import { handler, readBody, send, HttpError } from "../lib/http.js";
import { getSession, getPlayers, addAnswer } from "../lib/store.js";
import { GRACE_MS } from "../lib/game.js";

export default handler(["POST"], async (req, res) => {
  const body = await readBody(req);
  const code = (body.code || "").toString().toUpperCase();
  const s = await getSession(code);
  if (!s) throw new HttpError(404, "Session nicht gefunden.");
  if (s.phase !== "question" || body.round !== s.round) throw new HttpError(409, "Diese Frage ist schon vorbei.");

  if (s.current.deadline && Date.now() > s.current.deadline + GRACE_MS) throw new HttpError(409, "⏰ Zeit abgelaufen!");

  const players = await getPlayers(code);
  if (!players[body.pid]) throw new HttpError(403, "Unbekannter Spieler – bitte neu beitreten.");

  const g = Number(body.guess);
  if (!Number.isInteger(g) || g < 0 || g >= s.data.rows.length) throw new HttpError(400, "Ungültige Antwort.");

  const ok = await addAnswer(code, s.gid, s.round, body.pid, { g, h: s.current.hintIdx, t: Date.now() });
  if (!ok) throw new HttpError(409, "Du hast schon geantwortet.");
  send(res, 200, { ok: true });
});
