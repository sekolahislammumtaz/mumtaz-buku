const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { extractQRISDetails } = require('./qris');

let CanvasModule = null;
try {
  CanvasModule = require('@napi-rs/canvas');
} catch (e) {
  CanvasModule = null;
}

const QR_BOX = {
  x: 161,
  y: 329,
  width: 403,
  height: 403,
};

// Cache template buffer in memory per division
const templateCache = new Map();

function getTemplateBuffer(division) {
  const divKey = (division || 'mumtaz').toLowerCase();
  if (templateCache.has(divKey)) {
    return templateCache.get(divKey);
  }

  const candidateNames = [
    `qris-template-${divKey}.png`,
    `qris-template-${divKey}.jpg`,
    'qris-template-mumtaz.png',
    'qris-template-mumtaz.jpg'
  ];

  for (const name of candidateNames) {
    const fullPath = path.join(__dirname, '..', 'public', 'images', name);
    if (fs.existsSync(fullPath)) {
      try {
        const buf = fs.readFileSync(fullPath);
        templateCache.set(divKey, buf);
        return buf;
      } catch (err) {
        console.warn(`Gagal membaca template poster ${name}:`, err.message);
      }
    }
  }

  throw new Error(`Template poster QRIS tidak ditemukan untuk divisi ${division}`);
}

/**
 * Generate complete official QRIS poster Buffer (PNG format)
 * Menyesuaikan nama merchant dan NMID dari payload QRIS yang diunggah
 * @param {string} dynamicQrisString
 * @param {object|string} options
 * @returns {Promise<Buffer>}
 */
async function generateQRISPosterBuffer(dynamicQrisString, options = {}) {
  const division = typeof options === 'string' ? options : (options && options.division ? options.division : 'mumtaz');
  const details = extractQRISDetails(dynamicQrisString);

  const merchantName = (
    (typeof options === 'object' && (options.merchantName || options.merchant_name)) ||
    details.merchantName ||
    'SEKOLAH ISLAM MUMTAZ'
  ).toUpperCase();

  const nmid = (
    (typeof options === 'object' && options.nmid) ||
    details.nmid ||
    'ID2025450627653'
  );

  const criteria = (
    (typeof options === 'object' && (options.terminalCriteria || options.criteria)) ||
    details.terminalCriteria ||
    'A01'
  );

  const tplBuffer = getTemplateBuffer(division);

  // Jika @napi-rs/canvas tersedia (default aktif), gunakan canvas rendering berkualitas tinggi
  if (CanvasModule && CanvasModule.createCanvas) {
    const { createCanvas, loadImage } = CanvasModule;
    const templateImg = await loadImage(tplBuffer);

    const canvas = createCanvas(726, 1024);
    const ctx = canvas.getContext('2d');

    // 1. Gambar poster template dasar
    ctx.drawImage(templateImg, 0, 0, 726, 1024);

    // 2. Bersihkan area teks header lama (nama sekolah, NMID, A01) dengan warna putih murni
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(90, 130, 546, 185);

    // 3. Render Nama Merchant QRIS yang sesuai dengan data upload
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    let fontSize = 28;
    if (merchantName.length > 22) fontSize = 24;
    if (merchantName.length > 30) fontSize = 20;
    if (merchantName.length > 38) fontSize = 17;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(merchantName, 363, 175);

    // 4. Render NMID QRIS yang sesuai dengan data upload
    ctx.fillStyle = '#374151';
    ctx.font = '600 21px sans-serif';
    ctx.fillText(`NMID : ${nmid}`, 363, 222);

    // 5. Render Kriteria / Terminal ID
    ctx.fillStyle = '#4B5563';
    ctx.font = '500 19px sans-serif';
    ctx.fillText(criteria, 363, 268);

    // 6. Bersihkan kotak QR code dengan warna putih murni
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(160, 328, 405, 405);

    // 7. Render QR code dinamis ke dalam kotak target
    const qrBuffer = await QRCode.toBuffer(dynamicQrisString, {
      width: QR_BOX.width,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });

    const qrImg = await loadImage(qrBuffer);
    ctx.drawImage(qrImg, QR_BOX.x, QR_BOX.y, QR_BOX.width, QR_BOX.height);

    return canvas.toBuffer('image/png');
  }

  // Fallback: jika canvas tidak tersedia, gunakan pngjs pixel copy
  const { PNG } = require('pngjs');
  const templatePng = PNG.sync.read(tplBuffer);
  const qrBuffer = await QRCode.toBuffer(dynamicQrisString, {
    width: QR_BOX.width,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  const qrPng = PNG.sync.read(qrBuffer);

  const startX = QR_BOX.x;
  const startY = QR_BOX.y;
  const qrW = Math.min(qrPng.width, QR_BOX.width);
  const qrH = Math.min(qrPng.height, QR_BOX.height);

  for (let y = 0; y < qrH; y++) {
    for (let x = 0; x < qrW; x++) {
      const srcIdx = (qrPng.width * y + x) << 2;
      const dstIdx = (templatePng.width * (startY + y) + (startX + x)) << 2;
      templatePng.data[dstIdx] = qrPng.data[srcIdx];
      templatePng.data[dstIdx + 1] = qrPng.data[srcIdx + 1];
      templatePng.data[dstIdx + 2] = qrPng.data[srcIdx + 2];
      templatePng.data[dstIdx + 3] = qrPng.data[srcIdx + 3];
    }
  }

  return PNG.sync.write(templatePng);
}

module.exports = {
  QR_BOX,
  generateQRISPosterBuffer,
  getTemplateBuffer,
};
