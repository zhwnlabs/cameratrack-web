import test from 'node:test';
import assert from 'node:assert/strict';
import { PortalProcessor } from '../web/js/tracking/portal.js';
import { FILTER_KEYS } from '../web/js/tracking/filters.js';

const W = 960, H = 540;
/** Tangan sintetis: ujung jari diletakkan di piksel yang ditentukan (frame 960x540). */
function makeHand({ thumb, index, middle, ring, pinky, wrist = [480, 500] }) {
  const lm = Array.from({ length: 21 }, () => ({ x: wrist[0] / W, y: wrist[1] / H }));
  const set = (id, p) => (lm[id] = { x: p[0] / W, y: p[1] / H });
  set(0, wrist); set(4, thumb); set(8, index); set(12, middle); set(16, ring); set(20, pinky);
  return lm;
}
const open = (cx) => makeHand({
  thumb: [cx - 60, 300], index: [cx - 30, 100], middle: [cx, 80], ring: [cx + 30, 100], pinky: [cx + 80, 300],
  wrist: [cx, 500],
});
const fist = (cx) => makeHand({
  thumb: [cx - 20, 450], index: [cx - 10, 450], middle: [cx, 450], ring: [cx + 10, 450], pinky: [cx + 20, 450],
  wrist: [cx, 500],
});
const pinch = (cx) => makeHand({
  thumb: [cx - 60, 300], index: [cx - 30, 100], middle: [cx, 80], ring: [cx + 30, 100], pinky: [cx - 40, 305],
  wrist: [cx, 500],
});

test('urutan filter sama dengan Retrolens.py', () => {
  assert.deepEqual([...FILTER_KEYS], [
    'dual-tone', 'thermal', 'sketch', 'pixelate', 'glitch', 'invert',
    'red-channel', 'edge', 'blur', 'cartoon', 'rainbow-wave',
  ]);
});

test('tanpa tangan: tidak ada portal', () => {
  const p = new PortalProcessor();
  const r = p.update([], 1);
  assert.equal(r.portals.length, 0);
  assert.equal(r.handCount, 0);
});

test('satu tangan 2D: portal dari jempol, telunjuk, tengah, kelingking', () => {
  const p = new PortalProcessor();
  const r = p.update([open(300)], 1);
  assert.equal(r.portals.length, 1);
  assert.equal(r.portals[0].poly.length, 4);
});

test('dua tangan terbuka: quad bersih; tangan miring: bowtie', () => {
  const p = new PortalProcessor();
  const a = open(250); const b = open(700);
  const r = p.update([a, b], 1);
  assert.equal(r.portals.length, 1);
  assert.equal(r.isBowtie, false);
  const tilted = makeHand({ thumb: [700, 300], index: [760, 360], middle: [770, 380], ring: [780, 400], pinky: [790, 420], wrist: [700, 500] });
  const r2 = p.update([a, tilted], 2);
  assert.equal(r2.isBowtie, true);
});

test('pinch jempol+kelingking mengganti filter dengan cooldown 0.15 dtk', () => {
  const p = new PortalProcessor();
  assert.equal(p.currentFilterName, 'dual-tone');
  assert.equal(p.update([pinch(300)], 1).filterChanged, true);
  assert.equal(p.currentFilterName, 'thermal');
  assert.equal(p.update([pinch(300)], 1.05).filterChanged, false); // masih cooldown
  assert.equal(p.update([pinch(300)], 1.2).filterChanged, true);
  assert.equal(p.currentFilterName, 'sketch');
});

test('dua kepalan mengganti mode 2D/3D dengan cooldown 1.2 dtk', () => {
  const p = new PortalProcessor();
  assert.equal(p.is3dMode, false);
  assert.equal(p.update([fist(250), fist(700)], 5).modeChanged, true);
  assert.equal(p.is3dMode, true);
  assert.equal(p.update([fist(250), fist(700)], 5.5).modeChanged, false);
  assert.equal(p.update([fist(250), fist(700)], 6.5).modeChanged, true);
  assert.equal(p.is3dMode, false);
});

test('mode 3D dengan dua tangan: dua portal dengan filter berbeda', () => {
  const p = new PortalProcessor();
  p.toggleMode();
  const r = p.update([open(250), open(700)], 1);
  assert.equal(r.portals.length, 2);
  assert.equal(r.portals[0].poly.length, 6);
  assert.notEqual(r.portals[0].filterKey, r.portals[1].filterKey);
});

test('cycleFilter berputar dua arah dan reset() mengembalikan awal', () => {
  const p = new PortalProcessor();
  p.cycleFilter(-1);
  assert.equal(p.currentFilterName, 'rainbow-wave');
  p.cycleFilter(1);
  assert.equal(p.currentFilterName, 'dual-tone');
  p.cycleFilter(3); p.toggleMode();
  p.reset();
  assert.equal(p.activeFilterIdx, 0);
  assert.equal(p.is3dMode, false);
});
