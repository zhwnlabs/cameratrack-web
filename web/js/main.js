/**
 * Titik masuk situs: sprite, dekorasi, navigasi, animasi scroll, dan playground.
 */
import { installClickBursts } from './fx.js';
import { Playground } from './playground.js';
import { cursorGrids, mountSprites, spriteToDataUri } from './sprites.js';

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

/* ------------------------------------------------------ dekorasi latar */

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
  const NS = 'http://www.w3.org/2000/svg';

  // Bintang empat sudut ala vektor Y2K dan tanda silang kecil sebagai penanda registrasi.
  const colors = ['#1E5BE6', '#7FB4F5', '#1E5BE6', '#E4202A'];
  const count = small ? 7 : 14;
  for (let i = 0; i < count; i++) {
    const size = 10 + Math.floor(rand() * 4) * 5;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = `left:${(3 + rand() * 92).toFixed(1)}%;top:${(4 + rand() * 90).toFixed(1)}%;color:${colors[i % colors.length]}`;
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#star4');
    svg.appendChild(use);
    svg.style.animationDelay = `-${(rand() * 3).toFixed(2)}s`;
    svg.classList.add('twinkle');
    sky.appendChild(svg);
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
