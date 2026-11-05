# Camera Tracking · Pixel Retro Playground

Versi web dari **RetroLens** (aplikasi Python + OpenCV + MediaPipe). Gerakkan tangan di depan webcam, bukalah *portal* berfilter di antara kedua jari, dan ganti filter lewat gestur. Semua berjalan **di browser**, tanpa backend, dan siap di-hosting lewat **GitHub Pages**.

Proyek asli: [syahdanfx/Retrolens](https://github.com/syahdanfx/Retrolens). Versi desktop Python tetap ada di repository ini (`Retrolens.py`).

## Fitur (sama dengan versi Python)

| Gestur / tombol | Fungsi |
| --- | --- |
| Bentangkan 1–2 tangan | Portal terbuka dari ujung jari |
| Pinch jempol + kelingking | Filter berikutnya (jeda 0,15 dtk) |
| Dua tangan mengepal / `C` | Ganti mode 2D ↔ 3D mesh (jeda 1,2 dtk) |
| Tangan dimiringkan | Portal 2D berbentuk bowtie |
| `N` / `P` | Filter berikutnya / sebelumnya |
| `S` | Simpan foto (PNG, diunduh lokal) |
| `Q` | Matikan kamera |

11 filter, urutannya sama dengan Python: `dual-tone`, `thermal`, `sketch`, `pixelate`, `glitch`, `invert`, `red-channel`, `edge`, `blur`, `cartoon`, `rainbow-wave`.

Tambahan di web: tombol Mulai/Berhenti/Reset, indikator tangan terdeteksi, status kamera, FPS, pesan error yang jelas (izin ditolak, kamera tidak ada, kamera sibuk), dan popup bergaya pixel.

## Cara kerja port

- **Deteksi tangan**: `@mediapipe/tasks-vision` (HandLandmarker) memakai berkas model **yang sama** (`hand_landmarker.task`) dan parameter yang sama (2 tangan, confidence 0,8 / 0,5 / 0,8).
- **Logika gestur** (`web/js/tracking/portal.js`, `geometry.js`): terjemahan langsung dari `PortalProcessor` dan `GeometryUtils` dengan ambang yang sama (pinch 45 px, kepalan 80 px, frame 960×540).
- **Filter** (`web/js/tracking/filters.js`): OpenCV diganti operasi piksel murni di Canvas 2D. Dua pendekatan yang perlu diketahui: filter `cartoon` memakai box blur sebagai pengganti `bilateralFilter(9, 250, 250)` (hasilnya hampir identik karena sigma sangat besar), dan ROI yang terlalu besar diperkecil sementara agar FPS tracking terjaga.
- **Privasi**: video hanya diproses lokal di browser dan tidak pernah dikirim ke server. Kamera dimatikan otomatis saat tombol Berhenti ditekan, saat pengguna menggulir keluar dari playground, saat tab disembunyikan, atau saat halaman ditutup.

## Palet warna

White `#FFFFFF`, Ice Cyan `#B6EEEB`, Soft Cyan `#96CAD9`, Sky Blue `#82BDD9`, Steel Blue `#6988C0`, Muted Blue `#5566A1`, Deep Indigo `#4D4985`. Token CSS di `web/css/style.css` dan `web/js/sprites.js` masih memakai nama lama (`--pink` kini Steel Blue, `--lav` Ice Cyan, `--dark` Deep Indigo); nilainya yang berubah.

## Struktur

```
web/                 situs statis (HTML, CSS, JS ES modules)
  js/tracking/       config, geometry, portal, filters, renderer, camera, handLandmarker
  js/                main, playground, sprites (pixel art), fx (partikel/popup)
scripts/             build.mjs, check-dist.mjs, serve.mjs
tests/               unit test (node --test) + e2e Playwright + stub MediaPipe
.github/workflows/   deploy.yml (GitHub Pages)
Retrolens.py         versi desktop asli
```

## Menjalankan secara lokal

Butuh Node.js ≥ 20.

```bash
npm install                # memasang @mediapipe/tasks-vision
npm test                   # unit test
npm run build              # membuat dist/ (runtime + WASM + model disalin lokal)
npm run serve              # http://localhost:4173/cameratracking/
```

Kamera di browser hanya jalan lewat **HTTPS atau localhost**.


## Versi desktop (Python)

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 Retrolens.py
```

Python 3.8–3.11, webcam diperlukan. Kontrol: `C` mode 2D/3D, `N`/`P` filter, `S` simpan, `Q` keluar.

## Lisensi dan kredit

Lisensi MIT (lihat `LICENSE`). Berdasarkan proyek asli oleh Sy4hdan / syahdanfx. Font: Press Start 2P, VT323, Silkscreen (Google Fonts, dengan fallback monospace).
