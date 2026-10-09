import { handler, readBody, send, token, HttpError } from "../lib/http.js";
import { getSession, getPlayers, setPlayer } from "../lib/store.js";

export default handler(["POST"], async (req, res) => {
  const body = await readBody(req);
  const code = (body.code || "").toString().trim().toUpperCase();
  const name = (body.name || "").toString().trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw new HttpError(400, "Bitte einen Namen eingeben.");

  const s = await getSession(code);
  if (!s) throw new HttpError(404, "Session nicht gefunden. Code prüfen!");

  const players = await getPlayers(code);
  if (Object.values(players).some((p) => p.name.toLowerCase() === name.toLowerCase()))
    throw new HttpError(409, "Dieser Name ist schon vergeben.");
  if (Object.keys(players).length >= 100) throw new HttpError(400, "Session ist voll.");

  const pid = token(12);
  await setPlayer(code, pid, { name, score: 0, joinedAt: Date.now() });
  send(res, 200, { code, pid, name });
});
