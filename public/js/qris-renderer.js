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

  // Cache template Image object
  let cachedTemplateImg = null;

  function loadTemplateImage() {
    return new Promise((resolve, reject) => {
      if (cachedTemplateImg && cachedTemplateImg.complete && cachedTemplateImg.naturalWidth > 0) {
        return resolve(cachedTemplateImg);
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        cachedTemplateImg = img;
        resolve(img);
      };
      img.onerror = (err) => reject(new Error('Gagal memuat template poster QRIS: ' + QRIS_CONFIG.templateUrl));
      img.src = QRIS_CONFIG.templateUrl;
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
   * Render poster template with dynamic QRIS code
   * @param {HTMLCanvasElement|null} targetCanvas Canvas element to draw into (or null for offscreen)
   * @param {string|HTMLImageElement} qrSource DataURL or image element of the QR code
   * @param {object} options
   * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, blob: Blob }>}
   */
  async function renderQRISTemplate(targetCanvas, qrSource, options = {}) {
    const templateImg = await loadTemplateImage();
    const qrImg = (typeof qrSource === 'string') ? await loadImage(qrSource) : qrSource;

    const canvas = targetCanvas || document.createElement('canvas');
    canvas.width = QRIS_CONFIG.width;
    canvas.height = QRIS_CONFIG.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context tidak didukung.');

    // 1. Gambar poster template dasar
    ctx.drawImage(templateImg, 0, 0, QRIS_CONFIG.width, QRIS_CONFIG.height);

    // 2. Bersihkan kotak QR code dengan warna putih murni
    const box = QRIS_CONFIG.qrBox;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2);

    // 3. Tempelkan QR code dinamis tepat di kotak QR template
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
