const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const QRCode = require('qrcode');

const QR_BOX = {
  x: 161,
  y: 329,
  width: 403,
  height: 403,
};

// Cache template buffer in memory per division to avoid reading disk on every request
const templateCache = new Map();

function getTemplateBuffer(division) {
  const divKey = (division || 'mumtaz').toLowerCase();
  if (templateCache.has(divKey)) {
    return templateCache.get(divKey);
  }

  // Dukung template per divisi jika tersedia, fallback ke default mumtaz
  const candidateNames = [
    `qris-template-${divKey}.png`,
    'qris-template-mumtaz.png'
  ];

  for (const name of candidateNames) {
    const fullPath = path.join(__dirname, '..', 'public', 'images', name);
    if (fs.existsSync(fullPath)) {
      try {
        const buf = fs.readFileSync(fullPath);
        // Validasi struktur format PNG
        PNG.sync.read(buf);
        templateCache.set(divKey, buf);
        return buf;
      } catch (err) {
        console.warn(`Template poster ${name} bukan PNG valid:`, err.message);
      }
    }
  }

  throw new Error(`Template poster QRIS PNG tidak ditemukan untuk divisi ${division}`);
}

/**
 * Generate complete official QRIS poster Buffer (PNG format)
 * @param {string} dynamicQrisString
 * @param {object|string} options
 * @returns {Promise<Buffer>}
 */
async function generateQRISPosterBuffer(dynamicQrisString, options = {}) {
  const division = typeof options === 'string' ? options : (options && options.division ? options.division : 'mumtaz');
  const tplBuffer = getTemplateBuffer(division);
  // Decode template PNG (cloned from cached buffer)
  const templatePng = PNG.sync.read(tplBuffer);

  // Generate QR code PNG at exact target size (403x403) with minimal margin
  const qrBuffer = await QRCode.toBuffer(dynamicQrisString, {
    width: QR_BOX.width,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });

  const qrPng = PNG.sync.read(qrBuffer);

  // Clean white box overlay to clear any previous artifacts
  const startX = QR_BOX.x;
  const startY = QR_BOX.y;
  const qrW = Math.min(qrPng.width, QR_BOX.width);
  const qrH = Math.min(qrPng.height, QR_BOX.height);

  for (let y = 0; y < qrH; y++) {
    for (let x = 0; x < qrW; x++) {
      const srcIdx = (qrPng.width * y + x) << 2;
      const dstIdx = (templatePng.width * (startY + y) + (startX + x)) << 2;

      templatePng.data[dstIdx] = qrPng.data[srcIdx];         // R
      templatePng.data[dstIdx + 1] = qrPng.data[srcIdx + 1]; // G
      templatePng.data[dstIdx + 2] = qrPng.data[srcIdx + 2]; // B
      templatePng.data[dstIdx + 3] = qrPng.data[srcIdx + 3]; // A
    }
  }

  return PNG.sync.write(templatePng);
}

module.exports = {
  QR_BOX,
  generateQRISPosterBuffer,
  getTemplateBuffer
};
