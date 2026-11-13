/**
 * QRIS Engine (EMVCo QR Code)
 * Adaptasi logika dari verssache/qris-dinamis
 */

/**
 * Peta nama tag EMVCo / QRIS
 */
const TAG_NAMES = {
  "00": "Payload Format Indicator",
  "01": "Point of Initiation Method",
  "02": "Visa",
  "03": "Mastercard",
  "04": "Mastercard",
  "15": "Visa",
  "26": "Merchant Account Information",
  "27": "Merchant Account Information",
  "28": "Merchant Account Information",
  "29": "Merchant Account Information",
  "30": "Merchant Account Information",
  "31": "Merchant Account Information",
  "32": "Merchant Account Information",
  "33": "Merchant Account Information",
  "34": "Merchant Account Information",
  "35": "Merchant Account Information",
  "36": "Merchant Account Information",
  "37": "Merchant Account Information",
  "38": "Merchant Account Information",
  "39": "Merchant Account Information",
  "40": "Merchant Account Information",
  "41": "Merchant Account Information",
  "42": "Merchant Account Information",
  "43": "Merchant Account Information",
  "44": "Merchant Account Information",
  "45": "Merchant Account Information",
  "46": "Merchant Account Information",
  "47": "Merchant Account Information",
  "48": "Merchant Account Information",
  "49": "Merchant Account Information",
  "50": "Merchant Account Information",
  "51": "Merchant Account Information",
  "52": "Merchant Category Code",
  "53": "Transaction Currency",
  "54": "Transaction Amount",
  "55": "Tip or Convenience Indicator",
  "56": "Value of Convenience Fee (Fixed)",
  "57": "Value of Convenience Fee (%)",
  "58": "Country Code",
  "59": "Merchant Name",
  "60": "Merchant City",
  "61": "Postal Code",
  "62": "Additional Data Field",
  "63": "CRC",
};

const NESTED_TAGS = new Set([
  ...Array.from({ length: 26 }, (_, i) => String(i + 26).padStart(2, "0")),
  "62",
]);

/**
 * Hitung CRC16-CCITT/FALSE (poly 0x1021, init 0xFFFF).
 * @param {string} str
 * @returns {string} 4 karakter uppercase hex
 */
function calculateCRC16(str) {
  let crc = 0xffff;

  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Verifikasi kecocokan CRC16 4 karakter terakhir.
 * @param {string} qrisString
 * @returns {boolean}
 */
function verifyCRC16(qrisString) {
  if (!qrisString || typeof qrisString !== "string" || qrisString.length < 4) {
    return false;
  }
  const dataWithoutCRC = qrisString.slice(0, -4);
  const declaredCRC = qrisString.slice(-4).toUpperCase();
  return declaredCRC === calculateCRC16(dataWithoutCRC);
}

/**
 * Parse string TLV (Tag-Length-Value) EMVCo.
 * @param {string} data
 * @returns {Array<{ tag: string, name: string, length: number, value: string, children?: Array }>}
 */
function parseTLV(data) {
  if (!data || typeof data !== "string") return [];
  const elements = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) break;

    const tag = data.substring(pos, pos + 2);
    const lengthStr = data.substring(pos + 2, pos + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || pos + 4 + length > data.length) break;

    const value = data.substring(pos + 4, pos + 4 + length);
    const name = TAG_NAMES[tag] || `Unknown (${tag})`;

    const element = { tag, name, length, value };

    if (NESTED_TAGS.has(tag)) {
      try {
        const parsedChildren = parseTLV(value);
        if (parsedChildren.length > 0) {
          element.children = parsedChildren;
        }
      } catch (e) {
        // Abaikan error parsing anak
      }
    }

    elements.push(element);
    pos += 4 + length;
  }

  return elements;
}

/**
 * Parse string QRIS menjadi struktur data terorganisir.
 * @param {string} qrisString
 */
