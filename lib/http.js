import { randomBytes } from "node:crypto";

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function query(req) {
  if (req.query) return req.query;
  return Object.fromEntries(new URL(req.url, "http://x").searchParams);
}

export const token = (n = 16) => randomBytes(n).toString("hex");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function sessionCode(len = 5) {
  const b = randomBytes(len);
  return Array.from(b, (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
}

/** Wrapper: fängt Fehler ab und erlaubt nur bestimmte Methoden. */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) return send(res, 405, { error: "Methode nicht erlaubt" });
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: "Serverfehler" });
    }
  };
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
