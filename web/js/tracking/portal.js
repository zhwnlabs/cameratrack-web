/**
 * Logika portal tanpa DOM. Port dari `PortalProcessor.process_frame`
 * di Retrolens.py: pinch → ganti filter, dua kepalan → toggle 2D/3D,
 * ujung jari → sudut portal.
 */
import { PIPELINE, TIP_IDS } from './config.js';
import { FILTER_KEYS } from './filters.js';
import {
  euclideanDist,
  isFistClosed,
  isHandRotated,
  sortQuadBowtie,
  sortQuadClean,
} from './geometry.js';

export class PortalProcessor {
  constructor(cfg = PIPELINE) {
    this.cfg = cfg;
    this.filterKeys = FILTER_KEYS;
    this.reset();
  }

  /** Kembalikan ke kondisi awal (filter pertama, mode 2D). */
  reset() {
    this.activeFilterIdx = 0;
    this.is3dMode = false;
    this.lastSwitchTime = -Infinity;
    this.lastModeToggle = -Infinity;
  }

  get currentFilterName() {
    return this.filterKeys[this.activeFilterIdx];
  }

  get secondaryFilterName() {
    return this.filterKeys[(this.activeFilterIdx + 1) % this.filterKeys.length];
  }

  cycleFilter(step = 1) {
    const n = this.filterKeys.length;
    this.activeFilterIdx = (((this.activeFilterIdx + step) % n) + n) % n;
  }

  setFilter(idx) {
    if (idx >= 0 && idx < this.filterKeys.length) this.activeFilterIdx = idx;
  }

  toggleMode() {
    this.is3dMode = !this.is3dMode;
  }

  /**
   * @param hands  daftar tangan; tiap tangan = 21 landmark ternormalisasi [{x, y}]
   * @param nowSec waktu saat ini dalam detik (monoton)
   * @returns {{portals, isBowtie, handCount, filterChanged, modeChanged, tips}}
   *   portals: [{ poly: [[x, y], ...], filterKey }]
   */
  update(hands, nowSec) {
    const { frameWidth: W, frameHeight: H } = this.cfg;
    const result = {
      portals: [],
      isBowtie: false,
      handCount: hands.length,
      filterChanged: false,
      modeChanged: false,
      tips: [],
    };
    if (!hands.length) return result;

    const allTips = [];
    let fistCount = 0;

    for (const lm of hands) {
      const tips = TIP_IDS.map((id) => [Math.trunc(lm[id].x * W), Math.trunc(lm[id].y * H)]);
      allTips.push(tips);

      // Pinch cepat: jempol + kelingking
      if (
        euclideanDist(tips[0], tips[4]) < this.cfg.pinchThresholdPx &&
        nowSec - this.lastSwitchTime > this.cfg.filterCooldownSec
      ) {
        this.cycleFilter(1);
        this.lastSwitchTime = nowSec;
        result.filterChanged = true;
      }

      if (isFistClosed(lm, W, H, this.cfg.fistDistThresholdPx)) fistCount++;
    }

    // Dua kepalan = ganti mode 2D/3D
    if (fistCount === 2 && nowSec - this.lastModeToggle > this.cfg.modeCooldownSec) {
      this.is3dMode = !this.is3dMode;
      this.lastModeToggle = nowSec;
      result.modeChanged = true;
    }

    result.tips = allTips;

    if (this.is3dMode) {
      if (allTips.length === 2) {
        const [t1, t2] = allTips;
        result.portals.push({
          poly: [t1[0], t1[1], t1[2], t2[2], t2[1], t2[0]],
          filterKey: this.currentFilterName,
        });
        result.portals.push({
          poly: [t1[2], t1[3], t1[4], t2[4], t2[3], t2[2]],
          filterKey: this.secondaryFilterName,
        });
      } else if (allTips.length === 1) {
        result.portals.push({ poly: allTips[0], filterKey: this.currentFilterName });
      }
    } else if (allTips.length === 2) {
      const corners = [allTips[0][0], allTips[0][1], allTips[1][0], allTips[1][1]];
      let quad;
      if (isHandRotated(corners[0], corners[1]) || isHandRotated(corners[2], corners[3])) {
        quad = sortQuadBowtie(corners);
        result.isBowtie = true;
      } else {
        quad = sortQuadClean(corners);
      }
      result.portals.push({ poly: quad, filterKey: this.currentFilterName });
    } else if (allTips.length === 1) {
      const t = allTips[0];
      result.portals.push({ poly: [t[0], t[1], t[2], t[4]], filterKey: this.currentFilterName });
    }

    return result;
  }

  /** Teks mode untuk HUD, sama dengan `_draw_hud` pada versi Python. */
  modeLabel(isBowtie) {
    return this.is3dMode ? '3D Mesh' : isBowtie ? '2D Bowtie' : '2D Quad';
  }
}
