/**
 * Titik masuk situs: sprite, dekorasi, navigasi, animasi scroll, dan playground.
 */
import { installClickBursts } from './fx.js';
import { Playground } from './playground.js';
import { buildSprite, cursorGrids, mountSprites, spriteToDataUri } from './sprites.js';

const root = document.documentElement;
root.classList.add('js');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------ kursor pixel */

function installCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  try {
    const { arrow, pointer } = cursorGrids();
    root.style.setProperty('--cursor-default', `url("${spriteToDataUri(arrow, 2)}") 0 0, auto`);
    root.style.setProperty('--cursor-pointer', `url("${spriteToDataUri(pointer, 2)}") 10 0, pointer`);
  } catch (err) {
    console.warn('[ui] Kursor kustom dilewati:', err);
  }
}

/* ------------------------------------------------------ dekorasi latar langit */

/** Generator acak deterministik supaya tata letak dekorasi stabil. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildSky() {
  const sky = document.getElementById('sky');
  if (!sky) return;
  const small = window.innerWidth < 640;
  const rand = rng(2026);

  const make = (name, scale, color) => {
    const c = document.createElement('canvas');
    buildSprite(name, color).toCanvas(c);
    const g = { w: c.width, h: c.height };
    c.style.width = `${g.w * scale}px`;
    c.style.height = `${g.h * scale}px`;
    c.style.imageRendering = 'pixelated';
    c.setAttribute('aria-hidden', 'true');
    return c;
  };

  // awan melintas pelan
  const clouds = small ? 3 : 5;
  for (let i = 0; i < clouds; i++) {
    const c = make('cloud', 4 + Math.floor(rand() * 3));
    c.style.top = `${6 + rand() * 70}%`;
    c.style.left = '0';
    c.style.opacity = '0.9';
    if (!reduced.matches) {
      c.classList.add('drift');
      c.style.animationDuration = `${90 + Math.floor(rand() * 90)}s`;
      c.style.animationDelay = `-${Math.floor(rand() * 150)}s`;
    } else {
      c.style.left = `${rand() * 80}%`;
    }
    sky.appendChild(c);
  }

  // bintang berkedip, hati dan kilau melayang
  const count = small ? 8 : 16;
  const kinds = [
    ['star', 3, null],
    ['sparkle', 3, 'white'],
    ['heart', 3, null],
    ['sparkle', 2, 'bubble'],
    ['star', 2, null],
  ];
  for (let i = 0; i < count; i++) {
    const [name, scale, color] = kinds[i % kinds.length];
    const c = make(name, scale + (rand() < 0.3 ? 1 : 0), color ?? 'dark');
    c.style.left = `${3 + rand() * 92}%`;
    c.style.top = `${4 + rand() * 90}%`;
    c.style.animationDelay = `-${(rand() * 3).toFixed(2)}s`;
    c.classList.add(name === 'heart' ? 'float' : 'twinkle');
    if (name === 'heart') c.style.animationDuration = `${(3 + rand() * 3).toFixed(1)}s`;
    sky.appendChild(c);
  }
}

/* ------------------------------------------------- navigasi aktif + reveal */

function setupNavigation() {
  const links = [...document.querySelectorAll('.nav__link')];
  const sections = links.map((a) => document.getElementById(a.dataset.section)).filter(Boolean);
  if (!('IntersectionObserver' in window)) return;

  const setActive = (id) => links.forEach((a) => a.classList.toggle('is-active', a.dataset.section === id));
  setActive('home');

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.1, 0.5, 1] },
  );
  sections.forEach((s) => io.observe(s));
}

function setupReveal() {
  const targets = document.querySelectorAll('.section__head, .card, .cabinet, .privacy, .hero__text, .hero__art');
  targets.forEach((el) => el.classList.add('reveal'));
  if (reduced.matches || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.08 },
  );
  targets.forEach((el) => io.observe(el));
  // jaring pengaman: jangan pernah biarkan konten tersembunyi
  setTimeout(() => targets.forEach((el) => el.classList.add('is-in')), 2500);
}

/* ------------------------------------------------------------------ mulai */

function init() {
  mountSprites();
  installCursor();
  buildSky();
  setupNavigation();
  setupReveal();
  installClickBursts();

  try {
    const pg = new Playground();
    if (new URLSearchParams(location.search).has('debug')) window.__playground = pg;
  } catch (err) {
    console.error('[playground] Gagal menginisialisasi:', err);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
