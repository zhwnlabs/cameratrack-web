/**
 * Bank filter portal. Padanan JavaScript dari `FilterBank` di Retrolens.py
 * (OpenCV → operasi piksel murni, tanpa dependensi).
 *
 * Setiap filter menerima `img` ({ data: RGBA, width, height }) dan MENGUBAHNYA
 * di tempat. `ctx` berisi:
 *   - scale: skala pemrosesan (1 = ukuran asli; <1 saat ROI besar diperkecil)
 *   - time:  waktu dalam detik (untuk filter beranimasi)
 */

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ---------------------------------------------------------------- helper */

function toGray(data, n) {
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    g[i] = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
  }
  return g;
}

function putGray(data, gray) {
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    data[j] = data[j + 1] = data[j + 2] = gray[i];
    data[j + 3] = 255;
  }
}

/** Box blur terpisah (horizontal lalu vertikal) dengan tepi direplikasi. */
function blurH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[o + Math.min(w - 1, Math.max(0, k))];
    dst[o] = sum * inv;
    for (let x = 1; x < w; x++) {
      sum += src[o + Math.min(w - 1, x + r)] - src[o + Math.max(0, x - r - 1)];
      dst[o + x] = sum * inv;
    }
  }
}

function blurV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[Math.min(h - 1, Math.max(0, k)) * w + x];
    dst[x] = sum * inv;
    for (let y = 1; y < h; y++) {
      sum += src[Math.min(h - 1, y + r) * w + x] - src[Math.max(0, y - r - 1) * w + x];
      dst[y * w + x] = sum * inv;
    }
  }
}

/** Ukuran kotak untuk memperkirakan Gaussian dengan n kali box blur. */
function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

/** Gaussian blur satu kanal (Float32Array) di tempat, mendekati cv2.GaussianBlur. */
function gaussPlane(plane, w, h, sigma) {
  if (sigma < 0.3) return plane;
  const tmp = new Float32Array(plane.length);
  for (const size of boxesForGauss(sigma)) {
    const r = Math.max(1, (size - 1) >> 1);
    blurH(plane, tmp, w, h, r);
    blurV(tmp, plane, w, h, r);
  }
  return plane;
}

/** Box blur satu kanal (Float32Array) di tempat. */
function boxPlane(plane, w, h, r) {
  const tmp = new Float32Array(plane.length);
  blurH(plane, tmp, w, h, r);
  blurV(tmp, plane, w, h, r);
  return plane;
}

function splitPlanes(data, n) {
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    r[i] = data[j];
    g[i] = data[j + 1];
    b[i] = data[j + 2];
  }
  return [r, g, b];
}

function mergePlanes(data, [r, g, b]) {
  for (let i = 0, j = 0; i < r.length; i++, j += 4) {
    data[j] = r[i];
    data[j + 1] = g[i];
    data[j + 2] = b[i];
    data[j + 3] = 255;
  }
}

/* ------------------------------------------------------------ lookup LUT */

/** Padanan cv2.COLORMAP_JET. */
const JET = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    lut[i * 3] = clamp8(Math.round((1.5 - Math.abs(4 * v - 3)) * 255));
    lut[i * 3 + 1] = clamp8(Math.round((1.5 - Math.abs(4 * v - 2)) * 255));
    lut[i * 3 + 2] = clamp8(Math.round((1.5 - Math.abs(4 * v - 1)) * 255));
  }
  return lut;
})();

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Padanan cv2.COLORMAP_HSV (hue penuh 0..360 sepanjang indeks 0..255). */
const HSV_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = hsvToRgb((i / 256) * 360, 1, 1);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
})();

/** Warna cv2.COLORMAP_SUMMER pada nilai 255 (dipakai filter edge): RGB. */
const SUMMER_MAX = [255, 255, 102];

/* ------------------------------------------------------------ Canny edge */

/** Detektor tepi Canny (Sobel 3x3, norma L1, histeresis) seperti cv2.Canny. */
export function cannyEdges(gray, w, h, low, high) {
  const n = w * h;
  const gx = new Int16Array(n);
  const gy = new Int16Array(n);
  const mag = new Int32Array(n);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1];
      const t = gray[i - w];
      const tr = gray[i - w + 1];
      const l = gray[i - 1];
      const r = gray[i + 1];
      const bl = gray[i + w - 1];
      const b = gray[i + w];
      const br = gray[i + w + 1];
      const sx = tr + 2 * r + br - (tl + 2 * l + bl);
      const sy = bl + 2 * b + br - (tl + 2 * t + tr);
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.abs(sx) + Math.abs(sy);
    }
  }

  const TG22 = 0.4142135623730950488;
  const TG67 = 2.4142135623730950488;
  // 0 = bukan tepi, 1 = tepi lemah, 2 = tepi kuat
  const cls = new Uint8Array(n);
  const stack = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m <= low) continue;
      const ax = Math.abs(gx[i]);
      const ay = Math.abs(gy[i]);
      let keep;
      if (ay < ax * TG22) {
        keep = m > mag[i - 1] && m >= mag[i + 1];
      } else if (ay > ax * TG67) {
        keep = m > mag[i - w] && m >= mag[i + w];
      } else {
        const s = (gx[i] ^ gy[i]) < 0 ? -1 : 1;
        keep = m > mag[i - w - s] && m > mag[i + w + s];
      }
      if (!keep) continue;
      if (m > high) {
        cls[i] = 2;
        stack.push(i);
      } else {
        cls[i] = 1;
      }
    }
  }

  // Histeresis: tepi lemah yang bersambung dengan tepi kuat ikut dipertahankan.
  const out = new Uint8Array(n);
  while (stack.length) {
    const i = stack.pop();
    if (out[i]) continue;
    out[i] = 255;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const ni = ny * w + nx;
        if (cls[ni] === 1 && !out[ni]) stack.push(ni);
      }
    }
  }
  return out;
}

