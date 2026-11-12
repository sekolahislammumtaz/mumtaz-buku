const { dbQuery } = require('../database.js');
const { validateQRIS } = require('./qris.js');

const qrisString = '00020101021162070703A0126640017ID.CO.BANKBSI.WWW0118936004510000603903021000004334440303URE51440014ID.CO.QRIS.WWW0215ID20254506276530303URE5204829953033605802ID5920SEKOLAH ISLAM MUMTAZ6014BANDAR LAMPUNG61053511663042286';

const val = validateQRIS(qrisString);
if (!val.valid) {
  console.error('QRIS Validation Failed:', val.errors);
  process.exit(1);
}

console.log('Valid QRIS payload verified:');
console.log('Merchant:', val.data.merchantName);
console.log('City:', val.data.merchantCity);
console.log('Postal Code:', val.data.postalCode);
console.log('NMID:', val.data.merchantAccountInfo.find(m => m.tag === '51')?.merchantId);
console.log('CRC:', val.data.crc);

async function saveKey(key, value) {
  const existing = await dbQuery.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await dbQuery.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
  } else {
    await dbQuery.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
  console.log(`Saved ${key} successfully.`);
}

async function run() {
  await saveKey('qris_static_mumtaz', qrisString);
  await saveKey('qris_static_sd', qrisString);
  await saveKey('qris_static_smp_sma', qrisString);

  const rows = await dbQuery.all('SELECT key, value FROM settings');
  console.log('\n--- Settings Table Summary ---');
  for (const r of rows) {
    if (r.key.startsWith('qris_')) {
      console.log(`${r.key} : ${r.value}`);
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Error saving QRIS settings:', err);
  process.exit(1);
});
