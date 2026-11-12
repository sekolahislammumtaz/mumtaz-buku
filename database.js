const path = require('path');
const crypto = require('crypto');

// Check database mode from environment variables
const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim() : '';
const isPostgres = !!dbUrl && 
  (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));
const isLibsql = !isPostgres && !!process.env.TURSO_DATABASE_URL;

let db = null;         // for SQLite3
let client = null;     // for Turso LibSQL
let pgClient = null;   // for Neon PostgreSQL
let dbQuery = {};

// Helper function to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Dialect-specific placeholder converter (convert ? to $1, $2, etc.) for PostgreSQL
function convertPlaceholders(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

if (isPostgres) {
  console.log('Database Mode: Cloud PostgreSQL (Neon)');
  const { Pool } = require('pg');
  pgClient = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pgClient.on('error', (err) => {
    console.error('Unexpected error on idle database client:', err);
  });

  // DB wrappers for PostgreSQL
  dbQuery = {
    async run(sql, params = []) {
      let querySql = convertPlaceholders(sql);
      const isInsert = querySql.trim().toUpperCase().startsWith('INSERT');
      const isSettings = querySql.toUpperCase().includes('INTO SETTINGS');
      if (isInsert && !isSettings && !querySql.toUpperCase().includes('RETURNING')) {
        querySql += ' RETURNING id';
      }
      
      const res = await pgClient.query(querySql, params);
      
      let lastID = null;
      if (isInsert && res.rows && res.rows[0]) {
        lastID = res.rows[0].id;
      }
      return { lastID, changes: res.rowCount };
    },
    
    async get(sql, params = []) {
      const querySql = convertPlaceholders(sql);
      const res = await pgClient.query(querySql, params);
      return res.rows[0] || null;
    },
    
    async all(sql, params = []) {
      const querySql = convertPlaceholders(sql);
      const res = await pgClient.query(querySql, params);
      return res.rows;
    }
  };
} else if (isLibsql) {
  console.log('Database Mode: Turso Cloud LibSQL');
  const { createClient } = require('@libsql/client');
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  // DB wrappers for Turso
  dbQuery = {
    async run(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      const lastID = typeof result.lastInsertRowid === 'bigint' 
        ? Number(result.lastInsertRowid) 
        : result.lastInsertRowid;
      return { lastID, changes: result.rowsAffected };
    },
    
    async get(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows[0] || null;
    },
    
    async all(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows;
    }
  };
} else {
  console.log('Database Mode: Local SQLite3 File');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'mumtaz_buku.db');
  console.log('Using SQLite database file at:', dbPath);
  db = new sqlite3.Database(dbPath);

  // DB wrappers for local SQLite
  dbQuery = {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
    },
    
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    }
  };
}