function parseQRISData(qrisString) {
  const raw = parseTLV(qrisString);
  const findTag = (tag) => raw.find((t) => t.tag === tag);

  const methodValue = findTag("01")?.value || "";
  const isDynamic = methodValue === "12";
  const isStatic = methodValue === "11" || (!isDynamic && !!methodValue);

  const tipIndicatorValue = findTag("55")?.value;
  let tipIndicator = null;
  if (tipIndicatorValue === "01") tipIndicator = "prompt";
  else if (tipIndicatorValue === "02") tipIndicator = "fixed";
  else if (tipIndicatorValue === "03") tipIndicator = "percentage";

  const merchantAccountInfo = raw
    .filter((t) => {
      const tagNum = parseInt(t.tag, 10);
      return tagNum >= 26 && tagNum <= 51;
    })
    .map((t) => {
      const children = t.children || [];
      const findChild = (childTag) => children.find((c) => c.tag === childTag);
      return {
        tag: t.tag,
        globallyUniqueId: findChild("00")?.value || "",
        merchantId: findChild("01")?.value || findChild("02")?.value || "",
        merchantCriteria: findChild("03")?.value || "",
        raw: t.value,
        fields: children,
      };
    });

  return {
    pointOfInitiation: methodValue,
    version: findTag("00")?.value || "01",
    isStatic,
    isDynamic,
    method: isDynamic ? "dynamic" : "static",
    merchantAccountInfo,
    mcc: findTag("52")?.value || "",
    currency: findTag("53")?.value || "360",
    amount: findTag("54")?.value || null,
    tipIndicator,
    tipFixed: findTag("56")?.value || null,
    tipPercentage: findTag("57")?.value || null,
    countryCode: findTag("58")?.value || "ID",
    merchantName: findTag("59")?.value || "",
    merchantCity: findTag("60")?.value || "",
    postalCode: findTag("61")?.value || "",
    additionalData: findTag("62")?.children || null,
    crc: findTag("63")?.value || "",
    raw,
  };
}

/**
 * Validasi keabsahan string QRIS EMVCo.
 * @param {string} qrisString
 * @returns {{ valid: boolean, errors: string[], isStatic: boolean, isDynamic: boolean, data: object|null }}
 */
function validateQRIS(qrisString) {
  const errors = [];

  if (!qrisString || typeof qrisString !== "string" || qrisString.trim().length === 0) {
    return {
      valid: false,
      errors: ["QRIS string tidak boleh kosong"],
      isStatic: false,
      isDynamic: false,
      data: null,
    };
  }

  const str = qrisString.trim();

  if (str.length < 30) {
    errors.push("QRIS string terlalu pendek (minimal 30 karakter)");
  }

  if (!str.startsWith("000201")) {
    errors.push('QRIS harus diawali dengan Payload Format Indicator "000201"');
  }

  // Verifikasi CRC16
  if (str.length >= 4) {
    const declaredCRC = str.slice(-4).toUpperCase();
    const calculatedCRC = calculateCRC16(str.slice(0, -4));
    if (declaredCRC !== calculatedCRC) {
      errors.push(`CRC16 tidak cocok: deklarasi ${declaredCRC}, hasil hitung ${calculatedCRC}`);
    }
  }

  const elements = parseTLV(str);
  if (elements.length === 0) {
    errors.push("Gagal mem-parsing elemen TLV dari QRIS");
    return {
      valid: false,
      errors,
      isStatic: false,
      isDynamic: false,
      data: null,
    };
  }

  const tagSet = new Set(elements.map((e) => e.tag));
  const requiredTags = [
    { tag: "00", name: "Payload Format Indicator" },
    { tag: "01", name: "Point of Initiation Method" },
    { tag: "52", name: "Merchant Category Code" },
    { tag: "53", name: "Transaction Currency" },
    { tag: "58", name: "Country Code" },
    { tag: "59", name: "Merchant Name" },
    { tag: "60", name: "Merchant City" },
    { tag: "63", name: "CRC" },
  ];

  for (const req of requiredTags) {
    if (!tagSet.has(req.tag)) {
      errors.push(`Tag wajib ${req.tag} (${req.name}) tidak ditemukan`);
    }
  }

  const methodEl = elements.find((e) => e.tag === "01");
  if (methodEl && methodEl.value !== "11" && methodEl.value !== "12") {
    errors.push(`Nilai Point of Initiation Method "${methodEl.value}" tidak valid (harus "11" atau "12")`);
  }

  const hasMerchantInfo = elements.some((e) => {
    const num = parseInt(e.tag, 10);
    return num >= 26 && num <= 51;
  });
  if (!hasMerchantInfo) {
    errors.push("Informasi Akun Merchant (tag 26-51) tidak ditemukan");
  }

  const data = parseQRISData(str);
  const isDynamic = data.pointOfInitiation === "12";
  const isStatic = data.pointOfInitiation === "11" || (!isDynamic && !!data.pointOfInitiation);

  return {
    valid: errors.length === 0,
    errors,
    isStatic,
    isDynamic,
    data,
  };
}

/**
 * Mengubah QRIS Statis menjadi QRIS Dinamis dengan menyisipkan nominal (amount).
 * @param {string} qrisString
 * @param {{ amount: number|string }} options
 * @returns {{ dynamicQris: string, merchantName: string, merchantCity: string, amount: number }}
 */
