/**
 * Local dev server: serves /public and routes /api/brief to the same handler Vercel uses.
 * Run: GEMINI_API_KEY=... node server.js
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/brief.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.svg': 'image/svg+xml' };

function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

createServer(async (req, res) => {
  wrap(res);
  if (req.url.startsWith('/api/brief')) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 400000) return res.status(413).json({ error: 'Payload too large.' });
    }
    req.body = raw;
    return handler(req, res);
  }
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
  const file = join(root, path || 'index.html');
  if (!file.startsWith(root)) return res.status(403).end();
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.status(404).end('Not found');
  }
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
