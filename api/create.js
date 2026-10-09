import { handler, readBody, send, sessionCode, token, HttpError } from "../lib/http.js";
import { createSession, usingRedis } from "../lib/store.js";
import { allPairs } from "../lib/game.js";

const str = (v, max = 2000) => (v ?? "").toString().slice(0, max);

export default handler(["POST"], async (req, res) => {
  // Ohne Redis hat jede Serverless-Instanz ihren eigenen Speicher -> Sessions "verschwinden" sofort.
  if (process.env.VERCEL && !usingRedis) throw new HttpError(500, "Keine Datenbank verbunden: Upstash Redis im Vercel-Projekt einrichten und neu deployen.");

  const body = await readBody(req);

  const pw = process.env.HOST_PASSWORD;
  if (pw && body.password !== pw) throw new HttpError(401, "Falsches Host-Passwort");

  const headers = Array.isArray(body.data?.headers) ? body.data.headers.map((h) => str(h, 200)) : [];
  const rawRows = Array.isArray(body.data?.rows) ? body.data.rows : [];
  if (!headers.length || rawRows.length < 2) throw new HttpError(400, "Es werden mindestens 2 Personen benötigt.");
  if (rawRows.length > 200 || headers.length > 100) throw new HttpError(400, "Tabelle ist zu groß.");
  const rows = rawRows.map((r) => Object.fromEntries(headers.map((h) => [h, str(r?.[h])])));

  const c = body.cfg || {};
  const nameCol = headers.includes(c.nameCol) ? c.nameCol : headers[0];
  const photoCol = headers.includes(c.photoCol) ? c.photoCol : "";
  const fields = (Array.isArray(c.fields) ? c.fields : []).filter((f) => headers.includes(f) && f !== nameCol && f !== photoCol);
  const maxRounds = Math.max(0, Math.min(500, parseInt(c.maxRounds, 10) || 0));
  const timer = c.timer === "" || c.timer == null ? 15 : Math.max(0, Math.min(120, parseInt(c.timer, 10) || 0));
  const cfg = { nameCol, photoCol, fields, progressive: !!c.progressive, maxRounds, timer };

  const session = {
    code: "", hostKey: token(), gid: 1, createdAt: Date.now(),
    data: { headers, rows }, cfg,
    phase: "lobby", round: 0, used: [], current: null, result: null,
  };
  if (!allPairs(session).length) throw new HttpError(400, "Keine befüllten Frage-Spalten ausgewählt.");

  for (let i = 0; i < 10; i++) {
    session.code = sessionCode();
    if (await createSession(session)) return send(res, 200, { code: session.code, hostKey: session.hostKey });
  }
  throw new HttpError(500, "Konnte keinen freien Session-Code finden.");
});
