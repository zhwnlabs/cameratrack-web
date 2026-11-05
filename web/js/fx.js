/**
 * Efek ringan: partikel piksel saat klik dan popup bergaya pixel.
 * Semua efek dimatikan otomatis bila pengguna memilih reduced motion.
 */
import { PALETTE, buildSprite } from './sprites.js';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = [PALETTE.pink, PALETTE.bubble, PALETTE.blue, PALETTE.sky, PALETTE.lav, PALETTE.cream];

/** Semburan partikel persegi di titik (x, y) layar. */
export function burst(x, y, count = 10) {
  if (reducedMotion()) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'pxp';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = 28 + Math.random() * 44;
    const size = Math.random() < 0.4 ? 12 : 8;
    p.style.cssText =
      `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;` +
      `background:${COLORS[i % COLORS.length]};` +
      `box-shadow:0 0 0 2px ${PALETTE.dark};` +
      `--dx:${Math.round(Math.cos(angle) * dist)}px;--dy:${Math.round(Math.sin(angle) * dist)}px`;
    p.addEventListener('animationend', () => p.remove(), { once: true });
    frag.appendChild(p);
  }
  document.body.appendChild(frag);
}

/** Pasang efek partikel pada klik semua tombol dan tautan bergaya pixel. */
export function installClickBursts() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest('.px-btn, .chip, .nav__link, .brand') : null;
      if (!target || target.matches(':disabled')) return;
      burst(e.clientX, e.clientY);
    },
    { passive: true },
  );
}

const ICON_BY_KIND = { ok: 'heart', info: 'star', err: 'icon-warn' };

/**
 * Popup pixel di bawah layar.
 * @param {{title: string, text?: string, kind?: 'ok'|'info'|'err', ms?: number}} opts
 */
export function popup({ title, text = '', kind = 'info', ms = 2800 }) {
  const root = document.getElementById('popup-root');
  if (!root) return;
  while (root.children.length >= 2) root.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `popup popup--${kind}`;
  const icon = document.createElement('canvas');
  const grid = buildSprite(ICON_BY_KIND[kind] ?? 'star', 'dark');
  grid.toCanvas(icon);
  icon.style.cssText = `width:${grid.w * 4}px;height:${grid.h * 4}px;image-rendering:pixelated;flex:none`;
  icon.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  const t = document.createElement('span');
  t.className = 'popup__title';
  t.textContent = title;
  body.appendChild(t);
  if (text) body.appendChild(document.createTextNode(text));

  el.append(icon, body);
  root.appendChild(el);

  const remove = () => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), reducedMotion() ? 0 : 320);
  };
  setTimeout(remove, ms);
}
