/**
 * Aset pixel-art yang digambar lewat kode (tanpa file gambar).
 * Setiap sprite adalah grid piksel; outline gelap ditambahkan otomatis
 * sehingga semua sprite punya gaya yang konsisten.
 */

export const PALETTE = Object.freeze({
  blue: '#82BDD9',
  sky: '#B6EEEB',
  deep: '#5566A1',
  pink: '#6988C0',
  bubble: '#B6EEEB',
  lav: '#96CAD9',
  cream: '#FFFFFF',
  dark: '#4D4985',
  white: '#FFFFFF',
});

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  set(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    return this;
  }

  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c).rect(x, y + h - 1, w, 1, c).rect(x, y, 1, h, c).rect(x + w - 1, y, 1, h, c);
    return this;
  }

  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6) this.set(x, y, c);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, c) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      this.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
    return this;
  }

  /** Beri outline pada tepi luar semua piksel terisi (4-arah). */
  outline(c = PALETTE.dark) {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && src[ny * this.w + nx];
        });
        if (near) this.px[y * this.w + x] = c;
      }
    }
    return this;
  }

  /** Gambar grid ke kanvas 1:1 (skala dilakukan lewat CSS dengan image-rendering: pixelated). */
  toCanvas(canvas) {
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return canvas;
  }
}

