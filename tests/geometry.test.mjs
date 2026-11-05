import test from 'node:test';
import assert from 'node:assert/strict';
import {
  euclideanDist, isFistClosed, isHandRotated, sortQuadBowtie, sortQuadClean,
} from '../web/js/tracking/geometry.js';

test('euclideanDist: segitiga 3-4-5', () => {
  assert.equal(euclideanDist([0, 0], [3, 4]), 5);
});

test('isHandRotated: tegak vs miring', () => {
  assert.equal(isHandRotated([100, 200], [100, 120]), false); // telunjuk di atas jempol
  assert.equal(isHandRotated([100, 100], [100, 140]), true); // dy > 25
  assert.equal(isHandRotated([100, 100], [200, 100]), true); // dominan horizontal
});

test('sortQuadClean: kiri-atas, kanan-atas, kanan-bawah, kiri-bawah', () => {
  const q = sortQuadClean([[300, 300], [100, 100], [300, 100], [100, 300]]);
  assert.deepEqual(q, [[100, 100], [300, 100], [300, 300], [100, 300]]);
});

test('sortQuadBowtie: sisi kanan ditukar sehingga menyilang', () => {
  const q = sortQuadBowtie([[300, 300], [100, 100], [300, 100], [100, 300]]);
  assert.deepEqual(q, [[100, 100], [300, 300], [300, 100], [100, 300]]);
});

function hand(tipDist) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  for (const id of [8, 12, 16, 20]) lm[id] = { x: 0.5, y: 0.5 - tipDist / 540 };
  return lm;
}

test('isFistClosed: ambang 80 px', () => {
  assert.equal(isFistClosed(hand(40), 960, 540, 80), true);
  assert.equal(isFistClosed(hand(200), 960, 540, 80), false);
});
