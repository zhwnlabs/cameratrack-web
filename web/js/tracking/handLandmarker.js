/**
 * Pemuat MediaPipe Hand Landmarker (tasks-vision) untuk browser.
 *
 * - Runtime (bundle + WASM) dicari dulu di `vendor/mediapipe/` (disalin saat build),
 *   lalu jatuh ke CDN jsDelivr bila tidak ada.
 * - Model `hand_landmarker.task` SAMA dengan yang dipakai versi Python.
 * - Seluruh inferensi berjalan lokal di browser; tidak ada gambar yang dikirim.
 */
import { DETECTOR } from './config.js';

const LOCAL_BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/';
const MODEL_URL = new URL('../../models/hand_landmarker.task', import.meta.url).href;

async function importVision() {
  const attempts = [LOCAL_BASE, CDN_BASE];
  let lastError;
  for (const base of attempts) {
    try {
      const mod = await import(/* @vite-ignore */ `${base}vision_bundle.mjs`);
      const wasmBase = base === LOCAL_BASE ? `${LOCAL_BASE}wasm` : `${CDN_BASE}wasm`;
      return { mod, wasmBase, source: base === LOCAL_BASE ? 'lokal' : 'cdn' };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Mesin tracking (MediaPipe) gagal dimuat: ${lastError?.message ?? lastError}`);
}

/** Unduh model dengan progres (0..1). Progres -1 bila ukuran tidak diketahui. */
async function fetchModel(onProgress) {
  const res = await fetch(MODEL_URL, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Model tracking gagal diunduh (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    onProgress?.(-1);
    return new Uint8Array(await res.arrayBuffer());
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  onProgress?.(1);
  return out;
}

/**
 * @param onProgress ({ stage: 'engine'|'model'|'init', ratio }) => void
 * @returns {Promise<{ landmarker, delegate: 'GPU'|'CPU' }>}
 */
export async function createHandLandmarker(onProgress = () => {}) {
  onProgress({ stage: 'engine', ratio: 0 });
  const [{ mod, wasmBase }, modelBuffer] = await Promise.all([
    importVision(),
    fetchModel((ratio) => onProgress({ stage: 'model', ratio })),
  ]);
  onProgress({ stage: 'init', ratio: 0 });

  const { FilesetResolver, HandLandmarker } = mod;
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);

  const build = (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modelBuffer, delegate },
      runningMode: 'VIDEO',
      numHands: DETECTOR.numHands,
      minHandDetectionConfidence: DETECTOR.minHandDetectionConfidence,
      minHandPresenceConfidence: DETECTOR.minHandPresenceConfidence,
      minTrackingConfidence: DETECTOR.minTrackingConfidence,
    });

  try {
    const landmarker = await build('GPU');
    onProgress({ stage: 'init', ratio: 1 });
    return { landmarker, delegate: 'GPU' };
  } catch (gpuError) {
    console.warn('[tracking] Delegate GPU tidak tersedia, memakai CPU.', gpuError);
    const landmarker = await build('CPU');
    onProgress({ stage: 'init', ratio: 1 });
    return { landmarker, delegate: 'CPU' };
  }
}