function convertToDynamic(qrisString, options = {}) {
  const validation = validateQRIS(qrisString);
  if (!validation.valid) {
    throw new Error(`QRIS tidak valid: ${validation.errors.join("; ")}`);
  }

  const numAmount = Number(options.amount);
  if (isNaN(numAmount) || !isFinite(numAmount)) {
    throw new Error("Nominal harus berupa angka yang valid");
  }
  const intAmount = Math.round(numAmount);
  if (intAmount <= 0) {
    throw new Error("Nominal harus berupa bilangan bulat positif lebih besar dari 0");
  }

  const elements = validation.data.raw;
  const filteredTags = [];

  for (const el of elements) {
    // Lewati tag fee lama dan tag 63 (akan dihitung ulang)
    if (["55", "56", "57", "63"].includes(el.tag)) {
      continue;
    }

    if (el.tag === "01") {
      // Ubah Point of Initiation Method menjadi '12' (dynamic)
      filteredTags.push({ tag: "01", value: "12" });
    } else if (el.tag === "54") {
      // Tag nominal lama akan diganti dengan yang baru
      continue;
    } else {
      filteredTags.push({ tag: el.tag, value: el.value });
    }
  }

  // Sisipkan Tag 54 dengan nilai intAmount
  filteredTags.push({ tag: "54", value: String(intAmount) });

  // Urutkan tag secara menaik berdasarkan nomor tag (00..62)
  filteredTags.sort((a, b) => parseInt(a.tag, 10) - parseInt(b.tag, 10));

  // Bangun string tanpa CRC
  let payloadWithoutCRC = "";
  for (const item of filteredTags) {
    const lenStr = String(item.value.length).padStart(2, "0");
    payloadWithoutCRC += `${item.tag}${lenStr}${item.value}`;
  }

  // Tambahkan tag CRC placeholder '6304' lalu hitung checksum
  const crcPayload = payloadWithoutCRC + "6304";
  const newCRC = calculateCRC16(crcPayload);
  const dynamicQris = crcPayload + newCRC;

  // Ekstrak detail spesifik merchant (NMID & Criteria)
  const details = extractQRISDetails(qrisString);

  return {
    dynamicQris,
    merchantName: details.merchantName || validation.data.merchantName,
    merchantCity: details.merchantCity || validation.data.merchantCity,
    nmid: details.nmid,
    terminalCriteria: details.terminalCriteria,
    amount: intAmount,
  };
}

/**
 * Ekstrak detail merchant (Nama, Kota, NMID, dan Kriteria Terminal) dari string QRIS
 * @param {string} qrisString
 * @returns {{ merchantName: string, merchantCity: string, nmid: string, terminalCriteria: string }}
 */
function extractQRISDetails(qrisString) {
  if (!qrisString || typeof qrisString !== "string") {
    return { merchantName: "", merchantCity: "", nmid: "", terminalCriteria: "A01" };
  }

  const parsed = parseQRISData(qrisString);
  let nmid = "";

  // 1. Cari di Tag 51 (National Merchant ID / Domestik Indonesia)
  const tag51 = parsed.merchantAccountInfo.find((m) => m.tag === "51");
  if (tag51) {
    const sub02 = tag51.fields?.find((c) => c.tag === "02")?.value;
    if (sub02 && sub02.trim()) nmid = sub02.trim();
  }

  // 2. Jika tidak ada di Tag 51, cari di Tag 26-50 sub-tag 02 yang berawalan ID
  if (!nmid) {
    for (const m of parsed.merchantAccountInfo) {
      const sub02 = m.fields?.find((c) => c.tag === "02")?.value;
      if (sub02 && sub02.trim().startsWith("ID")) {
        nmid = sub02.trim();
        break;
      }
    }
  }

  // 3. Fallback regex untuk format NMID (e.g. ID2025... / 0215ID...)
  if (!nmid) {
    const match = qrisString.match(/021[0-9](ID[0-9A-Za-z]+)/);
    if (match) nmid = match[1];
  }

  // Terminal criteria (e.g. Tag 62 sub-tag 07: A01)
  let terminalCriteria = "A01";
  if (parsed.additionalData) {
    const sub07 = parsed.additionalData.find((c) => c.tag === "07")?.value;
    if (sub07 && sub07.trim()) terminalCriteria = sub07.trim();
  }

  return {
    merchantName: parsed.merchantName ? parsed.merchantName.trim() : "",
    merchantCity: parsed.merchantCity ? parsed.merchantCity.trim() : "",
    nmid: nmid || "",
    terminalCriteria: terminalCriteria || "A01",
  };
}

module.exports = {
  calculateCRC16,
  verifyCRC16,
  parseTLV,
  parseQRISData,
  validateQRIS,
  convertToDynamic,
  extractQRISDetails,
};
