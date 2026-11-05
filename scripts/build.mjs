#!/usr/bin/env node
/**
 * Build situs statis ke ./dist
 *
 *   web/                      → dist/               (HTML, CSS, JS)
 *   hand_landmarker.task      → dist/models/        (model yang sama dengan versi Python)
 *   node_modules/@mediapipe/tasks-vision
 *                             → dist/vendor/mediapipe/  (runtime + WASM, agar situs tidak bergantung CDN)
 *
 * Opsi:
 *   --require-vendor   gagal bila runtime MediaPipe belum terpasang (dipakai di CI)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const requireVendor = process.argv.includes('--require-vendor');

const log = (msg) => console.log(`[build] ${msg}`);
const fail = (msg) => {
  console.error(`[build] GAGAL: ${msg}`);
  process.exit(1);
};

// 1. bersihkan dan salin situs
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'web'), dist, { recursive: true });
log('web/ → dist/');

// 2. model hand landmarker
const model = join(root, 'hand_landmarker.task');
if (!existsSync(model)) fail('hand_landmarker.task tidak ditemukan di root repository.');
mkdirSync(join(dist, 'models'), { recursive: true });
cpSync(model, join(dist, 'models', 'hand_landmarker.task'));
log('hand_landmarker.task → dist/models/');

// 3. runtime MediaPipe dari node_modules
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const bundle = join(pkgDir, 'vision_bundle.mjs');
const wasmDir = join(pkgDir, 'wasm');
if (existsSync(bundle) && existsSync(wasmDir)) {
  const out = join(dist, 'vendor', 'mediapipe');
  mkdirSync(out, { recursive: true });
  cpSync(bundle, join(out, 'vision_bundle.mjs'));
  cpSync(wasmDir, join(out, 'wasm'), { recursive: true });
  const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  writeFileSync(join(out, 'VERSION.txt'), `@mediapipe/tasks-vision ${version}\n`);
  log(`@mediapipe/tasks-vision ${version} → dist/vendor/mediapipe/`);
} else if (requireVendor) {
  fail('@mediapipe/tasks-vision belum terpasang. Jalankan `npm install` terlebih dahulu.');
} else {
  console.warn('[build] PERINGATAN: runtime MediaPipe tidak ikut disalin; situs akan memuatnya dari CDN jsDelivr.');
}

// 4. GitHub Pages: jangan proses dengan Jekyll
writeFileSync(join(dist, '.nojekyll'), '');
log('selesai → dist/');
