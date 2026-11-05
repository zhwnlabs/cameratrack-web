/**
 * Konfigurasi pipeline tracking.
 * Nilainya disalin apa adanya dari `PipelineConfig` dan `HandLandmarkerOptions`
 * di Retrolens.py supaya perilaku gestur sama dengan versi desktop.
 */
export const PIPELINE = Object.freeze({
  frameWidth: 960,
  frameHeight: 540,
  pinchThresholdPx: 45.0,
  filterCooldownSec: 0.15,
  modeCooldownSec: 1.2,
  fistDistThresholdPx: 80.0,
});

export const DETECTOR = Object.freeze({
  numHands: 2,
  minHandDetectionConfidence: 0.8,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.8,
});

/** Indeks landmark MediaPipe: jempol, telunjuk, tengah, manis, kelingking. */
export const TIP_IDS = Object.freeze([4, 8, 12, 16, 20]);
/** Ujung jari yang dipakai untuk deteksi kepalan (tanpa jempol). */
export const FIST_TIP_IDS = Object.freeze([8, 12, 16, 20]);
export const WRIST_ID = 0;

/** Batas piksel yang diproses filter per frame (menjaga FPS tracking). */
export const DEFAULT_MAX_PROCESS_PIXELS = 250_000;