/** Buat grid dari peta karakter. `X` = warna utama; huruf lain lewat legenda. */
function fromMap(rows, color, legend = {}) {
  const w = rows[0].length;
  const g = new Grid(w, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Baris sprite tidak sama panjang (baris ${y}: ${row.length} vs ${w})`);
    [...row].forEach((ch, x) => {
      if (ch === 'X') g.set(x, y, color);
      else if (legend[ch]) g.set(x, y, legend[ch]);
    });
  });
  return g;
}

const P = PALETTE;

/* ---------------------------------------------------------------- sprite besar */

function camera() {
  const g = new Grid(36, 28);
  g.rect(3, 9, 30, 16, P.blue);
  g.rect(3, 9, 30, 2, P.sky);
  g.rect(3, 21, 30, 3, P.pink);
  g.rect(8, 6, 8, 3, P.blue).rect(8, 6, 8, 1, P.sky);
  g.rect(23, 5, 6, 4, P.bubble).rect(24, 6, 4, 2, P.cream);
  g.rect(18, 6, 3, 3, P.pink);
  g.rect(5, 12, 3, 2, P.cream);
  g.disc(18, 16, 7, P.dark).disc(18, 16, 6, P.lav).disc(18, 16, 4, P.deep).disc(18, 16, 2, P.blue);
  g.rect(15, 13, 2, 2, P.cream);
  g.set(19, 18, P.cream);
  return g.outline(P.dark);
}

function hand() {
  const g = new Grid(28, 32);
  const skin = P.bubble;
  g.rect(7, 16, 15, 12, skin); // telapak
  g.rect(7, 8, 3, 9, skin); // telunjuk
  g.rect(11, 5, 3, 12, skin); // tengah
  g.rect(15, 7, 3, 10, skin); // manis
  g.rect(19, 10, 3, 7, skin); // kelingking
  g.rect(3, 18, 5, 3, skin); // jempol
  g.rect(3, 15, 3, 4, skin);
  // sorot dan bayangan
  [[7, 8], [11, 5], [15, 7], [19, 10], [3, 15]].forEach(([x, y]) => g.rect(x, y, 3, 1, P.cream));
  g.rect(7, 26, 15, 2, P.pink);
  g.rect(21, 17, 1, 9, P.pink);
  g.set(13, 21, P.pink).set(14, 21, P.pink);
  return g.outline(P.dark);
}

function cloud() {
  const g = new Grid(26, 14);
  g.disc(7, 8, 4, P.white).disc(13, 6, 5, P.white).disc(19, 8, 4, P.white).rect(5, 8, 17, 5, P.white);
  g.rect(5, 11, 17, 2, P.sky);
  return g.outline(P.blue);
}

function heart() {
  return fromMap(
    [
      '.XX.XX.',
      'XppXPPX',
      'XpPPPPX',
      'XPPPPPX',
      '.XPPPX.',
      '..XPX..',
      '...X...',
    ],
    P.dark,
    { p: P.cream, P: P.pink },
  );
}

function star() {
  return fromMap(
    [
      '...X...',
      '..XcX..',
      '..XcX..',
      'XXXcXXX',
      '.XcccX.',
      '..XcX..',
      '.XX.XX.',
    ],
    P.dark,
    { c: P.cream },
  );
}

function sparkle(color = P.white) {
  const g = new Grid(7, 7);
  g.rect(3, 0, 1, 7, color).rect(0, 3, 7, 1, color).rect(2, 2, 3, 3, color);
  return g;
}

function logo() {
  const g = new Grid(20, 16);
  g.rect(2, 5, 16, 9, P.blue).rect(2, 5, 16, 1, P.sky).rect(2, 12, 16, 2, P.pink);
  g.rect(5, 3, 5, 2, P.blue).rect(13, 3, 3, 2, P.bubble);
  g.disc(10, 9, 3, P.dark).disc(10, 9, 2, P.lav).set(10, 9, P.deep);
  g.set(9, 8, P.cream);
  return g.outline(P.dark);
}

/* ------------------------------------------------------------------- ikon */

const ICONS = {
  play: ['X.......', 'XX......', 'XXX.....', 'XXXX....', 'XXXXX...', 'XXXX....', 'XXX.....', 'XX......', 'X.......'],
  stop: ['XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX'],
  reset: [
    '...XXXX....',
    '..XXXXXX.X.',
    '.XX....XXXX',
    'XX......XX.',
    'XX.........',
    'XX.........',
    'XX......XX.',
    '.XX....XX..',
    '..XXXXXX...',
    '...XXXX....',
  ],
  photo: [
    '...XXX.....',
    'XXXXXXXXXXX',
    'X.........X',
    'X...XXX...X',
    'X..X...X..X',
    'X..X...X..X',
    'X...XXX...X',
    'X.........X',
    'XXXXXXXXXXX',
  ],
  left: ['....X', '...XX', '..XXX', '.XXXX', 'XXXXX', '.XXXX', '..XXX', '...XX', '....X'],
  right: ['X....', 'XX...', 'XXX..', 'XXXX.', 'XXXXX', 'XXXX.', 'XXX..', 'XX...', 'X....'],
  warn: [
    '....X....',
    '...XXX...',
    '...X.X...',
    '..XX.XX..',
    '..XX.XX..',
    '.XXXXXXX.',
    '.XXX.XXX.',
    'XXXXXXXXX',
  ],
  check: ['.......X', '......XX', 'X....XX.', 'XX..XX..', '.XXXX...', '..XX....'],
  cube: [
    '..XXXXXXXX.',
    '..X......X.',
    '.XX.....XX.',
    'XXXXXXXXX..',
    'X.......X..',
    'X.......X..',
    'X.......X..',
    'XXXXXXXXX..',
  ],
  quad: [
    'XX.......XX',
    'XX.......XX',
    '..X.....X..',
    '...X...X...',
    '....X.X....',
    '...X...X...',
    '..X.....X..',
    'XX.......XX',
    'XX.......XX',
  ],
  eye: [
    '...XXXXX...',
    '.XXX...XXX.',
    'XX..XXX..XX',
    'XX.XXXXX.XX',
    'XX..XXX..XX',
    '.XXX...XXX.',
    '...XXXXX...',
  ],
  lock: [
    '..XXXXX..',
    '.XX...XX.',
    '.X.....X.',
    'XXXXXXXXX',
    'XXXXXXXXX',
    'XXXX.XXXX',
    'XXXX.XXXX',
    'XXXXXXXXX',
  ],
};

function handMini(color) {
  const g = new Grid(13, 15);
  g.rect(3, 7, 7, 6, color);
  g.rect(3, 2, 2, 6, color).rect(6, 0, 2, 8, color).rect(9, 2, 2, 6, color).rect(1, 6, 2, 3, color);
  return g;
}

function gestureIcon(kind) {
  const g = new Grid(26, 16);
  if (kind === 'portal') {
    [[1, 1], [22, 3], [22, 12], [1, 12]].forEach(([x, y]) => g.rect(x, y, 3, 3, P.pink));
    g.line(3, 2, 22, 4, P.blue).line(23, 5, 23, 12, P.blue).line(4, 13, 22, 13, P.blue).line(2, 4, 2, 12, P.blue);
    g.rect(8, 6, 10, 5, P.lav);
  } else if (kind === 'pinch') {
    g.rect(6, 8, 4, 4, P.pink).rect(16, 8, 4, 4, P.blue);
    g.rect(11, 9, 4, 2, P.lav);
    g.rect(12, 3, 2, 2, P.cream).rect(11, 4, 4, 1, P.cream).rect(12, 5, 2, 2, P.cream);
  } else {
    g.rect(4, 4, 7, 9, P.bubble).rect(15, 4, 7, 9, P.bubble);
    [[4, 7], [15, 7]].forEach(([x, y]) => g.rect(x, y, 7, 1, P.pink));
    g.rect(11, 8, 4, 1, P.lav);
  }
  return g.outline(P.dark);
}

function buildIcon(name, color) {
  if (name.startsWith('g-')) return gestureIcon(name.slice(2));
  if (name === 'hand') return handMini(color);
  const map = ICONS[name];
  if (!map) throw new Error(`Ikon tidak dikenal: ${name}`);
  return fromMap(map, color);
}

const BIG = { camera, hand, cloud, heart, star, sparkle, logo };

/** Bangun grid sprite berdasarkan nama. Nama ikon diawali `icon-` atau `g-`. */
export function buildSprite(name, colorName = 'dark') {
  const color = PALETTE[colorName] ?? colorName;
  if (name.startsWith('icon-')) return buildIcon(name.slice(5), color);
  if (name.startsWith('g-')) return buildIcon(name, color);
  const fn = BIG[name];
  if (!fn) throw new Error(`Sprite tidak dikenal: ${name}`);
  return name === 'sparkle' ? fn(color) : fn();
}

/**
 * Isi semua <canvas data-sprite="..."> di dalam root.
 * Atribut: data-sprite, data-scale (default 4), data-color (nama palet, untuk ikon/sparkle).
 */
export function mountSprites(root = document) {
  root.querySelectorAll('canvas[data-sprite]').forEach((canvas) => {
    if (canvas.dataset.mounted) return;
    const grid = buildSprite(canvas.dataset.sprite, canvas.dataset.color || 'dark');
    grid.toCanvas(canvas);
    const scale = Number(canvas.dataset.scale || 4);
    canvas.style.width = `${grid.w * scale}px`;
    canvas.style.height = `${grid.h * scale}px`;
    canvas.dataset.mounted = '1';
    if (!canvas.hasAttribute('role')) canvas.setAttribute('aria-hidden', 'true');
  });
}

/** Sprite → data URI PNG (untuk kursor dan favicon dinamis). */
export function spriteToDataUri(grid, scale = 1) {
  const c = document.createElement('canvas');
  c.width = grid.w * scale;
  c.height = grid.h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const col = grid.px[y * grid.w + x];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return c.toDataURL('image/png');
}

export function cursorGrids() {
  const arrow = fromMap(
    [
      'X..........',
      'XX.........',
      'XcX........',
      'XccX.......',
      'XcccX......',
      'XccccX.....',
      'XcccccX....',
      'XccccccX...',
      'XcccccccX..',
      'XccccXXXXX.',
      'XcXcX......',
      'XX.XcX.....',
      'X..XcX.....',
      '....XX.....',
    ],
    P.dark,
    { c: P.bubble },
  );
  const pointer = fromMap(
    [
      '....XX.......',
      '...XccX......',
      '...XccX......',
      '...XccX......',
      '...XccXXX....',
      '...XccXccXX..',
      'XX.XccXccXcX.',
      'XcXXccccccXcX',
      'XccXcccccccXX',
      '.XccccccccccX',
      '..XcccccccccX',
      '..XccccccccX.',
      '...XcccccccX.',
      '....XccccccX.',
      '....XXXXXXXX.',
    ],
    P.dark,
    { c: P.cream },
  );
  return { arrow, pointer };
}

/** Untuk pengujian: semua nama sprite yang tersedia. */
export const SPRITE_NAMES = [
  ...Object.keys(BIG),
  ...Object.keys(ICONS).map((n) => `icon-${n}`),
  'icon-hand',
  'g-portal',
  'g-pinch',
  'g-fist',
];