/** Median 5x5 pada citra abu-abu (cv2.medianBlur(gray, 5)). */
function median5(gray, w, h) {
  const out = new Uint8ClampedArray(gray.length);
  const win = new Uint8Array(25);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let k = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy)) * w;
        for (let dx = -2; dx <= 2; dx++) {
          const v = gray[yy + Math.min(w - 1, Math.max(0, x + dx))];
          // sisip terurut
          let j = k++;
          while (j > 0 && win[j - 1] > v) {
            win[j] = win[j - 1];
            j--;
          }
          win[j] = v;
        }
      }
      out[y * w + x] = win[12];
    }
  }
  return out;
}

/* ---------------------------------------------------------------- filter */

function dualTone(img) {
  const { data } = img;
  const n = img.width * img.height;
  const gray = toGray(data, n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (gray[i] > 110) {
      data[j] = 255;
      data[j + 1] = 140;
      data[j + 2] = 10;
    } else {
      data[j] = 220;
      data[j + 1] = 30;
      data[j + 2] = 180;
    }
    data[j + 3] = 255;
  }
}

function thermal(img) {
  const { data } = img;
  const n = img.width * img.height;
  const gray = toGray(data, n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const g = gray[i] * 3;
    data[j] = JET[g];
    data[j + 1] = JET[g + 1];
    data[j + 2] = JET[g + 2];
    data[j + 3] = 255;
  }
}

function sketch(img, { scale }) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const gray = toGray(data, n);
  const inv = new Float32Array(n);
  for (let i = 0; i < n; i++) inv[i] = 255 - gray[i];
  // cv2.GaussianBlur(inv, (21, 21), 0) → sigma otomatis = 3.5
  gaussPlane(inv, w, h, 3.5 * scale);
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const denom = 255 - Math.round(inv[i]);
    out[i] = denom <= 0 ? 0 : (gray[i] * 256) / denom;
  }
  putGray(data, out);
}

function pixelate(img, { scale }) {
  const { data, width: w, height: h } = img;
  if (h < 2 || w < 2) return;
  const block = 14 * scale;
  const sw = Math.max(1, Math.floor(w / block));
  const sh = Math.max(1, Math.floor(h / block));
  // Turun skala bilinear seperti cv2.resize(INTER_LINEAR): sampel di tengah tiap blok
  const small = new Float32Array(sw * sh * 3);
  const fx = w / sw;
  const fy = h / sh;
  for (let sy = 0; sy < sh; sy++) {
    const srcY = Math.min(h - 1, Math.max(0, (sy + 0.5) * fy - 0.5));
    const y0 = Math.floor(srcY);
    const y1 = Math.min(h - 1, y0 + 1);
    const wy = srcY - y0;
    for (let sx = 0; sx < sw; sx++) {
      const srcX = Math.min(w - 1, Math.max(0, (sx + 0.5) * fx - 0.5));
      const x0 = Math.floor(srcX);
      const x1 = Math.min(w - 1, x0 + 1);
      const wx = srcX - x0;
      const o = (sy * sw + sx) * 3;
      for (let c = 0; c < 3; c++) {
        const top = data[(y0 * w + x0) * 4 + c] * (1 - wx) + data[(y0 * w + x1) * 4 + c] * wx;
        const bot = data[(y1 * w + x0) * 4 + c] * (1 - wx) + data[(y1 * w + x1) * 4 + c] * wx;
        small[o + c] = top * (1 - wy) + bot * wy;
      }
    }
  }
  // Perbesar dengan nearest-neighbour (blok piksel tegas)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / w));
      const o = (sy * sw + sx) * 3;
      const j = (y * w + x) * 4;
      data[j] = small[o];
      data[j + 1] = small[o + 1];
      data[j + 2] = small[o + 2];
    }
  }
}

