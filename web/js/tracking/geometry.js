/**
 * Utilitas geometri. Port langsung dari `GeometryUtils` di Retrolens.py.
 * Titik direpresentasikan sebagai array [x, y] dalam piksel frame 960x540.
 */
import { FIST_TIP_IDS, WRIST_ID } from './config.js';

export function euclideanDist(p1, p2) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

/**
 * Tangan dianggap mengepal bila rata-rata jarak ujung jari (telunjuk, tengah,
 * manis, kelingking) ke pergelangan lebih kecil dari ambang.
 * @param landmarks array landmark ternormalisasi [{x, y}, ...] (21 titik)
 */
export function isFistClosed(landmarks, w, h, threshold) {
  const wx = landmarks[WRIST_ID].x * w;
  const wy = landmarks[WRIST_ID].y * h;
  let sum = 0;
  for (const id of FIST_TIP_IDS) {
    sum += Math.hypot(landmarks[id].x * w - wx, landmarks[id].y * h - wy);
  }
  return sum / FIST_TIP_IDS.length < threshold;
}

/** Tangan dianggap diputar/miring bila vektor jempol→telunjuk tidak lagi tegak. */
export function isHandRotated(thumb, index) {
  const dx = index[0] - thumb[0];
  const dy = index[1] - thumb[1];
  return dy > 25 || Math.abs(dx) > Math.abs(dy) * 1.1;
}

function splitByX(pts) {
  // sort stabil berdasarkan x, lalu pisahkan dua titik kiri dan dua titik kanan
  const xs = [...pts].sort((a, b) => a[0] - b[0]);
  const left = xs.slice(0, 2).sort((a, b) => a[1] - b[1]);
  const right = xs.slice(2, 4).sort((a, b) => a[1] - b[1]);
  return { left, right };
}

/** Urutan sudut normal: kiri-atas, kanan-atas, kanan-bawah, kiri-bawah. */
export function sortQuadClean(pts) {
  const { left, right } = splitByX(pts);
  return [left[0], right[0], right[1], left[1]];
}

/** Urutan sudut menyilang (bowtie) saat tangan diputar. */
export function sortQuadBowtie(pts) {
  const { left, right } = splitByX(pts);
  return [left[0], right[1], right[0], left[1]];
}
