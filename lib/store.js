// Speicher-Schicht: Upstash Redis (auf Vercel) oder In-Memory (lokale Entwicklung).
import { Redis } from "@upstash/redis";

const TTL = 60 * 60 * 12; // Sessions verfallen nach 12 Stunden

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const K = {
  session: (code) => `sbq:${code}`,
  players: (code) => `sbq:${code}:p`,
  answers: (code, gid, round) => `sbq:${code}:a:${gid}:${round}`,
  lock: (code, gid, round) => `sbq:${code}:rv:${gid}:${round}`,
};

/* ---------- Backend: Redis ---------- */
// Ohne automaticDeserialization liefert Upstash HGETALL als flache Liste [feld, wert, feld, wert, …].
function hashToObject(x) {
  if (!Array.isArray(x)) return x || {};
  const o = {};
  for (let i = 0; i < x.length; i += 2) o[x[i]] = x[i + 1];
  return o;
}

function redisBackend() {
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    async get(k) { return r.get(k); },
    async set(k, v, nx = false) {
      const res = await r.set(k, v, nx ? { ex: TTL, nx: true } : { ex: TTL });
      return res === "OK";
    },
    async hset(k, f, v) { const p = r.pipeline(); p.hset(k, { [f]: v }); p.expire(k, TTL); await p.exec(); },
    async hsetnx(k, f, v) {
      const p = r.pipeline(); p.hsetnx(k, f, v); p.expire(k, TTL);
      const [ok] = await p.exec();
      return ok === 1 || ok === true;
    },
    async hgetall(k) { return hashToObject(await r.hgetall(k)); },
    async del(...ks) { if (ks.length) await r.del(...ks); },
    async multi(fn) {
      // fn bekommt ein Objekt mit get/hgetall und gibt sie gebündelt in einem Request aus
      const p = r.pipeline();
      const isHash = [];
      fn({ get: (k) => { isHash.push(false); p.get(k); }, hgetall: (k) => { isHash.push(true); p.hgetall(k); } });
      return (await p.exec()).map((x, i) => (isHash[i] ? hashToObject(x) : x));
    },
  };
}

/* ---------- Backend: In-Memory (nur lokal) ---------- */
function memoryBackend() {
  const m = new Map();
  const hash = (k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
  const api = {
    async get(k) { const v = m.get(k); return typeof v === "string" ? v : null; },
    async set(k, v, nx = false) { if (nx && m.has(k)) return false; m.set(k, v); return true; },
    async hset(k, f, v) { hash(k).set(f, v); },
    async hsetnx(k, f, v) { const h = hash(k); if (h.has(f)) return false; h.set(f, v); return true; },
    async hgetall(k) { const h = m.get(k); return h instanceof Map ? Object.fromEntries(h) : {}; },
    async del(...ks) { ks.forEach((k) => m.delete(k)); },
    async multi(fn) {
      const ops = [];
      fn({ get: (k) => ops.push(api.get(k)), hgetall: (k) => ops.push(api.hgetall(k)) });
      return Promise.all(ops);
    },
  };
  return api;
}

export const usingRedis = Boolean(url && token);
const db = usingRedis ? redisBackend() : memoryBackend();

const parse = (v) => (v == null ? null : typeof v === "string" ? JSON.parse(v) : v);
const parseHash = (h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k, parse(v)]));

export async function createSession(session) {
  return db.set(K.session(session.code), JSON.stringify(session), true);
}
export async function getSession(code) { return parse(await db.get(K.session(code))); }
export async function saveSession(s) { await db.set(K.session(s.code), JSON.stringify(s)); }

export async function getPlayers(code) { return parseHash(await db.hgetall(K.players(code))); }
export async function setPlayer(code, pid, p) { await db.hset(K.players(code), pid, JSON.stringify(p)); }
export async function resetPlayers(code, players) {
  await db.del(K.players(code));
  for (const [pid, p] of Object.entries(players)) await setPlayer(code, pid, p);
}

export async function getAnswers(code, gid, round) { return parseHash(await db.hgetall(K.answers(code, gid, round))); }
/** Speichert eine Antwort nur, wenn der Spieler in dieser Runde noch nicht geantwortet hat. */
export async function addAnswer(code, gid, round, pid, a) {
  return db.hsetnx(K.answers(code, gid, round), pid, JSON.stringify(a));
}
/** Verhindert doppelte Punktevergabe, falls „Auflösen“ zweimal gleichzeitig geklickt wird. */
export async function acquireRevealLock(code, gid, round) { return db.set(K.lock(code, gid, round), "1", true); }

/** Session, Spieler und Antworten der aktuellen Runde in einem Request laden. */
export async function snapshot(code) {
  const s = await getSession(code);
  if (!s) return null;
  const [players, answers] = await db.multi((p) => {
    p.hgetall(K.players(code));
    p.hgetall(K.answers(code, s.gid, s.round));
  });
  return { s, players: parseHash(players), answers: parseHash(answers) };
}
