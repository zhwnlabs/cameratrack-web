#!/usr/bin/env node
/**
 * Server statis kecil untuk menguji hasil build secara lokal.
 *   node scripts/serve.mjs [folder] [--base /cameratracking/] [--port 4173]
 * Dengan --base, situs dilayani dari subdirektori seperti di GitHub Pages
 * (https://<user>.github.io/cameratracking/), sehingga bug path terlihat lebih awal.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const dir = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'dist');
const base = opt('--base', '/');
const port = Number(opt('--port', 4173));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (!path.startsWith(base)) {
    res.writeHead(404).end('Di luar base path');
    return;
  }
  path = path.slice(base.length);
  let file = normalize(join(dir, path));
  if (!file.startsWith(dir)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }
  const size = statSync(file).size;
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Melayani ${dir} di http://localhost:${port}${base}`));
