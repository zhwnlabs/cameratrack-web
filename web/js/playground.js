/**
 * Pengendali Camera Playground: siklus kamera (mulai/berhenti/reset),
 * loop tracking, dan sinkronisasi UI. Logika tracking ada di js/tracking/.
 */
import { burst, popup } from './fx.js';
import { buildSprite } from './sprites.js';
import { CameraError, describeCameraError, openCamera, stopStream, assertCameraSupported } from './tracking/camera.js';
import { FILTER_KEYS } from './tracking/filters.js';
import { createHandLandmarker } from './tracking/handLandmarker.js';
import { PortalProcessor } from './tracking/portal.js';
import { FrameRenderer } from './tracking/renderer.js';

const $ = (id) => document.getElementById(id);

const CAMERA_LABEL = { idle: 'MATI', loading: 'MEMUAT', running: 'AKTIF', error: 'ERROR' };
const CAMERA_LED = { idle: 'off', loading: 'load', running: 'live', error: 'err' };
const LEAVE_DELAY_MS = 900;
const MAX_CONSECUTIVE_ERRORS = 12;

export class Playground {
  constructor() {
    this.el = {
      section: $('playground'),
      screen: $('screen'),
      wrap: $('screen-wrap'),
      video: $('cam'),
      overlay: $('overlay'),
      loadbar: $('loadbar'),
      loadText: $('load-text'),
      errTitle: $('err-title'),
      errText: $('err-text'),
      detectPop: $('detect-pop'),
      start: $('btn-start'),
      stop: $('btn-stop'),
      reset: $('btn-reset'),
      shot: $('btn-shot'),
      retry: $('btn-retry'),
      prev: $('btn-prev'),
      next: $('btn-next'),
      mode: $('btn-mode'),
      modeIcon: $('mode-icon'),
      modeLabel: $('mode-label'),
      chips: $('chips'),
      stCamera: $('st-camera'),
      ledCamera: $('led-camera'),
      stHands: $('st-hands'),
      stMode: $('st-mode'),
      stFilter: $('st-filter'),
      stFps: $('st-fps'),
      slots: [$('slot-1'), $('slot-2')],
    };

    this.renderer = new FrameRenderer(this.el.screen);
    this.processor = new PortalProcessor();

    this.state = 'idle';
    this.token = 0; // dibatalkan bila pengguna menekan berhenti saat memuat
    this.stream = null;
    this.landmarker = null;
    this.landmarkerPromise = null;
    this.delegate = null;
    this.raf = 0;
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.errorStreak = 0;
    this.handCountShown = -1;
    this.lastHandsLostAt = -Infinity;
    this.visible = true;
    this.leaveTimer = 0;
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
    this.lastIsBowtie = false;
    this.cache = {};

    this.tick = this.tick.bind(this);
    this.buildChips();
    this.bind();
    this.renderer.clear();
    this.syncState();
    this.syncProcessorUi();
  }

  /* --------------------------------------------------------------- setup */

