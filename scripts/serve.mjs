#!/usr/bin/env node
/*
 * Minimal zero-dependency static HTTP server for local development.
 *
 * Space Company is a fully static site (HTML + CSS + global JS) that only needs
 * to be served over HTTP so relative asset paths and localStorage behave like
 * production. This server intentionally adds no framework and no npm
 * dependency; it exists only to run the game locally and to back the
 * HTTP smoke test in the quality gates.
 *
 * Usage:  node scripts/serve.mjs [--port 8080] [--root .]
 *         PORT=8080 npm start
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(process.env.PORT || arg('--port', '8080'));
const SERVE_ROOT = resolve(ROOT, arg('--root', '.'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    // Resolve within SERVE_ROOT and reject path traversal.
    const filePath = normalize(join(SERVE_ROOT, pathname));
    if (!filePath.startsWith(SERVE_ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Internal Server Error');
    console.error('serve: error handling', req.url, err.message);
  }
});

server.listen(PORT, () => {
  console.log(`serve: Space Company available at http://localhost:${PORT}/ (root: ${SERVE_ROOT})`);
});