// Initialize database schema
async function initDatabase() {
  const defaultPassword = 'simumtaz123';
  const hashedDefault = hashPassword(defaultPassword);

  if (isPostgres) {
    // Test connection with a query to avoid leaking a pool client connection
    await pgClient.query('SELECT NOW()');

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        division VARCHAR(50) DEFAULT 'mumtaz',
        kelas VARCHAR(50) NOT NULL,
        name TEXT NOT NULL,
        publisher TEXT NOT NULL,
        price INTEGER NOT NULL
      )
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        division VARCHAR(50) DEFAULT 'mumtaz',
        student_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        va_number TEXT NOT NULL,
        parent_name TEXT NOT NULL,
        parent_whatsapp TEXT NOT NULL,
        parent_email TEXT NOT NULL,
        book_details TEXT NOT NULL,
        total_price INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        division VARCHAR(50) DEFAULT 'mumtaz',
        name TEXT NOT NULL,
        kelas VARCHAR(50) NOT NULL,
        va_number TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `);

    // Automatic column migration for Postgres
    await pgClient.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'mumtaz'`);
    await pgClient.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'mumtaz'`);
    await pgClient.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS division VARCHAR(50) DEFAULT 'mumtaz'`);
    await pgClient.query(`UPDATE books SET division = 'mumtaz' WHERE division IS NULL`);
    await pgClient.query(`UPDATE orders SET division = 'mumtaz' WHERE division IS NULL`);
    await pgClient.query(`UPDATE students SET division = 'mumtaz' WHERE division IS NULL`);

  } else if (isLibsql) {
    // LibSQL / Turso async schema initialization
    await client.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        kelas TEXT NOT NULL,
        name TEXT NOT NULL,
        publisher TEXT NOT NULL,
        price INTEGER NOT NULL
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        student_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        va_number TEXT NOT NULL,
        parent_name TEXT NOT NULL,
        parent_whatsapp TEXT NOT NULL,
        parent_email TEXT NOT NULL,
        book_details TEXT NOT NULL,
        total_price INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        name TEXT NOT NULL,
        kelas TEXT NOT NULL,
        va_number TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `);

    // Automatic column migration for LibSQL
    for (const table of ['books', 'orders', 'students']) {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const cols = info.rows.map(r => r.name || r[1]);
      if (!cols.includes('division')) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN division TEXT DEFAULT 'mumtaz'`);
      }
      await client.execute(`UPDATE ${table} SET division = 'mumtaz' WHERE division IS NULL`);
    }

  } else {
    // Local SQLite Promise-wrapped schema initialization
    const runSql = (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
    const allSql = (sql, params = []) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    await runSql(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        kelas TEXT NOT NULL,
        name TEXT NOT NULL,
        publisher TEXT NOT NULL,
        price INTEGER NOT NULL
      )
    `);

    await runSql(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        student_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        va_number TEXT NOT NULL,
        parent_name TEXT NOT NULL,
        parent_whatsapp TEXT NOT NULL,
        parent_email TEXT NOT NULL,
        book_details TEXT NOT NULL,
        total_price INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    await runSql(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await runSql(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        division TEXT DEFAULT 'mumtaz',
        name TEXT NOT NULL,
        kelas TEXT NOT NULL,
        va_number TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `);

    // Automatic column migration for SQLite
    for (const table of ['books', 'orders', 'students']) {
      const cols = await allSql(`PRAGMA table_info(${table})`);
      const hasDivision = cols.some(r => r.name === 'division');
      if (!hasDivision) {
        console.log(`Adding division column to ${table}...`);
        await runSql(`ALTER TABLE ${table} ADD COLUMN division TEXT DEFAULT 'mumtaz'`);
      }
      await runSql(`UPDATE ${table} SET division = 'mumtaz' WHERE division IS NULL`);
    }
  }

  // Seed default passwords for all divisions
  const oldRow = await dbQuery.get('SELECT value FROM settings WHERE key = ?', ['admin_password']);
  const mumtazHash = oldRow ? oldRow.value : hashedDefault;

  const passwordSettings = [
    { key: 'admin_password_sd', value: hashedDefault },
    { key: 'admin_password_smp_sma', value: hashedDefault },
    { key: 'admin_password_mumtaz', value: mumtazHash },
    { key: 'admin_password', value: mumtazHash }
  ];

  for (const item of passwordSettings) {
    const existing = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [item.key]);
    if (!existing) {
      await dbQuery.run('INSERT INTO settings (key, value) VALUES (?, ?)', [item.key, item.value]);
      console.log(`Setting ${item.key} initialized.`);
    }
  }

  // Seed default static QRIS Bank BSI Sekolah Islam Mumtaz
  const defaultQrisBSI = '00020101021162070703A0126640017ID.CO.BANKBSI.WWW0118936004510000603903021000004334440303URE51440014ID.CO.QRIS.WWW0215ID20254506276530303URE5204829953033605802ID5920SEKOLAH ISLAM MUMTAZ6014BANDAR LAMPUNG61053511663042286';
  const qrisSettings = [
    { key: 'qris_static_mumtaz', value: defaultQrisBSI },
    { key: 'qris_static_sd', value: defaultQrisBSI },
    { key: 'qris_static_smp_sma', value: defaultQrisBSI }
  ];

  for (const item of qrisSettings) {
    const existing = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [item.key]);
    if (!existing) {
      await dbQuery.run('INSERT INTO settings (key, value) VALUES (?, ?)', [item.key, item.value]);
      console.log(`Setting ${item.key} initialized with official BSI QRIS.`);
    }
  }

  console.log('Database initialized successfully with multi-division support.');
}

module.exports = {
  db,
  initDatabase,
  hashPassword,
  dbQuery
};