  buildChips() {
    const frag = document.createDocumentFragment();
    FILTER_KEYS.forEach((key, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('role', 'radio');
      b.dataset.index = String(i);
      b.textContent = key;
      b.addEventListener('click', () => this.selectFilter(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectFilter((this.processor.activeFilterIdx + 1) % FILTER_KEYS.length, true);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectFilter((this.processor.activeFilterIdx - 1 + FILTER_KEYS.length) % FILTER_KEYS.length, true);
        }
      });
      frag.appendChild(b);
    });
    this.el.chips.appendChild(frag);
    this.chipEls = [...this.el.chips.children];
  }

  bind() {
    const { el } = this;
    el.start.addEventListener('click', () => this.start());
    el.retry.addEventListener('click', () => this.start());
    el.stop.addEventListener('click', () => this.stop({ message: 'Kamera dimatikan.' }));
    el.reset.addEventListener('click', () => this.reset());
    el.shot.addEventListener('click', () => this.screenshot());
    el.prev.addEventListener('click', () => this.cycle(-1));
    el.next.addEventListener('click', () => this.cycle(1));
    el.mode.addEventListener('click', () => this.toggleMode());

    // tombol "Mulai Bermain" di hero hanya menggulir; kamera tetap menunggu izin eksplisit

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const tag = e.target instanceof Element ? e.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!this.visible) return;
      switch (e.key.toLowerCase()) {
        case 'c':
          this.toggleMode();
          break;
        case 'n':
          this.cycle(1);
          break;
        case 'p':
          this.cycle(-1);
          break;
        case 's':
          if (this.state === 'running') this.screenshot();
          break;
        case 'q':
          if (this.state === 'running' || this.state === 'loading') this.stop({ message: 'Kamera dimatikan.' });
          break;
        default:
      }
    });

    // Privasi: matikan kamera ketika pengguna meninggalkan playground atau tab.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        ([entry]) => {
          this.visible = entry.isIntersecting;
          clearTimeout(this.leaveTimer);
          if (!entry.isIntersecting && (this.state === 'running' || this.state === 'loading')) {
            this.leaveTimer = setTimeout(
              () => this.stop({ message: 'Kamera dimatikan karena kamu meninggalkan playground.' }),
              LEAVE_DELAY_MS,
            );
          }
        },
        { threshold: 0 },
      ).observe(this.el.section);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'running' || this.state === 'loading')) {
        this.stop({ message: 'Kamera dimatikan karena tab tidak aktif.' });
      }
    });
    window.addEventListener('pagehide', () => this.stop({ silent: true }));
  }

  /* --------------------------------------------------------------- state */

  setState(next) {
    this.state = next;
    this.syncState();
  }

  syncState() {
    const { el, state } = this;
    el.overlay.dataset.state = state === 'running' ? 'running' : state;
    const busy = state === 'loading' || state === 'running';
    el.start.disabled = busy;
    el.stop.disabled = !busy;
    el.shot.disabled = state !== 'running';
    this.setText('stCamera', CAMERA_LABEL[state]);
    el.ledCamera.dataset.s = CAMERA_LED[state];
    document.body.classList.toggle('is-tracking', state === 'running');
    if (state !== 'running') this.setHands(0, true);
    if (state === 'idle' || state === 'error') this.setText('stFps', '--');
  }

  setText(key, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    this.el[key].textContent = value;
  }

  setLoad(ratio, text) {
    const bars = [...this.el.loadbar.children];
    if (ratio < 0) {
      this.el.loadbar.dataset.indeterminate = '1';
    } else {
      delete this.el.loadbar.dataset.indeterminate;
      const on = Math.round(ratio * bars.length);
      bars.forEach((b, i) => b.classList.toggle('on', i < on));
      this.el.loadbar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    }
    if (text) this.el.loadText.textContent = text;
  }

  showError(err) {
    const e = describeCameraError(err);
    const titles = {
      denied: 'IZIN DITOLAK',
      notfound: 'KAMERA TIDAK ADA',
      busy: 'KAMERA SIBUK',
      insecure: 'HALAMAN TIDAK AMAN',
      unsupported: 'TIDAK DIDUKUNG',
    };
    this.el.errTitle.textContent = titles[e.kind] ?? 'GAME OVER';
    this.el.errText.textContent = e.message;
    this.setState('error');
    this.renderer.clear();
  }

  /* ------------------------------------------------------------ lifecycle */

  ensureLandmarker() {
    if (this.landmarker) return Promise.resolve(this.landmarker);
    if (!this.landmarkerPromise) {
      this.landmarkerPromise = createHandLandmarker(({ stage, ratio }) => {
        if (stage === 'model') {
          if (ratio < 0) this.setLoad(-1, 'Mengunduh model tracking…');
          else this.setLoad(ratio * 0.85, `Mengunduh model tracking… ${Math.round(ratio * 100)}%`);
        } else if (stage === 'init') {
          this.setLoad(ratio >= 1 ? 1 : 0.9, 'Menyalakan mesin tracking…');
        }
      })
        .then(({ landmarker, delegate }) => {
          this.landmarker = landmarker;
          this.delegate = delegate;
          return landmarker;
        })
        .catch((err) => {
          this.landmarkerPromise = null; // izinkan coba lagi
          throw err;
        });
    }
    return this.landmarkerPromise;
  }

  async start() {
    if (this.state === 'loading' || this.state === 'running') return;
    const token = ++this.token;
    this.setLoad(0, 'Meminta izin kamera…');
    this.setState('loading');

    try {
      assertCameraSupported();
      const [camRes, modelRes] = await Promise.allSettled([openCamera(this.el.video), this.ensureLandmarker()]);

      if (token !== this.token) {
        // pengguna menekan berhenti selama memuat
        if (camRes.status === 'fulfilled') stopStream(camRes.value, this.el.video);
        return;
      }
      if (camRes.status === 'rejected') throw camRes.reason;
      if (modelRes.status === 'rejected') {
        stopStream(camRes.value, this.el.video);
        throw modelRes.reason;
      }

      this.stream = camRes.value;
      this.processor.reset();
      this.syncProcessorUi();
      this.lastVideoTime = -1;
      this.lastTs = 0;
      this.errorStreak = 0;
      this.fpsFrames = 0;
      this.fpsStart = performance.now();
      this.lastHandsLostAt = -Infinity;
      this.setState('running');
      this.raf = requestAnimationFrame(this.tick);

      popup({
        title: 'KAMERA AKTIF!',
        text: 'Mundur sedikit, lalu bentangkan kedua tanganmu.',
        kind: 'ok',
        ms: 3400,
      });
      const r = this.el.wrap.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, 14);
    } catch (err) {
      if (token !== this.token) return;
      console.error('[playground] Gagal memulai:', err);
      this.showError(err instanceof CameraError ? err : this.wrapEngineError(err));
    }
  }

  wrapEngineError(err) {
    if (err?.name && /Error$/.test(err.name) && err.name !== 'Error' && err.name !== 'TypeError') {
      return describeCameraError(err);
    }
    return new CameraError(
      'unknown',
      `Mesin tracking gagal dimuat. Periksa koneksi internet lalu coba lagi. (${err?.message ?? err})`,
    );
  }

  /** Hentikan kamera dan kembali ke layar awal. */
  stop({ message = '', silent = false } = {}) {
    this.token++;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.leaveTimer);
    const wasActive = this.state === 'running' || this.state === 'loading';
    stopStream(this.stream, this.el.video);
    this.stream = null;
    if (this.state !== 'error') this.setState('idle');
    this.renderer.clear();
    if (wasActive && !silent && message) popup({ title: 'KAMERA MATI', text: message, kind: 'info' });
  }

  reset() {
    this.processor.reset();
    this.syncProcessorUi();
    this.lastHandsLostAt = -Infinity;
    popup({ title: 'RESET!', text: 'Filter dan mode kembali ke awal.', kind: 'info', ms: 1800 });
  }

  screenshot() {
    if (this.state !== 'running') return;
    this.el.screen.toBlob((blob) => {
      if (!blob) {
        popup({ title: 'GAGAL', text: 'Foto tidak bisa disimpan.', kind: 'err' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `camera-tracking_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      popup({ title: 'FOTO TERSIMPAN', text: 'Tersimpan di perangkatmu, tidak diunggah.', kind: 'ok', ms: 2000 });
    }, 'image/png');
  }

  /* ------------------------------------------------------- filter dan mode */

  selectFilter(i, focus = false) {
    this.processor.setFilter(i);
    this.syncProcessorUi();
    if (focus) this.chipEls[i]?.focus();
  }

  cycle(step) {
    this.processor.cycleFilter(step);
    this.syncProcessorUi();
  }

  toggleMode() {
    this.processor.toggleMode();
    this.syncProcessorUi();
    popup({
      title: this.processor.is3dMode ? 'MODE 3D MESH' : 'MODE 2D QUAD',
      text: this.processor.is3dMode ? 'Dua portal tersusun dari lima ujung jari.' : 'Satu portal dari empat sudut.',
      kind: 'info',
      ms: 1500,
    });
  }

  syncProcessorUi() {
    const p = this.processor;
    this.chipEls.forEach((c, i) => {
      const on = i === p.activeFilterIdx;
      c.setAttribute('aria-checked', String(on));
      c.tabIndex = on ? 0 : -1;
    });
    this.setText('stFilter', p.currentFilterName.toUpperCase());
    this.setText('stMode', p.modeLabel(this.lastIsBowtie).toUpperCase());
    this.el.mode.setAttribute('aria-pressed', String(p.is3dMode));
    this.setText('modeLabel', p.is3dMode ? 'MODE 3D' : 'MODE 2D');
    const key = p.is3dMode ? 'cube' : 'quad';
    if (this.cache.modeIcon !== key) {
      this.cache.modeIcon = key;
      buildSprite(`icon-${key}`, 'dark').toCanvas(this.el.modeIcon);
    }
  }

  /* ----------------------------------------------------------------- loop */

  setHands(count, silent = false) {
    if (this.handCountShown === count) return;
    const prev = this.handCountShown;
    this.handCountShown = count;
    this.setText('stHands', `${count}/2`);
    this.el.slots.forEach((slot, i) => {
      const on = i < count;
      const key = `slot${i}`;
      if (this.cache[key] === on) return;
      this.cache[key] = on;
      buildSprite('icon-hand', on ? 'pink' : 'lav').toCanvas(slot);
      slot.classList.toggle('is-on', on);
    });
    if (silent) return;
    const now = performance.now();
    if (count > 0 && prev <= 0 && now - this.lastHandsLostAt > 600) this.flashDetected();
    if (count === 0) this.lastHandsLostAt = now;
  }

  flashDetected() {
    const { wrap, detectPop } = this.el;
    wrap.classList.remove('is-hit');
    detectPop.classList.remove('is-on');
    void wrap.offsetWidth; // restart animasi
    wrap.classList.add('is-hit');
    detectPop.classList.add('is-on');
    const r = wrap.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + 40, 8);
  }

  tick() {
    if (this.state !== 'running') return;
    this.raf = requestAnimationFrame(this.tick);

    const { video } = this.el;
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;

    try {
      const r = this.renderer;
      if (!r.drawVideo(video)) return;

      let ts = performance.now();
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;

      const result = this.landmarker.detectForVideo(r.canvas, ts);
      const hands = result?.landmarks ?? [];

      r.drawLandmarks(hands);
      const st = this.processor.update(hands, ts / 1000);
      for (const portal of st.portals) r.renderPortal(portal.poly, portal.filterKey, ts / 1000);
      r.drawHud(this.processor.modeLabel(st.isBowtie), this.processor.currentFilterName);

      this.lastIsBowtie = st.isBowtie;
      this.setHands(st.handCount);
      if (st.filterChanged || st.modeChanged || this.cache.stMode !== this.processor.modeLabel(st.isBowtie).toUpperCase()) {
        this.syncProcessorUi();
      }
      if (st.modeChanged) {
        popup({
          title: this.processor.is3dMode ? 'MODE 3D MESH' : 'MODE 2D QUAD',
          text: 'Dua kepalan terdeteksi!',
          kind: 'info',
          ms: 1500,
        });
      }

      this.errorStreak = 0;
      this.fpsFrames++;
      if (ts - this.fpsStart >= 1000) {
        this.setText('stFps', String(Math.round((this.fpsFrames * 1000) / (ts - this.fpsStart))));
        this.fpsFrames = 0;
        this.fpsStart = ts;
      }
    } catch (err) {
      this.errorStreak++;
      if (this.errorStreak === 1) console.error('[playground] Error pada frame:', err);
      if (this.errorStreak >= MAX_CONSECUTIVE_ERRORS) {
        this.stop({ silent: true });
        this.showError(new CameraError('unknown', `Tracking berhenti karena error berulang: ${err?.message ?? err}`));
      }
    }
  }
}
