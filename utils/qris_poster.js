const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const QRCode = require('qrcode');

const TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'images', 'qris-template-mumtaz.png');
const QR_BOX = {
  x: 161,
  y: 329,
  width: 403,
  height: 403,
};

// Cache template buffer in memory to avoid reading disk on every request
let cachedTemplateBuffer = null;

function getTemplateBuffer() {
  if (!cachedTemplateBuffer) {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new Error(`Template poster QRIS tidak ditemukan di: ${TEMPLATE_PATH}`);
    }
    cachedTemplateBuffer = fs.readFileSync(TEMPLATE_PATH);
  }
  return cachedTemplateBuffer;
}

/**
 * Generate complete official QRIS poster Buffer (PNG format)
 * @param {string} dynamicQrisString
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
async function generateQRISPosterBuffer(dynamicQrisString, options = {}) {
  const tplBuffer = getTemplateBuffer();
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
  TEMPLATE_PATH,
  QR_BOX,
  generateQRISPosterBuffer,
};
