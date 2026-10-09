// Lokaler Testserver (ohne Vercel): node dev-server.js  →  http://localhost:3000
// Ohne Redis-Umgebungsvariablen wird ein In-Memory-Speicher verwendet.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { usingRedis } from "./lib/store.js";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
const handlers = {};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
    try {
      handlers[name] ??= (await import(`./api/${name}.js`)).default;
    } catch {
      res.statusCode = 404; return res.end("not found");
    }
    return handlers[name](req, res);
  }
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!extname(p)) p += ".html"; // cleanUrls wie auf Vercel
  const file = normalize(join(root, p));
  if (!file.startsWith(normalize(root))) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404; res.end("not found");
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Steckbrief-Quiz läuft auf http://localhost:${port} (${usingRedis ? "Redis" : "In-Memory-Speicher"})`));