function glitch(img, { scale }) {
  const { data, width: w, height: h } = img;
  if (h < 2 || w < 2) return;
  const shift = Math.max(1, Math.round((4 + Math.floor(Math.random() * 9)) * scale));
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const j = (o + x) * 4;
      // R digeser ke kanan (np.roll +shift), B ke kiri (np.roll -shift)
      data[j] = src[(o + ((x - shift) % w + w) % w) * 4];
      data[j + 2] = src[(o + ((x + shift) % w)) * 4 + 2];
    }
  }
  const rows = Math.max(2, Math.round(2 / scale));
  for (let k = 0; k < rows; k++) {
    const y = Math.floor(Math.random() * h);
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      data[j] = Math.random() * 255;
      data[j + 1] = Math.random() * 255;
      data[j + 2] = Math.random() * 255;
    }
  }
}

function invert(img) {
  const { data } = img;
  for (let j = 0; j < data.length; j += 4) {
    data[j] = 255 - data[j];
    data[j + 1] = 255 - data[j + 1];
    data[j + 2] = 255 - data[j + 2];
  }
}

function redChannel(img) {
  const { data } = img;
  for (let j = 0; j < data.length; j += 4) {
    data[j + 1] = 0;
    data[j + 2] = 0;
  }
}

function edge(img) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const edges = cannyEdges(toGray(data, n), w, h, 60, 150);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (edges[i]) {
      data[j] = SUMMER_MAX[0];
      data[j + 1] = SUMMER_MAX[1];
      data[j + 2] = SUMMER_MAX[2];
    } else {
      data[j] = data[j + 1] = data[j + 2] = 0;
    }
    data[j + 3] = 255;
  }
}

function blur(img, { scale }) {
  const { data, width: w, height: h } = img;
  const planes = splitPlanes(data, w * h);
  // cv2.GaussianBlur(roi, (25, 25), 0) → sigma otomatis = 4.1
  for (const p of planes) gaussPlane(p, w, h, 4.1 * scale);
  mergePlanes(data, planes);
}

function cartoon(img, { scale }) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const gray = toGray(data, n);
  const med = median5(gray, w, h);

  // adaptiveThreshold(MEAN_C, THRESH_BINARY, blok 9, C 9)
  const mean = new Float32Array(n);
  for (let i = 0; i < n; i++) mean[i] = med[i];
  boxPlane(mean, w, h, Math.max(1, Math.round(4 * scale)));

  // bilateralFilter(9, 250, 250) ≈ blur halus karena sigmaColor sangat besar
  const planes = splitPlanes(data, n);
  const r = Math.max(1, Math.round(4 * scale));
  for (const p of planes) boxPlane(p, w, h, r);

  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const keep = med[i] > mean[i] - 9;
    data[j] = keep ? planes[0][i] : 0;
    data[j + 1] = keep ? planes[1][i] : 0;
    data[j + 2] = keep ? planes[2][i] : 0;
    data[j + 3] = 255;
  }
}

function rainbowWave(img, { scale, time }) {
  const { data, width: w, height: h } = img;
  const t = time * 5.0;
  const k = 0.05 / scale; // jarak dihitung dalam piksel ukuran asli
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = ((Math.sin((x + y) * k + t) * 127 + 128) | 0) * 3;
      const j = (y * w + x) * 4;
      data[j] = data[j] * 0.3 + HSV_LUT[idx] * 0.7;
      data[j + 1] = data[j + 1] * 0.3 + HSV_LUT[idx + 1] * 0.7;
      data[j + 2] = data[j + 2] * 0.3 + HSV_LUT[idx + 2] * 0.7;
    }
  }
}

/**
 * Registri filter. Urutan dan kunci SAMA dengan `PortalProcessor.filters`
 * di Retrolens.py, karena urutan menentukan hasil gestur pinch.
 * `maxPixels` membatasi biaya filter yang berat.
 */
export const FILTERS = Object.freeze([
  { key: 'dual-tone', fn: dualTone, maxPixels: 250_000 },
  { key: 'thermal', fn: thermal, maxPixels: 250_000 },
  { key: 'sketch', fn: sketch, maxPixels: 200_000 },
  { key: 'pixelate', fn: pixelate, maxPixels: 250_000 },
  { key: 'glitch', fn: glitch, maxPixels: 250_000 },
  { key: 'invert', fn: invert, maxPixels: 250_000 },
  { key: 'red-channel', fn: redChannel, maxPixels: 250_000 },
  { key: 'edge', fn: edge, maxPixels: 200_000 },
  { key: 'blur', fn: blur, maxPixels: 200_000 },
  { key: 'cartoon', fn: cartoon, maxPixels: 90_000 },
  { key: 'rainbow-wave', fn: rainbowWave, maxPixels: 250_000 },
]);

export const FILTER_KEYS = Object.freeze(FILTERS.map((f) => f.key));

export function getFilter(key) {
  const f = FILTERS.find((item) => item.key === key);
  if (!f) throw new Error(`Filter tidak dikenal: ${key}`);
  return f;
}
