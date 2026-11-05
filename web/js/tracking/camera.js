/**
 * Pembungkus kamera (getUserMedia). Seluruh pesan error berbahasa Indonesia.
 * Video hanya ditampilkan di elemen <video> lokal dan tidak pernah diunggah.
 */

export class CameraError extends Error {
  /** @param kind 'unsupported' | 'insecure' | 'denied' | 'notfound' | 'busy' | 'constraint' | 'unknown' */
  constructor(kind, message) {
    super(message);
    this.name = 'CameraError';
    this.kind = kind;
  }
}

export function describeCameraError(err) {
  if (err instanceof CameraError) return err;
  const name = err?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return new CameraError(
        'denied',
        'Izin kamera ditolak. Klik ikon gembok/kamera di bilah alamat browser, ubah izin kamera menjadi "Izinkan", lalu coba lagi.',
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('notfound', 'Kamera tidak ditemukan. Pastikan webcam terpasang dan aktif.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new CameraError(
        'busy',
        'Kamera tidak bisa dibuka. Mungkin sedang dipakai aplikasi lain (Zoom, Meet, dsb). Tutup aplikasi itu lalu coba lagi.',
      );
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CameraError('constraint', 'Kamera tidak mendukung pengaturan yang diminta.');
    default:
      return new CameraError('unknown', `Kamera gagal dimulai${err?.message ? `: ${err.message}` : '.'}`);
  }
}

export function assertCameraSupported() {
  if (!window.isSecureContext) {
    throw new CameraError(
      'insecure',
      'Kamera hanya bisa dipakai di halaman aman (HTTPS atau localhost). Buka situs lewat alamat https://.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Browser ini tidak mendukung akses kamera. Coba Chrome, Edge, Firefox, atau Safari terbaru.');
  }
}

/**
 * Buka kamera depan dan pasang ke elemen video.
 * @returns {Promise<MediaStream>}
 */
export async function openCamera(video) {
  assertCameraSupported();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (err) {
    if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch (err2) {
        throw describeCameraError(err2);
      }
    } else {
      throw describeCameraError(err);
    }
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch (err) {
    stopStream(stream, video);
    throw describeCameraError(err);
  }
  // pastikan dimensi video sudah diketahui sebelum dipakai
  if (!video.videoWidth) {
    await new Promise((resolve) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      setTimeout(resolve, 1500);
    });
  }
  return stream;
}

/** Hentikan semua track dan lepaskan video (lampu kamera padam). */
export function stopStream(stream, video) {
  if (stream) for (const track of stream.getTracks()) track.stop();
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}
