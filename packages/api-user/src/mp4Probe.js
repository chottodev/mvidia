const fs = require('fs/promises');
const fsc = require('fs');

const CODEC_PROBE_BYTES = 8 * 1024 * 1024;

/** Браузерный <video> обычно воспроизводит MP4 с H.264 (avc1), не HEVC (hvc1). */
async function assertBrowserPlayableMp4(filePath) {
  const stat = await fs.stat(filePath);
  const probeLen = Math.min(CODEC_PROBE_BYTES, stat.size);
  const fd = await fsc.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(probeLen);
    const { bytesRead } = await fd.read(buf, 0, probeLen, 0);
    const sample = buf.subarray(0, bytesRead).toString('latin1');
    const hasAvc = /avc1|avc3/.test(sample);
    const hasHevc = /hvc1|hev1|hev\b|hvcC/.test(sample);
    if (hasHevc && !hasAvc) {
      const err = new Error('HEVC_NOT_SUPPORTED');
      throw err;
    }
    if (!sample.includes('ftyp')) {
      const err = new Error('INVALID_MP4');
      throw err;
    }
  } finally {
    await fd.close();
  }
}

module.exports = { assertBrowserPlayableMp4 };
