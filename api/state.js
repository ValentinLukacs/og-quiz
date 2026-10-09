import { handler, query, send, HttpError } from "../lib/http.js";
import { snapshot } from "../lib/store.js";
import { publicState } from "../lib/game.js";

export default handler(["GET"], async (req, res) => {
  const q = query(req);
  const code = (q.code || "").toString().toUpperCase();
  const snap = await snapshot(code);
  if (!snap) throw new HttpError(404, "Session nicht gefunden oder abgelaufen.");
  const isHost = !!q.hk && q.hk === snap.s.hostKey;
  const pid = q.pid && snap.players[q.pid] ? q.pid : null;
  if (q.pid && !pid) return send(res, 200, { ...publicState(snap, { isHost }), unknownPlayer: true });
  send(res, 200, publicState(snap, { pid, isHost }));
});
