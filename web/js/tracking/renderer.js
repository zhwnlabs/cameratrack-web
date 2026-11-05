/**
 * Renderer kanvas: menggambar frame kamera (mirror), titik landmark,
 * portal berfilter, dan HUD. Padanan `render_portal` + `_draw_hud` di Retrolens.py.
 */
import { DEFAULT_MAX_PROCESS_PIXELS, PIPELINE } from './config.js';
import { getFilter } from './filters.js';

const FONT_HUD = "'VT323', 'Courier New', monospace";

export class FrameRenderer {
  /** @param canvas kanvas tampilan berukuran frameWidth x frameHeight */
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = PIPELINE.frameWidth;
    this.canvas.height = PIPELINE.frameHeight;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    // kanvas kerja untuk memproses ROI portal
    this.work = document.createElement('canvas');
    this.workCtx = this.work.getContext('2d', { willReadFrequently: true });
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  clear(color = '#4D4985') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Gambar frame video: cermin horizontal (cv2.flip) dan potong tengah (cover)
   * supaya rasio kamera apa pun tidak terdistorsi.
   */
  drawVideo(video) {
    const { ctx } = this;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    const targetRatio = this.width / this.height;
    let sw = vw;
    let sh = vh;
    if (vw / vh > targetRatio) sw = vh * targetRatio;
    else sh = vw / targetRatio;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    ctx.save();
    ctx.translate(this.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, this.width, this.height);
    ctx.restore();
    return true;
  }

  /** Titik landmark gaya pixel (kotak), ujung jari ditonjolkan. */
  drawLandmarks(hands) {
    const { ctx } = this;
    for (const lm of hands) {
      ctx.fillStyle = '#B6EEEB';
      for (let i = 0; i < lm.length; i++) {
        const px = Math.round(lm[i].x * this.width);
        const py = Math.round(lm[i].y * this.height);
        ctx.fillRect(px - 2, py - 2, 4, 4);
      }
      ctx.fillStyle = '#82BDD9';
      for (const id of [4, 8, 12, 16, 20]) {
        const px = Math.round(lm[id].x * this.width);
        const py = Math.round(lm[id].y * this.height);
        ctx.fillRect(px - 4, py - 4, 8, 8);
      }
    }
  }

  /** Pasang filter di dalam poligon (even-odd, sama dengan cv2.fillPoly). */
  renderPortal(poly, filterKey, timeSec) {
    const { ctx, work, workCtx } = this;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of poly) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    // cv2.boundingRect inklusif → +1
    const x = Math.max(0, Math.floor(minX));
    const y = Math.max(0, Math.floor(minY));
    const w = Math.min(Math.floor(maxX) + 1 - x, this.width - x);
    const h = Math.min(Math.floor(maxY) + 1 - y, this.height - y);
    if (w <= 10 || h <= 10) return false;

    const filter = getFilter(filterKey);
    const maxPixels = filter.maxPixels ?? DEFAULT_MAX_PROCESS_PIXELS;
    const scale = Math.min(1, Math.sqrt(maxPixels / (w * h)));
    const sw = Math.max(2, Math.round(w * scale));
    const sh = Math.max(2, Math.round(h * scale));
    const eff = sw / w;

    work.width = sw;
    work.height = sh;
    workCtx.imageSmoothingEnabled = true;
    workCtx.drawImage(this.canvas, x, y, w, h, 0, 0, sw, sh);
    const img = workCtx.getImageData(0, 0, sw, sh);
    filter.fn(img, { scale: eff, time: timeSec });
    workCtx.putImageData(img, 0, 0);

    ctx.save();
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.clip('evenodd');
    ctx.imageSmoothingEnabled = eff >= 0.999;
    ctx.drawImage(work, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();

    // garis tepi portal (putih seperti aslinya, dengan inti pink agar kontras)
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#4D4985';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    return true;
  }

  /** HUD dua baris di kiri atas, sama dengan versi desktop. */
  drawHud(modeLabel, filterName) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `22px ${FONT_HUD}`;
    ctx.textBaseline = 'top';
    const lines = [
      [`MODE: ${modeLabel} [C / 2 KEPALAN]`, '#B6EEEB'],
      [`FILTER: ${filterName.toUpperCase()} [PINCH / N / P]`, '#B6EEEB'],
    ];
    lines.forEach(([text, color], i) => {
      const y = 10 + i * 26;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(77, 73, 133, 0.85)';
      ctx.fillRect(10, y - 2, tw + 12, 24);
      ctx.fillStyle = color;
      ctx.fillText(text, 16, y);
    });
    ctx.restore();
  }
}
