#!/usr/bin/env node
/**
 * Pemeriksa hasil build: memastikan semua aset yang dirujuk ada dan semua
 * path bersifat relatif (aman dijalankan dari subdirektori GitHub Pages).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const errors = [];
const err = (m) => errors.push(m);

const mustExist = ['index.html', 'css/style.css', 'js/main.js', 'models/hand_landmarker.task', '.nojekyll'];
for (const f of mustExist) if (!existsSync(join(dist, f))) err(`Berkas wajib tidak ada: ${f}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isExternal = (u) => /^(https?:|data:|mailto:|#|\/\/)/.test(u);

// 1. rujukan di HTML dan CSS
const html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (isExternal(u)) continue;
  if (u.startsWith('/')) err(`index.html memakai path absolut (rusak di subdirektori): ${u}`);
  else if (!existsSync(join(dist, u.split(/[?#]/)[0]))) err(`index.html merujuk berkas yang tidak ada: ${u}`);
}
const css = readFileSync(join(dist, 'css/style.css'), 'utf8');
for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
  const u = m[1];
  if (isExternal(u)) continue;
  if (u.startsWith('/')) err(`style.css memakai path absolut: ${u}`);
  else if (!existsSync(join(dist, 'css', u.split(/[?#]/)[0]))) err(`style.css merujuk berkas yang tidak ada: ${u}`);
}

// 2. import relatif di seluruh JS harus menunjuk berkas yang ada
const jsFiles = walk(join(dist, 'js')).filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('.')) {
      err(`${f.replace(dist, '')}: import non-relatif tidak didukung tanpa bundler: ${spec}`);
      continue;
    }
    if (!existsSync(resolve(dirname(f), spec))) err(`${f.replace(dist, '')}: import rusak → ${spec}`);
  }
  if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(src)) err(`${f.replace(dist, '')}: memuat URL localhost`);
  if (/\bfetch\(\s*['"`]\//.test(src)) err(`${f.replace(dist, '')}: fetch memakai path absolut`);
}

// 3. runtime MediaPipe (hanya peringatan: ada fallback CDN)
if (!existsSync(join(dist, 'vendor/mediapipe/vision_bundle.mjs'))) {
  console.warn('[check] PERINGATAN: runtime MediaPipe tidak ada di dist/vendor (memakai fallback CDN).');
}

if (errors.length) {
  console.error(`[check] ${errors.length} masalah:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log(`[check] OK: ${jsFiles.length} modul JS, semua aset dan import terpenuhi.`);
