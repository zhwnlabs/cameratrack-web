// STUB PENGUJIAN (bukan MediaPipe asli): mengembalikan landmark dari window.__FAKE_HANDS__
export const FilesetResolver = { async forVisionTasks(path) { window.__STUB_WASM_PATH__ = path; return { path }; } };
export const HandLandmarker = {
  async createFromOptions(fileset, options) {
    window.__STUB_OPTIONS__ = { ...options, baseOptions: { ...options.baseOptions, modelAssetBuffer: options.baseOptions.modelAssetBuffer?.length } };
    if (window.__STUB_FAIL_GPU__ && options.baseOptions.delegate === 'GPU') throw new Error('GPU tidak tersedia (stub)');
    return {
      detectForVideo(canvas, ts) {
        window.__STUB_CALLS__ = (window.__STUB_CALLS__ || 0) + 1;
        if (window.__STUB_THROW__) throw new Error('stub detect error');
        const hands = window.__FAKE_HANDS__ || [];
        return { landmarks: hands.map(h => h.map(([x, y]) => ({ x, y, z: 0 }))) };
      },
    };
  },
};
