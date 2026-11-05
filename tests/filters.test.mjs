import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, getFilter } from '../web/js/tracking/filters.js';

function makeImg(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = (x * 255) / w; data[i + 1] = (y * 255) / h; data[i + 2] = ((x + y) * 255) / (w + h); data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

for (const f of FILTERS) {
  test(`filter ${f.key}: berjalan, mempertahankan ukuran, alpha tetap 255`, () => {
    const img = makeImg(64, 48);
    f.fn(img, { scale: 1, time: 1.5 });
    assert.equal(img.data.length, 64 * 48 * 4);
    for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 255);
  });
}

test('invert membalik nilai RGB', () => {
  const img = makeImg(8, 8);
  const before = img.data.slice();
  getFilter('invert').fn(img, { scale: 1, time: 0 });
  assert.equal(img.data[0], 255 - before[0]);
  assert.equal(img.data[1], 255 - before[1]);
});

test('red-channel hanya menyisakan kanal merah', () => {
  const img = makeImg(8, 8);
  const r0 = img.data[20];
  getFilter('red-channel').fn(img, { scale: 1, time: 0 });
  assert.equal(img.data[21], 0);
  assert.equal(img.data[22], 0);
  assert.equal(img.data[20], r0);
});

test('dual-tone hanya menghasilkan dua warna', () => {
  const img = makeImg(32, 32);
  getFilter('dual-tone').fn(img, { scale: 1, time: 0 });
  const colors = new Set();
  for (let i = 0; i < img.data.length; i += 4) colors.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  assert.deepEqual([...colors].sort(), ['220,30,180', '255,140,10']);
});

test('getFilter menolak kunci tak dikenal', () => {
  assert.throws(() => getFilter('tidak-ada'), /tidak dikenal/);
});
