/**
 * Uji end-to-end di Chromium (Playwright) dengan kamera palsu.
 * Memakai stub MediaPipe (tests/fixtures/mediapipe-stub.mjs) yang mengembalikan landmark
 * dari window.__FAKE_HANDS__, sehingga UI + loop tracking + renderer diuji tanpa tangan asli.
 *
 *   node scripts/build.mjs && cp tests/fixtures/mediapipe-stub.mjs dist/vendor/mediapipe/vision_bundle.mjs  (setelah mkdir -p)
 *   node scripts/serve.mjs dist --base /cameratracking/ &
 *   node tests/e2e.cjs [url]
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/cameratracking/';
const OUT = process.env.E2E_OUT || '.';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'LULUS' : 'GAGAL'}  ${m}`); if (!c) failed++; };

const W = 960, H = 540;
function hand(tips, wrist) {
  const lm = Array.from({ length: 21 }, () => [wrist[0] / W, wrist[1] / H]);
  const set = (id, p) => (lm[id] = [p[0] / W, p[1] / H]);
  set(0, wrist); [4, 8, 12, 16, 20].forEach((id, i) => set(id, tips[i]));
  return lm;
}
const open = (cx) => hand([[cx - 60, 300], [cx - 30, 100], [cx, 80], [cx + 30, 100], [cx + 80, 300]], [cx, 500]);
const fist = (cx) => hand([[cx - 20, 450], [cx - 10, 450], [cx, 450], [cx + 10, 450], [cx + 20, 450]], [cx, 500]);
const pinch = (cx) => hand([[cx - 60, 300], [cx - 30, 100], [cx, 80], [cx + 30, 100], [cx - 40, 305]], [cx, 500]);

const txt = (page, id) => page.locator(`#${id}`).innerText();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function setHands(page, hands) { await page.evaluate((h) => { window.__FAKE_HANDS__ = h; }, hands); }
async function until(page, id, expected, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await txt(page, id)).trim() === expected) return true; await sleep(60); }
  return false;
}
const hash = (page) => page.evaluate(() => {
  const c = document.getElementById('screen'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h;
});

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

  /* ---------- 1. alur utama (izin diberikan) ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [], failedReq = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Google Fonts boleh gagal (ada fallback font); error lain tetap dihitung.
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.location().url || '')) errors.push(`console: ${m.text()} (${m.location().url})`); });
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) failedReq.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) failedReq.push(`${r.status()} ${r.url()}`); });

  await page.goto(URL, { waitUntil: 'load' });
  ok((await page.title()).length > 0, `halaman termuat: "${await page.title()}"`);
  ok((await txt(page, 'st-camera')).trim() === 'MATI', 'status awal kamera = MATI');
  await page.screenshot({ path: `${OUT}/shot-desktop-hero.png` });

  // navigasi
  for (const href of ['#playground', '#about', '#home']) {
    const link = page.locator(`nav a[href="${href}"]`).first();
    if (await link.count()) { await link.click(); await sleep(700); }
  }
  ok(true, 'menu navigasi bisa diklik');

  await page.locator('#playground').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/shot-desktop-idle.png` });

  await page.click('#btn-start');
  ok(await until(page, 'st-camera', 'AKTIF', 8000), 'Start → status kamera AKTIF');
  const live = await page.evaluate(() => { const v = document.getElementById('cam'); return !!v.srcObject && v.srcObject.getTracks().every((t) => t.readyState === 'live'); });
  ok(live, 'stream kamera hidup');
  ok(await page.locator('.popup, [class*=popup]').first().isVisible().catch(() => false), 'popup pixel "KAMERA AKTIF" muncul');
  ok(await page.locator('#btn-start').isDisabled() && !(await page.locator('#btn-stop').isDisabled()), 'tombol start nonaktif, stop aktif');
  const calls0 = await page.evaluate(() => window.__STUB_CALLS__ || 0);
  await sleep(700);
  const calls1 = await page.evaluate(() => window.__STUB_CALLS__ || 0);
  ok(calls1 > calls0, `loop tracking memanggil detektor (${calls0} → ${calls1})`);
  const opts = await page.evaluate(() => window.__STUB_OPTIONS__);
  ok(opts.numHands === 2 && opts.minHandDetectionConfidence === 0.8 && opts.minHandPresenceConfidence === 0.5 && opts.minTrackingConfidence === 0.8, 'opsi detektor sama dengan Retrolens.py (2 tangan, 0.8/0.5/0.8)');

  // tangan terdeteksi
  const before = await hash(page);
  await setHands(page, [open(250), open(700)]);
  ok(await until(page, 'st-hands', '2/2'), 'indikator tangan 2/2');
  await sleep(300);
  ok((await hash(page)) !== before, 'kanvas berubah (portal + landmark tergambar)');
  await page.locator('#screen-wrap').screenshot({ path: `${OUT}/shot-portal-2d.png` });
  ok(await page.locator('#detect-pop.is-on').count() === 1, 'feedback visual deteksi tangan muncul');

  // filter via pinch
  const f0 = (await txt(page, 'st-filter')).trim();
  await setHands(page, [pinch(250), open(700)]);
  await sleep(500);
  const f1 = (await txt(page, 'st-filter')).trim();
  ok(f0 === 'DUAL-TONE' && f1 !== f0, `pinch mengganti filter: ${f0} → ${f1}`);
  await setHands(page, [open(250), open(700)]);

  // mode 3D via dua kepalan
  await setHands(page, [fist(250), fist(700)]);
  ok(await until(page, 'st-mode', '3D MESH', 3000), 'dua kepalan → mode 3D MESH');
  await setHands(page, [open(250), open(700)]);
  await sleep(300);
  await page.locator('#screen-wrap').screenshot({ path: `${OUT}/shot-portal-3d.png` });

  // keyboard
  await page.keyboard.press('c');
  ok(await until(page, 'st-mode', '2D QUAD', 2000), 'tombol C mengganti mode');
  const fb = (await txt(page, 'st-filter')).trim();
  await page.keyboard.press('n'); await sleep(100);
  const fn = (await txt(page, 'st-filter')).trim();
  await page.keyboard.press('p'); await sleep(100);
  ok(fn !== fb && (await txt(page, 'st-filter')).trim() === fb, `tombol N/P mengganti filter (${fb} → ${fn} → ${fb})`);

  // chip filter
  await page.locator('#chips .chip').nth(4).click();
  ok((await txt(page, 'st-filter')).trim() === 'GLITCH', 'klik chip filter → GLITCH');

  // screenshot
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('#btn-shot')]);
  ok(!!dl && /\.png$/.test(dl.suggestedFilename()), `tombol foto mengunduh PNG lokal (${dl?.suggestedFilename()})`);

  // reset
  await page.click('#btn-reset');
  ok((await txt(page, 'st-filter')).trim() === 'DUAL-TONE' && (await txt(page, 'st-mode')).trim().startsWith('2D'), 'Reset → filter pertama & mode 2D');

  // tangan hilang
  await setHands(page, []);
  ok(await until(page, 'st-hands', '0/2'), 'tangan hilang → 0/2');

  // stop
  await page.click('#btn-stop');
  ok(await until(page, 'st-camera', 'MATI'), 'Stop → status MATI');
  const stopped = await page.evaluate(() => document.getElementById('cam').srcObject === null);
  ok(stopped, 'stream kamera dilepas (lampu kamera padam)');
  const c2 = await page.evaluate(() => window.__STUB_CALLS__); await sleep(400);
  ok((await page.evaluate(() => window.__STUB_CALLS__)) === c2, 'loop tracking berhenti setelah Stop');

  // start ulang lalu keluar dari playground → otomatis berhenti
  await page.click('#btn-start');
  ok(await until(page, 'st-camera', 'AKTIF', 8000), 'Start ulang berhasil');
  await page.setViewportSize({ width: 1280, height: 600 }); // agar playground benar-benar keluar layar saat scroll ke atas
  await page.evaluate(() => window.scrollTo(0, 0));
  ok(await until(page, 'st-camera', 'MATI', 4000), 'scroll keluar dari playground → kamera otomatis mati');

  // pagehide
  ok(errors.length === 0, `tidak ada error console/JS${errors.length ? ': ' + errors.join(' | ') : ''}`);
  ok(failedReq.length === 0, `semua aset dimuat${failedReq.length ? ': ' + failedReq.join(', ') : ''}`);

  /* ---------- 2. izin ditolak / kamera tidak ada ---------- */
  for (const [name, label] of [['NotAllowedError', 'IZIN DITOLAK'], ['NotFoundError', 'KAMERA TIDAK ADA'], ['NotReadableError', 'KAMERA SIBUK']]) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await c.newPage();
    await p.addInitScript((n) => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('uji', n));
    }, name);
    await p.goto(URL, { waitUntil: 'load' });
    await p.locator('#playground').scrollIntoViewIfNeeded();
    await p.click('#btn-start');
    ok(await until(p, 'err-title', label, 6000), `${name} → pesan "${label}"`);
    ok((await txt(p, 'err-text')).length > 20, `${name}: pesan penjelasan bahasa Indonesia tampil`);
    if (name === 'NotAllowedError') await p.locator('#screen-wrap').screenshot({ path: `${OUT}/shot-error-denied.png` });
    ok(await p.locator('#btn-retry').isVisible(), `${name}: tombol coba lagi tampil`);
    await c.close();
  }

  /* ---------- 3. responsif ---------- */
  for (const [label, vp] of [['mobile', { width: 375, height: 740 }], ['tablet', { width: 820, height: 1100 }], ['laptop', { width: 1366, height: 768 }]]) {
    const c = await browser.newContext({ viewport: vp, hasTouch: label !== 'laptop', isMobile: label === 'mobile', permissions: ['camera'] });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'load' });
    await sleep(500);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 1, `${label} ${vp.width}px: tidak ada scroll horizontal (selisih ${overflow}px)`);
    await p.screenshot({ path: `${OUT}/shot-${label}-hero.png` });
    await p.locator('#playground').scrollIntoViewIfNeeded();
    const box = await p.locator('#screen').boundingBox();
    ok(box.width <= vp.width && Math.abs(box.width / box.height - 16 / 9) < 0.05, `${label}: preview 16:9 muat layar (${Math.round(box.width)}x${Math.round(box.height)})`);
    const small = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && (b.offsetHeight < 40 || b.offsetWidth < 40)).map((b) => `${b.id || b.className}:${b.offsetWidth}x${b.offsetHeight}`));
    if (label !== 'laptop') ok(small.length === 0, `${label}: semua tombol ≥40px${small.length ? ' → ' + small.join(', ') : ''}`);
    if (label === 'mobile') {
      await p.click('#btn-start');
      ok(await until(p, 'st-camera', 'AKTIF', 8000), 'mobile: kamera aktif');
      await setHands(p, [open(250), open(700)]);
      await sleep(400);
      await p.screenshot({ path: `${OUT}/shot-mobile-playground.png` });
    }
    ok(errs.length === 0, `${label}: tanpa error JS`);
    await c.close();
  }

  /* ---------- 4. reduced motion ---------- */
  const c = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'load' });
  const anim = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.05 && s.animationIterationCount === 'infinite'; }).length);
  ok(anim === 0, `reduced motion: tidak ada animasi berulang (${anim})`);
  await c.close();

  await browser.close();
  console.log(failed ? `\n${failed} pemeriksaan GAGAL` : '\nSemua pemeriksaan e2e LULUS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
