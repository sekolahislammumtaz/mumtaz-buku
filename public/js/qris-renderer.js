/**
 * qris-renderer.js - Client-Side Rendering Poster QRIS Resmi Bank BSI Sekolah Islam Mumtaz
 * Render dynamic QRIS code into the official Mumtaz BSI template (726x1024)
 */

(function (window) {
  'use strict';

  const QRIS_CONFIG = {
    templateUrl: '/images/qris-template-mumtaz.jpg',
    width: 726,
    height: 1024,
    qrBox: {
      x: 161,
      y: 329,
      width: 403,
      height: 403,
    },
  };

  // Cache template Image object per division
  const cachedTemplateImgs = new Map();

  function loadTemplateImage(division) {
    const divKey = (division || 'mumtaz').toLowerCase();
    if (cachedTemplateImgs.has(divKey)) {
      const cached = cachedTemplateImgs.get(divKey);
      if (cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      const candidates = [
        `/images/qris-template-${divKey}.jpg`,
        `/images/qris-template-${divKey}.png`,
        QRIS_CONFIG.templateUrl
      ];

      function tryLoad(index) {
        if (index >= candidates.length) {
          // Fallback final ke default template
          const fallbackImg = new Image();
          fallbackImg.crossOrigin = 'anonymous';
          fallbackImg.onload = () => {
            cachedTemplateImgs.set(divKey, fallbackImg);
            resolve(fallbackImg);
          };
          fallbackImg.onerror = () => resolve(null);
          fallbackImg.src = QRIS_CONFIG.templateUrl;
          return;
        }

        const candidateUrl = candidates[index];
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (img.naturalWidth > 0) {
            cachedTemplateImgs.set(divKey, img);
            resolve(img);
          } else {
            tryLoad(index + 1);
          }
        };
        img.onerror = () => {
          tryLoad(index + 1);
        };
        img.src = candidateUrl;
      }

      tryLoad(0);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Gagal memuat gambar QR code: ' + src));
      img.src = src;
    });
  }

  /**
   * Parse ringan string QRIS untuk mengekstrak Nama Merchant & NMID
   */
  function parseQRISPayload(str) {
    if (!str || typeof str !== 'string') return {};
    let merchantName = '';
    let nmid = '';
    let criteria = 'A01';

    // Tag 59: Merchant Name
    const mMatch = str.match(/59([0-9]{2})(.+)/);
    if (mMatch) {
      const len = parseInt(mMatch[1], 10);
      merchantName = mMatch[2].substring(0, len);
    }

    // NMID in Tag 51 (atau subtag 02 berawalan ID)
    const nmidMatch = str.match(/021[0-9](ID[0-9A-Za-z]+)/) || str.match(/(ID[0-9]{10,18})/);
    if (nmidMatch) {
      nmid = nmidMatch[1];
    }

    // Additional data criteria (misal: 0703A01)
    const critMatch = str.match(/0703([A-Z0-9]{3})/);
    if (critMatch) {
      criteria = critMatch[1];
    }

    return { merchantName, nmid, criteria };
  }

  /**
   * Render poster template with dynamic QRIS code
   * @param {HTMLCanvasElement|null} targetCanvas Canvas element to draw into (or null for offscreen)
   * @param {string|HTMLImageElement} qrSource DataURL or image element of the QR code
   * @param {object} options
   * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, blob: Blob }>}
   */
  async function renderQRISTemplate(targetCanvas, qrSource, options = {}) {
    const templateImg = await loadTemplateImage(options.division);
    const qrImg = (typeof qrSource === 'string') ? await loadImage(qrSource) : qrSource;

    const canvas = targetCanvas || document.createElement('canvas');
    canvas.width = QRIS_CONFIG.width;
    canvas.height = QRIS_CONFIG.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context tidak didukung.');

    // 1. Gambar poster template dasar
    ctx.drawImage(templateImg, 0, 0, QRIS_CONFIG.width, QRIS_CONFIG.height);

    // 2. Tentukan data merchant & NMID (dari options atau payload QRIS)
    let mName = (options.merchantName || options.merchant_name || '').trim();
    let nmidVal = (options.nmid || '').trim();
    let critVal = (options.terminalCriteria || options.criteria || '').trim();

    if ((!mName || !nmidVal) && (options.qrisString || options.dynamic_qris)) {
      const parsed = parseQRISPayload(options.qrisString || options.dynamic_qris);
      if (!mName && parsed.merchantName) mName = parsed.merchantName;
      if (!nmidVal && parsed.nmid) nmidVal = parsed.nmid;
      if (!critVal && parsed.criteria) critVal = parsed.criteria;
    }

    // Default fallback jika tidak terdeteksi
    if (!mName) mName = 'SEKOLAH ISLAM MUMTAZ';
    if (!nmidVal) nmidVal = 'ID2025450627653';
    if (!critVal) critVal = 'A01';

    // 3. Bersihkan area teks header lama (nama sekolah, NMID, A01) dengan warna putih murni
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(90, 130, 546, 185);

    // 4. Render Nama Merchant QRIS yang sesuai dengan data upload
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111827';
    let fontSize = 28;
    const upperName = mName.toUpperCase();
    if (upperName.length > 22) fontSize = 24;
    if (upperName.length > 30) fontSize = 20;
    if (upperName.length > 38) fontSize = 17;
    ctx.font = `bold ${fontSize}px "Segoe UI", Arial, Helvetica, sans-serif`;
    ctx.fillText(upperName, 363, 175);

    // 5. Render NMID QRIS yang sesuai dengan data upload
    ctx.fillStyle = '#374151';
    ctx.font = '600 21px "Segoe UI", Arial, Helvetica, sans-serif';
    ctx.fillText(`NMID : ${nmidVal}`, 363, 222);

    // 6. Render Kriteria / Terminal ID
    ctx.fillStyle = '#4B5563';
    ctx.font = '500 19px "Segoe UI", Arial, Helvetica, sans-serif';
    ctx.fillText(critVal, 363, 268);

    // 7. Bersihkan kotak QR code dengan warna putih murni
    const box = QRIS_CONFIG.qrBox;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);

    // 8. Tempelkan QR code dinamis tepat di kotak QR template
    ctx.drawImage(qrImg, box.x, box.y, box.width, box.height);

    // Dapatkan data URL kualitas tinggi (JPEG 95% atau PNG)
    const format = options.format || 'image/jpeg';
    const quality = options.quality || 0.95;
    const dataUrl = canvas.toDataURL(format, quality);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), format, quality);
    });

    return { canvas, dataUrl, blob };
  }

  /**
   * Unduh gambar (DataURL / Blob URL / Direct URL) ke perangkat pengguna
   * @param {string} url
   * @param {string} filename
   */
  function downloadQRISImage(url, filename) {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'QRIS-Mumtaz.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export ke window global
  window.QRIS_RENDERER = {
    CONFIG: QRIS_CONFIG,
    renderQRISTemplate,
    downloadQRISImage,
  };

})(window);
