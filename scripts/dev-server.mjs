#!/usr/bin/env node
// Zero-dependency static server for working on the TradeLab frontend.
//
//   node scripts/dev-server.mjs          -> http://127.0.0.1:5173
//   PORT=8000 node scripts/dev-server.mjs
//
// ES modules refuse to load over file://, and some servers send .js files with
// the wrong MIME type. This server sets explicit types and disables caching so
// edits show up on the next refresh.
//
// It serves files only. Accounts (sign-up and sign-in) need the Python server,
// which also runs the user database: python3 scripts/dev_server.py
// Here, /api requests get a JSON error that says so, and the database file,
// server code and dotfiles such as .git are never served.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || process.argv[2] || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const PRIVATE_FOLDERS = new Set(['server', '__pycache__', 'node_modules']);
const PRIVATE_SUFFIXES = ['.db', '.db-journal', '.db-wal', '.db-shm', '.sqlite', '.sqlite3', '.py', '.pyc'];

function isPrivate(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  const last = (parts.at(-1) || '').toLowerCase();
  return parts.some((part) => part.startsWith('.') || PRIVATE_FOLDERS.has(part)) || PRIVATE_SUFFIXES.some((suffix) => last.endsWith(suffix));
}

const ACCOUNTS_UNAVAILABLE = JSON.stringify({
  error: {
    code: 'accounts_unavailable',
    message: 'Accounts need the TradeLab Python server, which runs the user database. Stop this server and run: python3 scripts/dev_server.py',
  },
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      // The app asks who is signed in on every load; answer that one calmly
      // (no console error) and refuse everything else with an explanation.
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (req.method === 'GET' && pathname === '/api/session') res.writeHead(200, headers).end(JSON.stringify({ user: null, unavailable: true }));
      else res.writeHead(503, headers).end(ACCOUNTS_UNAVAILABLE);
      return;
    }
    if (isPrivate(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = normalize(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`TradeLab dev server running at http://${shown}:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
