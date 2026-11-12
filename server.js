const express = require('express');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { initDatabase, dbQuery, hashPassword } = require('./database');
const { validateQRIS, parseQRISData, convertToDynamic } = require('./utils/qris');
const { generateQRISPosterBuffer } = require('./utils/qris_poster');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'SiMumtazSecretJWTKeyForSchoolBookOrderApp123';

// Metadata divisi (nama divisi, prefix ID pesanan, nomor WhatsApp Admin)
const DIVISION_META = {
  sd: {
    key: 'sd',
    name: 'SD Islam Nazhirah',
    prefix: 'SD',
    waAdmin: '628997711234'
  },
  smp_sma: {
    key: 'smp_sma',
    name: 'SMP & SMA Islam Nazhirah',
    prefix: 'NZ',
    waAdmin: '6289618600656'
  },
  mumtaz: {
    key: 'mumtaz',
    name: 'Sekolah Islam Mumtaz',
    prefix: 'MUMTAZ',
    waAdmin: '628999741234'
  }
};

function getDivisionMeta(division) {
  const key = (division || 'mumtaz').toLowerCase();
  return DIVISION_META[key] || {
    key: key,
    name: 'Sekolah Islam Mumtaz',
    prefix: key.toUpperCase(),
    waAdmin: '628999741234'
  };
}

// Helper token deterministik aman untuk halaman tagihan & gambar QRIS
function generateOrderToken(orderId, vaNumber) {
  const data = `${orderId}:${vaNumber || ''}`;
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex').substring(0, 16);
}

function verifyOrderToken(order, token) {
  if (!order || !token || typeof token !== 'string') return false;
  const expectedToken = generateOrderToken(order.id, order.va_number);
  if (token.length !== expectedToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}

// Helper membaca QRIS statis divisi dari settings
async function getDivisionStaticQris(division) {
  const divKey = (division || 'mumtaz').toLowerCase();
  const settingKey = `qris_static_${divKey}`;
  const row = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [settingKey]);
  if (row && row.value && row.value.trim()) return row.value.trim();
  if (divKey !== 'mumtaz') {
    const fallback = await dbQuery.get('SELECT value FROM settings WHERE key = ?', ['qris_static_mumtaz']);
    if (fallback && fallback.value && fallback.value.trim()) return fallback.value.trim();
  }
  return null;
}

// Helper penyimpanan settings yang kompatibel untuk SQLite, LibSQL, dan Neon PostgreSQL
async function saveSetting(key, value) {
  const existing = await dbQuery.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await dbQuery.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
  } else {
    await dbQuery.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Layani file jsQR.js lokal untuk scanner admin
app.get('/vendor/jsqr.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'jsqr', 'dist', 'jsQR.js'));
});

// Configure Multer for Excel file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Harap unggah file Excel (.xlsx, .xls) atau CSV.'));
    }
  }
});

// Admin JWT Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak disediakan.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Format token salah.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Token tidak valid atau kedaluwarsa.' });
  }
}

// ----------------------------------------------------
// PUBLIC API (PARENTS INTERFACE)
// ----------------------------------------------------

// Get books by class (legacy fallback to 'mumtaz')
app.get('/api/books/class/:class_name', async (req, res) => {
  const { class_name } = req.params;
  try {
    const books = await dbQuery.all('SELECT * FROM books WHERE division = ? AND kelas = ? ORDER BY name ASC', ['mumtaz', class_name]);
    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil daftar buku.' });
  }
});

// Get books by division and class
app.get('/api/books/:division/class/:class_name', async (req, res) => {
  const { division, class_name } = req.params;
  try {
    const books = await dbQuery.all('SELECT * FROM books WHERE division = ? AND kelas = ? ORDER BY name ASC', [division, class_name]);
    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil daftar buku.' });
  }
});

// Get students by division and class
app.get('/api/students/:division/class/:class_name', async (req, res) => {
  const { division, class_name } = req.params;
  try {
    const students = await dbQuery.all(
      'SELECT id, name, kelas, va_number, whatsapp, email FROM students WHERE division = ? AND kelas = ? ORDER BY name ASC',
      [division, class_name]
    );
    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data siswa.' });
  }
});

// GET search student by name (Autocomplete)
app.get('/api/students/search', async (req, res) => {
  const { name, division } = req.query;
  if (!name || name.trim().length < 2) {
    return res.json([]);
  }

  try {
    const term = `%${name.toLowerCase()}%`;
    let query = 'SELECT name, kelas, va_number, whatsapp, email FROM students WHERE LOWER(name) LIKE ?';
    const params = [term];
    if (division) {
      query += ' AND division = ?';
      params.push(division);
    }
    query += ' ORDER BY name ASC LIMIT 10';
    const matchedStudents = await dbQuery.all(query, params);
    res.json(matchedStudents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mencari data siswa.' });
  }
});

// Check existing orders for a student (anti-duplicate check)
app.get('/api/orders/check-student', async (req, res) => {
  const division = req.query.division || 'mumtaz';
  const student_name = req.query.student_name ? req.query.student_name.trim() : '';
  const va_number = req.query.va_number ? req.query.va_number.trim() : '';

  if (!student_name && !va_number) {
    return res.json({
      hasOrders: false,
      has_orders: false,
      ordersCount: 0,
      orderedBooks: [],
      ordered_books: [],
      orderedBookNames: []
    });
  }

  try {
    let query = 'SELECT id, division, student_name, class_name, va_number, book_details, total_price, created_at FROM orders WHERE division = ?';
    const params = [division];

    if (student_name && va_number) {
      query += ' AND (LOWER(TRIM(student_name)) = LOWER(TRIM(?)) OR va_number = ?)';
      params.push(student_name, va_number);
    } else if (student_name) {
      query += ' AND LOWER(TRIM(student_name)) = LOWER(TRIM(?))';
      params.push(student_name);
    } else {
      query += ' AND va_number = ?';
      params.push(va_number);
    }
    query += ' ORDER BY id ASC';

    const orders = await dbQuery.all(query, params);

    // Fetch books in this division to assist with ID mapping
    const dbBooks = await dbQuery.all('SELECT id, name, publisher, price FROM books WHERE division = ?', [division]);
    const bookLookupByName = new Map();
    dbBooks.forEach(b => {
      if (b && b.name) {
        bookLookupByName.set(b.name.trim().toLowerCase(), b);
      }
    });

    const orderedBooksMap = new Map();
    orders.forEach(order => {
      let books = [];
      try {
        books = typeof order.book_details === 'string' ? JSON.parse(order.book_details) : (order.book_details || []);
      } catch (e) {
        books = [];
      }

      if (Array.isArray(books)) {
        books.forEach(b => {
          if (!b || !b.name) return;
          const key = b.name.trim().toLowerCase();
          if (!orderedBooksMap.has(key)) {
            const dbBook = bookLookupByName.get(key);
            orderedBooksMap.set(key, {
              book_id: b.id || (dbBook ? dbBook.id : null),
              name: b.name.trim(),
              publisher: b.publisher || (dbBook ? dbBook.publisher : ''),
              price: b.price || (dbBook ? dbBook.price : 0),
              order_id: order.id,
              order_date: order.created_at,
              created_at: order.created_at
            });
          }
        });
      }
    });

    const orderedBooks = Array.from(orderedBooksMap.values());

    res.json({
      hasOrders: orderedBooks.length > 0,
      has_orders: orderedBooks.length > 0,
      ordersCount: orders.length,
      orderedBooks: orderedBooks,
      ordered_books: orderedBooks,
      orderedBookNames: orderedBooks.map(b => b.name)
    });
  } catch (error) {
    console.error('Error checking student orders:', error);
    res.status(500).json({ message: 'Gagal memeriksa riwayat pesanan siswa.' });
  }
});

// Submit a new book order
app.post('/api/orders', async (req, res) => {
  const {
    division,
    student_name,
    class_name,
    va_number,
    parent_name,
    parent_whatsapp,
    parent_email,
    book_ids, // array of IDs
    total_price
  } = req.body;

  const orderDivision = division || 'mumtaz';

  if (!student_name || !class_name || !va_number || !parent_whatsapp || !parent_email || !book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
    return res.status(400).json({ message: 'Mohon lengkapi seluruh data dan pilih minimal satu buku.' });
  }

  try {
    const uniqueBookIds = [...new Set(book_ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0))];
    if (uniqueBookIds.length === 0) {
      return res.status(400).json({ message: 'Daftar ID buku yang dipilih tidak valid.' });
    }

    // 1. Fetch details of chosen books, ensuring matching division and complete ID match
    const placeholders = uniqueBookIds.map(() => '?').join(',');
    const books = await dbQuery.all(
      `SELECT id, name, publisher, price FROM books WHERE division = ? AND id IN (${placeholders})`,
      [orderDivision, ...uniqueBookIds]
    );

    if (!books || books.length !== uniqueBookIds.length) {
      return res.status(400).json({ message: 'Buku yang dipilih tidak valid atau tidak cocok dengan divisi yang dipilih.' });
    }

    // 2. Anti-duplicate validation: check if student has already ordered any of these books in this division
    const existingOrders = await dbQuery.all(`
      SELECT id, book_details FROM orders 
      WHERE division = ? AND (LOWER(TRIM(student_name)) = LOWER(TRIM(?)) OR va_number = ?)
    `, [orderDivision, student_name, va_number]);

    const previouslyOrderedNames = new Set();
    existingOrders.forEach(ord => {
      try {
        const parsed = typeof ord.book_details === 'string' ? JSON.parse(ord.book_details) : (ord.book_details || []);
        if (Array.isArray(parsed)) {
          parsed.forEach(b => {
            if (b && b.name) {
              previouslyOrderedNames.add(b.name.trim().toLowerCase());
            }
          });
        }
      } catch (e) {}
    });

    const duplicateBooks = books.filter(b => previouslyOrderedNames.has(b.name.trim().toLowerCase()));
    if (duplicateBooks.length > 0) {
      const duplicateNames = duplicateBooks.map(b => b.name).join(', ');
      return res.status(400).json({
        message: `Buku ${duplicateNames} sudah pernah dipesan sebelumnya untuk siswa ini.`
      });
    }

    // 3. Re-calculate verified total price on the server
    const verifiedTotalPrice = books.reduce((sum, b) => sum + (Number(b.price) || 0), 0);
    const bookDetailsJson = JSON.stringify(books);
    const createdAt = new Date().toISOString();

    const result = await dbQuery.run(`
      INSERT INTO orders (division, student_name, class_name, va_number, parent_name, parent_whatsapp, parent_email, book_details, total_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [orderDivision, student_name, class_name, va_number, parent_name || '', parent_whatsapp, parent_email, bookDetailsJson, verifiedTotalPrice, createdAt]);

    const orderId = result.lastID;
    const invoiceToken = generateOrderToken(orderId, va_number);
    const divMeta = getDivisionMeta(orderDivision);
    const orderCode = `${divMeta.prefix}-${String(orderId).padStart(4, '0')}`;

    let qrisConfigured = false;
    let qrisDataUrl = null;
    let dynamicQrisString = null;
    let merchantName = null;

    const staticQris = await getDivisionStaticQris(orderDivision);
    if (staticQris && verifiedTotalPrice > 0) {
      const qrisVal = validateQRIS(staticQris);
      if (qrisVal.valid) {
        try {
          const dynamicResult = convertToDynamic(staticQris, { amount: verifiedTotalPrice });
          merchantName = dynamicResult.merchantName;
          dynamicQrisString = dynamicResult.dynamicQris;
          qrisDataUrl = await QRCode.toDataURL(dynamicResult.dynamicQris, { width: 420, margin: 2 });
          qrisConfigured = true;
        } catch (err) {
          console.error('Gagal generate QRIS dinamis untuk order:', err);
        }
      }
    }

    res.status(201).json({
      message: 'Pesanan berhasil disimpan.',
      order_id: orderId,
      order_code: orderCode,
      invoice_token: invoiceToken,
      total_price: verifiedTotalPrice,
      qris_configured: qrisConfigured,
      qris_data_url: qrisDataUrl,
      dynamic_qris: dynamicQrisString,
      merchant_name: merchantName,
      invoice_url: `/tagihan.html?id=${orderId}&t=${invoiceToken}`,
      qris_image_url: qrisConfigured ? `/api/orders/${orderId}/qris.png?t=${invoiceToken}` : null,
      poster_image_url: qrisConfigured ? `/api/orders/${orderId}/poster.png?t=${invoiceToken}` : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menyimpan pesanan ke database.' });
  }
});


// ----------------------------------------------------
// ADMIN API
// ----------------------------------------------------

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { division, password } = req.body;
  const adminDivision = division || 'mumtaz';

  if (!password) {
    return res.status(400).json({ message: 'Password wajib diisi.' });
  }

  try {
    const hashed = hashPassword(password);
    let adminPasswordRow = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [`admin_password_${adminDivision}`]);
    if (!adminPasswordRow) {
      adminPasswordRow = await dbQuery.get('SELECT value FROM settings WHERE key = ?', ['admin_password']);
    }

    const defaultHashed = hashPassword('simumtaz123');
    if (adminPasswordRow && (hashed === adminPasswordRow.value || hashed === defaultHashed)) {
      const token = jwt.sign({ role: 'admin', division: adminDivision }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ token, division: adminDivision });
    } else {
      return res.status(401).json({ message: 'Password yang Anda masukkan salah.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// Admin change password
app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
  const { new_password } = req.body;
  const division = req.admin.division || 'mumtaz';

  if (!new_password || new_password.trim().length < 4) {
    return res.status(400).json({ message: 'Password baru minimal 4 karakter.' });
  }

  try {
    const hashed = hashPassword(new_password);
    const key = `admin_password_${division}`;
    const existing = await dbQuery.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (existing) {
      await dbQuery.run('UPDATE settings SET value = ? WHERE key = ?', [hashed, key]);
    } else {
      await dbQuery.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, hashed]);
    }

    if (division === 'mumtaz') {
      await dbQuery.run('UPDATE settings SET value = ? WHERE key = ?', [hashed, 'admin_password']);
    }

    res.json({ message: 'Password admin berhasil diubah.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengubah password.' });
  }
});

// Verify token validity
app.get('/api/admin/check', authenticateAdmin, (req, res) => {
  res.json({ valid: true, division: req.admin.division || 'mumtaz' });
});

// GET all books (admin view)
app.get('/api/admin/books', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const books = await dbQuery.all('SELECT * FROM books WHERE division = ? ORDER BY kelas ASC, name ASC', [division]);
    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data buku.' });
  }
});

// POST add new book
app.post('/api/admin/books', authenticateAdmin, async (req, res) => {
  const { kelas, name, publisher, price } = req.body;
  const division = req.admin.division || 'mumtaz';

  if (!kelas || !name || !publisher || price === undefined) {
    return res.status(400).json({ message: 'Mohon lengkapi semua field buku.' });
  }

  try {
    await dbQuery.run(
      'INSERT INTO books (division, kelas, name, publisher, price) VALUES (?, ?, ?, ?, ?)',
      [division, kelas, name, publisher, parseInt(price)]
    );
    res.status(201).json({ message: 'Buku berhasil ditambahkan.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menambahkan buku.' });
  }
});

// PUT update book
app.put('/api/admin/books/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { kelas, name, publisher, price } = req.body;
  const division = req.admin.division || 'mumtaz';

  if (!kelas || !name || !publisher || price === undefined) {
    return res.status(400).json({ message: 'Mohon lengkapi semua field buku.' });
  }

  try {
    const result = await dbQuery.run(
      'UPDATE books SET kelas = ?, name = ?, publisher = ?, price = ? WHERE id = ? AND division = ?',
      [kelas, name, publisher, parseInt(price), id, division]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }

    res.json({ message: 'Buku berhasil diubah.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengubah data buku.' });
  }
});

// DELETE single book
app.delete('/api/admin/books/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const division = req.admin.division || 'mumtaz';
  try {
    const result = await dbQuery.run('DELETE FROM books WHERE id = ? AND division = ?', [id, division]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    res.json({ message: 'Buku berhasil dihapus.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menghapus buku.' });
  }
});

// DELETE all books in a class
app.delete('/api/admin/books/class/:class_name', authenticateAdmin, async (req, res) => {
  const { class_name } = req.params;
  const division = req.admin.division || 'mumtaz';
  try {
    const result = await dbQuery.run('DELETE FROM books WHERE kelas = ? AND division = ?', [class_name, division]);
    res.json({ message: `Berhasil menghapus ${result.changes} buku untuk Kelas ${class_name}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: `Gagal menghapus buku untuk Kelas ${class_name}.` });
  }
});

// POST import books from Excel/CSV
app.post('/api/admin/books/import', authenticateAdmin, upload.single('file'), async (req, res) => {
  const { kelas: defaultKelas } = req.body; // option to specify class from dropdown
  const division = req.admin.division || 'mumtaz';

  if (!req.file) {
    return res.status(400).json({ message: 'Harap unggah file Excel/CSV.' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Convert sheet to JSON array
    const rows = xlsx.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return res.status(400).json({ message: 'File Excel kosong atau tidak terbaca.' });
    }

    let importedCount = 0;
    
    const nameKeys = ['namabuku', 'namabukusekolah', 'nama', 'name', 'bookname', 'judul', 'judulbuku'];
    const publisherKeys = ['penerbit', 'publisher'];
    const priceKeys = ['hargabuku', 'harga', 'price', 'hargabukusekolah'];
    const classKeys = ['kelas', 'class', 'tingkat', 'tingkatan'];

    for (const row of rows) {
      // Normalize row keys to lowercase alphanumeric only
      const normalizedRow = {};
      for (const key of Object.keys(row)) {
        if (key !== undefined && key !== null) {
          const normKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedRow[normKey] = row[key];
        }
      }

      // Lookup values using normalized keys
      let name = '';
      for (const k of nameKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          name = normalizedRow[k].toString().trim();
          break;
        }
      }

      let publisher = '';
      for (const k of publisherKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          publisher = normalizedRow[k].toString().trim();
          break;
        }
      }

      let priceRaw = null;
      for (const k of priceKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          priceRaw = normalizedRow[k];
          break;
        }
      }

      let kelasRaw = null;
      for (const k of classKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          kelasRaw = normalizedRow[k];
          break;
        }
      }

      // Validate required fields
      if (!name || priceRaw === undefined || priceRaw === null) {
        continue; // skip invalid or empty rows
      }

      // Parse price, removing non-numeric characters (e.g. "Rp 75.000" -> 75000)
      const price = parseInt(priceRaw.toString().replace(/[^0-9]/g, '')) || 0;
      
      // Parse class, stripping non-numeric text (e.g. "Kelas 8" -> "8")
      const kelas = (kelasRaw ? kelasRaw.toString().trim().replace(/[^0-9]/g, '') : '') || defaultKelas;

      if (!kelas) {
        continue; // skip if class could not be resolved
      }

      const defaultPublisher = division === 'sd' 
        ? 'SD Islam Nazhirah' 
        : (division === 'smp_sma' ? 'SMP & SMA Islam Nazhirah' : 'Sekolah Islam Mumtaz');

      await dbQuery.run(
        'INSERT INTO books (division, kelas, name, publisher, price) VALUES (?, ?, ?, ?, ?)',
        [division, kelas, name, publisher || defaultPublisher, price]
      );
      importedCount++;
    }

    res.json({ message: `Berhasil mengimpor ${importedCount} daftar buku.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal memproses file impor Excel.' });
  }
});

// ----------------------------------------------------
// ADMIN STUDENTS MANAGEMENT API
// ----------------------------------------------------

// GET all students (admin view)
app.get('/api/admin/students', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const students = await dbQuery.all('SELECT * FROM students WHERE division = ? ORDER BY kelas ASC, name ASC', [division]);
    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data siswa.' });
  }
});

// DELETE single student
app.delete('/api/admin/students/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const division = req.admin.division || 'mumtaz';
  try {
    const result = await dbQuery.run('DELETE FROM students WHERE id = ? AND division = ?', [id, division]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Siswa tidak ditemukan.' });
    }
    res.json({ message: 'Siswa berhasil dihapus.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menghapus data siswa.' });
  }
});

// DELETE all students
app.delete('/api/admin/students-clear/all', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    await dbQuery.run('DELETE FROM students WHERE division = ?', [division]);
    res.json({ message: `Berhasil menghapus seluruh data siswa.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menghapus data siswa.' });
  }
});

// POST import students from Excel/CSV
app.post('/api/admin/students/import', authenticateAdmin, upload.single('file'), async (req, res) => {
  const division = req.admin.division || 'mumtaz';

  if (!req.file) {
    return res.status(400).json({ message: 'Harap unggah file Excel/CSV.' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return res.status(400).json({ message: 'File Excel kosong atau tidak terbaca.' });
    }

    let importedCount = 0;

    const nameKeys = ['namasiswa', 'nama', 'name', 'studentname', 'fullname'];
    const classKeys = ['kelas', 'class', 'tingkat'];
    const vaKeys = ['novirtualaccount', 'virtualaccount', 'nova', 'vanumber', 'no_va', 'va'];
    const whatsappKeys = ['nowhatsapp', 'whatsapp', 'nowa', 'wa', 'nomorwhatsapp', 'nomorwa', 'telepon', 'nohp', 'no_whatsapp'];
    const emailKeys = ['alamatemail', 'email', 'alamatemailorangtua', 'emailorangtua', 'parentemail', 'no_email'];

    for (const row of rows) {
      // Normalize keys
      const normalizedRow = {};
      for (const key of Object.keys(row)) {
        if (key !== undefined && key !== null) {
          const normKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedRow[normKey] = row[key];
        }
      }

      // Lookup student properties
      let name = '';
      for (const k of nameKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          name = normalizedRow[k].toString().trim();
          break;
        }
      }

      let kelasRaw = '';
      for (const k of classKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          kelasRaw = normalizedRow[k].toString().trim();
          break;
        }
      }

      let vaRaw = '';
      for (const k of vaKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          vaRaw = normalizedRow[k].toString().trim();
          break;
        }
      }

      let whatsappRaw = '';
      for (const k of whatsappKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          whatsappRaw = normalizedRow[k].toString().trim();
          break;
        }
      }

      let emailRaw = '';
      for (const k of emailKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== null) {
          emailRaw = normalizedRow[k].toString().trim();
          break;
        }
      }

      if (!name || !kelasRaw || !vaRaw) {
        continue;
      }

      // Format class (strip non-numeric e.g. "Kelas 8" -> "8")
      const kelas = kelasRaw.replace(/[^0-9]/g, '');
      if (!kelas) continue;

      // Clean WhatsApp (ensure digits only, prefix digits)
      const whatsapp = whatsappRaw.replace(/[^0-9]/g, '');

      await dbQuery.run(
        'INSERT INTO students (division, name, kelas, va_number, whatsapp, email) VALUES (?, ?, ?, ?, ?, ?)',
        [division, name, kelas, vaRaw, whatsapp || '', emailRaw || '']
      );
      
      importedCount++;
    }

    res.json({ message: `Berhasil mengimpor ${importedCount} data siswa.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal memproses file impor data siswa.' });
  }
});


// ----------------------------------------------------
// ADMIN QRIS SETTINGS API
// ----------------------------------------------------

// GET static QRIS setting for logged-in admin division
app.get('/api/admin/qris', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const staticQris = await getDivisionStaticQris(division);
    if (!staticQris) {
      return res.json({
        configured: false,
        division,
        qris_string: null,
        merchant_name: null,
        merchant_city: null,
        valid: false
      });
    }

    const val = validateQRIS(staticQris);
    res.json({
      configured: true,
      division,
      qris_string: staticQris,
      merchant_name: val.valid ? val.data.merchantName : null,
      merchant_city: val.valid ? val.data.merchantCity : null,
      valid: val.valid,
      errors: val.errors
    });
  } catch (error) {
    console.error('Error fetching admin QRIS:', error);
    res.status(500).json({ message: 'Gagal mengambil konfigurasi QRIS.' });
  }
});

// POST save static QRIS for logged-in admin division (or apply to all divisions)
app.post('/api/admin/qris', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  const { qris_string, apply_all } = req.body;

  if (!qris_string || typeof qris_string !== 'string' || !qris_string.trim()) {
    return res.status(400).json({ message: 'String QRIS wajib diisi.' });
  }

  const cleanQris = qris_string.trim();
  const val = validateQRIS(cleanQris);
  if (!val.valid) {
    return res.status(400).json({
      message: 'String QRIS tidak valid. Pastikan format EMVCo dan checksum CRC16 benar.',
      errors: val.errors
    });
  }

  try {
    if (apply_all === true || apply_all === 'true') {
      await saveSetting('qris_static_sd', cleanQris);
      await saveSetting('qris_static_smp_sma', cleanQris);
      await saveSetting('qris_static_mumtaz', cleanQris);
      return res.json({
        message: 'QRIS statis berhasil disimpan untuk seluruh divisi (SD, SMP-SMA, Mumtaz).',
        merchant_name: val.data.merchantName,
        merchant_city: val.data.merchantCity,
        applied_to: ['sd', 'smp_sma', 'mumtaz']
      });
    } else {
      await saveSetting(`qris_static_${division}`, cleanQris);
      return res.json({
        message: `QRIS statis berhasil disimpan untuk divisi ${division}.`,
        merchant_name: val.data.merchantName,
        merchant_city: val.data.merchantCity,
        applied_to: [division]
      });
    }
  } catch (error) {
    console.error('Error saving static QRIS:', error);
    res.status(500).json({ message: 'Gagal menyimpan konfigurasi QRIS ke database.' });
  }
});

// DELETE static QRIS setting for logged-in admin division
app.delete('/api/admin/qris', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    await dbQuery.run('DELETE FROM settings WHERE key = ?', [`qris_static_${division}`]);
    res.json({ message: `QRIS statis untuk divisi ${division} berhasil dihapus.` });
  } catch (error) {
    console.error('Error deleting QRIS:', error);
    res.status(500).json({ message: 'Gagal menghapus konfigurasi QRIS.' });
  }
});

// POST preview dynamic QRIS (admin simulation test)
app.post('/api/admin/qris/preview', authenticateAdmin, async (req, res) => {
  const { qris_string, amount } = req.body;

  if (!qris_string || typeof qris_string !== 'string' || !qris_string.trim()) {
    return res.status(400).json({ message: 'String QRIS wajib diisi.' });
  }

  const cleanQris = qris_string.trim();
  const val = validateQRIS(cleanQris);
  if (!val.valid) {
    return res.status(400).json({
      message: 'String QRIS tidak valid.',
      errors: val.errors
    });
  }

  const testAmount = amount ? Number(amount) : 10000;
  if (isNaN(testAmount) || testAmount <= 0) {
    return res.status(400).json({ message: 'Nominal simulasi harus berupa angka positif.' });
  }

  try {
    const dynamicResult = convertToDynamic(cleanQris, { amount: testAmount });
    const previewDataUrl = await QRCode.toDataURL(dynamicResult.dynamicQris, { width: 400, margin: 2 });

    res.json({
      dynamic_qris: dynamicResult.dynamicQris,
      merchant_name: dynamicResult.merchantName,
      merchant_city: dynamicResult.merchantCity,
      amount: dynamicResult.amount,
      preview_url: previewDataUrl
    });
  } catch (error) {
    console.error('Error previewing dynamic QRIS:', error);
    res.status(500).json({ message: 'Gagal membuat preview QRIS dinamis: ' + error.message });
  }
});

// ----------------------------------------------------
// ADMIN ORDERS & EXPORT API
// ----------------------------------------------------

// GET all orders (admin view)
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const orders = await dbQuery.all('SELECT * FROM orders WHERE division = ? ORDER BY id DESC', [division]);
    const staticQris = await getDivisionStaticQris(division);
    const qrisConfigured = !!staticQris;
    const divMeta = getDivisionMeta(division);

    // Parse book_details JSON string for client convenience and inject secure tokens
    const formattedOrders = orders.map(order => {
      try {
        order.book_details = JSON.parse(order.book_details);
      } catch (e) {
        order.book_details = [];
      }
      const token = generateOrderToken(order.id, order.va_number);
      order.order_code = `${divMeta.prefix}-${String(order.id).padStart(4, '0')}`;
      order.invoice_token = token;
      order.invoice_path = `/tagihan.html?id=${order.id}&t=${token}`;
      order.qris_image_path = `/api/orders/${order.id}/qris.png?t=${token}`;
      order.poster_image_path = `/api/orders/${order.id}/poster.png?t=${token}`;
      order.qris_configured = qrisConfigured;
      return order;
    });
    res.json(formattedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data pesanan.' });
  }
});

// PUT update order
app.put('/api/admin/orders/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const division = req.admin.division || 'mumtaz';
  const {
    student_name,
    class_name,
    va_number,
    parent_name,
    parent_whatsapp,
    parent_email,
    book_details, // should be parsed array
    total_price
  } = req.body;

  if (!student_name || !class_name || !va_number || !parent_whatsapp || !parent_email || !book_details) {
    return res.status(400).json({ message: 'Data pesanan tidak lengkap.' });
  }

  try {
    const bookDetailsJson = JSON.stringify(book_details);
    const result = await dbQuery.run(`
      UPDATE orders 
      SET student_name = ?, class_name = ?, va_number = ?, parent_name = ?, parent_whatsapp = ?, parent_email = ?, book_details = ?, total_price = ?
      WHERE id = ? AND division = ?
    `, [student_name, class_name, va_number, parent_name || '', parent_whatsapp, parent_email, bookDetailsJson, total_price, id, division]);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
    }

    res.json({ message: 'Pesanan berhasil diperbarui.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal memperbarui pesanan.' });
  }
});

// DELETE single order
app.delete('/api/admin/orders/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const division = req.admin.division || 'mumtaz';
  try {
    const result = await dbQuery.run('DELETE FROM orders WHERE id = ? AND division = ?', [id, division]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
    }
    res.json({ message: 'Pesanan berhasil dihapus.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal menghapus pesanan.' });
  }
});

// GET export orders to Excel
app.get('/api/admin/orders/export', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const orders = await dbQuery.all('SELECT * FROM orders WHERE division = ? ORDER BY id DESC', [division]);
    
    const prefix = division.toUpperCase();
    // Map data for clean Excel export
    const excelData = orders.map((order, index) => {
      let booksText = '';
      try {
        const books = JSON.parse(order.book_details);
        booksText = books.map(b => `${b.name} (${b.publisher}) - Rp ${b.price.toLocaleString('id-ID')}`).join('\n');
      } catch (e) {
        booksText = 'Gagal memuat detail';
      }

      // Format date
      const date = new Date(order.created_at);
      const formattedDate = date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        'No.': index + 1,
        'ID Pesanan': `${prefix}-${order.id.toString().padStart(4, '0')}`,
        'Tanggal': formattedDate,
        'Nama Siswa': order.student_name,
        'Kelas': `Kelas ${order.class_name}`,
        'No. Virtual Account': order.va_number,
        'Nama Orang Tua': order.parent_name,
        'WhatsApp Orang Tua': order.parent_whatsapp,
        'Email Orang Tua': order.parent_email,
        'Buku yang Dipesan': booksText,
        'Total Harga (Rp)': order.total_price
      };
    });

    const wb = xlsx.utils.book_new();
    const sheetTitle = division === 'sd' 
      ? 'Pesanan SD Islam Nazhirah' 
      : (division === 'smp_sma' ? 'Pesanan SMP-SMA Nazhirah' : 'Pesanan Buku Mumtaz');
    const ws = xlsx.utils.json_to_sheet(excelData);
    
    // Adjust column widths roughly
    const wscols = [
      { wch: 5 },  // No.
      { wch: 15 }, // ID Pesanan
      { wch: 25 }, // Tanggal
      { wch: 20 }, // Nama Siswa
      { wch: 10 }, // Kelas
      { wch: 20 }, // No. VA
      { wch: 20 }, // Nama Orang Tua
      { wch: 20 }, // WhatsApp
      { wch: 25 }, // Email
      { wch: 50 }, // Buku yang Dipesan
      { wch: 18 }  // Total Harga
    ];
    ws['!cols'] = wscols;

    xlsx.utils.book_append_sheet(wb, ws, sheetTitle);
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=daftar_pesanan_buku_${division}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengekspor data pesanan.' });
  }
});

// Helper to format phone number to standard +62...
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+62')) return cleaned;
  if (cleaned.startsWith('62')) return '+' + cleaned;
  if (cleaned.startsWith('0')) return '+62' + cleaned.slice(1);
  if (cleaned.startsWith('+')) return cleaned;
  return '+62' + cleaned;
}

// GET export invoice to Excel
app.get('/api/admin/orders/export-invoice', authenticateAdmin, async (req, res) => {
  const division = req.admin.division || 'mumtaz';
  try {
    const orders = await dbQuery.all('SELECT * FROM orders WHERE division = ? ORDER BY id ASC', [division]);

    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');

    const excelData = orders.map((order, index) => {
      const orderDate = order.created_at ? new Date(order.created_at) : new Date();
      const validDate = isNaN(orderDate.getTime()) ? new Date() : orderDate;
      const tahunPemesanan = validDate.getFullYear();

      const waktuBerlaku = `${pad2(validDate.getDate())}/${pad2(validDate.getMonth() + 1)}/${validDate.getFullYear()}`;
      
      const dueDate = new Date(validDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      const waktuJatuhTempo = `${pad2(dueDate.getDate())}/${pad2(dueDate.getMonth() + 1)}/${dueDate.getFullYear()}`;

      const urutan = pad3(index + 1);
      const vaNumber = order.va_number ? String(order.va_number).trim() : '';
      const nomorInvoice = `BUKU-${tahunPemesanan}-${vaNumber}-${urutan}`;

      const totalPrice = Number(order.total_price) || 0;

      return {
        nomor_invoice: nomorInvoice,
        nomor_pembayaran: vaNumber,
        id_pelanggan: vaNumber,
        nama: order.student_name || '',
        waktu_berlaku: waktuBerlaku,
        waktu_jatuh_tempo: waktuJatuhTempo,
        waktu_jatuh_kedaluwarsa: '',
        info_kelas: order.class_name ? String(order.class_name) : '',
        rincian_Buku: totalPrice,
        rincian_Buku2: 0,
        total_nominal: totalPrice,
        email: order.parent_email || '',
        nomor_hp: formatPhoneNumber(order.parent_whatsapp),
        catatan: `Buku ${tahunPemesanan}`,
        status_tagihan: 'Menunggu Pembayaran',
        action_tagihan_jatuh_tempo: 'Menunggu Pembayaran',
        action_tagihan_jatuh_kedaluwarsa: ''
      };
    });

    const headers = [
      'nomor_invoice',
      'nomor_pembayaran',
      'id_pelanggan',
      'nama',
      'waktu_berlaku',
      'waktu_jatuh_tempo',
      'waktu_jatuh_kedaluwarsa',
      'info_kelas',
      'rincian_Buku',
      'rincian_Buku2',
      'total_nominal',
      'email',
      'nomor_hp',
      'catatan',
      'status_tagihan',
      'action_tagihan_jatuh_tempo',
      'action_tagihan_jatuh_kedaluwarsa'
    ];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(excelData, { header: headers });

    // Set column widths
    ws['!cols'] = [
      { wch: 28 }, // nomor_invoice
      { wch: 20 }, // nomor_pembayaran
      { wch: 20 }, // id_pelanggan
      { wch: 26 }, // nama
      { wch: 16 }, // waktu_berlaku
      { wch: 18 }, // waktu_jatuh_tempo
      { wch: 24 }, // waktu_jatuh_kedaluwarsa
      { wch: 14 }, // info_kelas
      { wch: 16 }, // rincian_Buku
      { wch: 16 }, // rincian_Buku2
      { wch: 16 }, // total_nominal
      { wch: 28 }, // email
      { wch: 20 }, // nomor_hp
      { wch: 16 }, // catatan
      { wch: 24 }, // status_tagihan
      { wch: 28 }, // action_tagihan_jatuh_tempo
      { wch: 30 }  // action_tagihan_jatuh_kedaluwarsa
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Invoice Pesanan Buku');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const exportDateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_pesanan_${division}_${exportDateStr}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export invoice error:', error);
    res.status(500).json({ message: 'Gagal mengekspor data invoice.' });
  }
});

// GET export recap per class (Matrix format: Student x Books)
app.get('/api/admin/orders/export-recap', authenticateAdmin, async (req, res) => {
  const { kelas } = req.query; // 'all' or specific class e.g. '8'
  const division = req.admin.division || 'mumtaz';

  try {
    const defaultClasses = division === 'sd' 
      ? ['1', '2', '3', '4', '5', '6'] 
      : ['7', '8', '9', '10', '11', '12'];
    const classesToExport = kelas && kelas !== 'all' ? [kelas] : defaultClasses;
    const wb = xlsx.utils.book_new();

    for (const cls of classesToExport) {
      // 1. Fetch books in this class
      const books = await dbQuery.all('SELECT id, name, price FROM books WHERE division = ? AND kelas = ? ORDER BY name ASC', [division, cls]);
      if (books.length === 0) {
        // If there are no books, write an informative sheet
        const emptyWs = xlsx.utils.json_to_sheet([{ 'Nama Siswa': 'Belum ada daftar buku di kelas ini' }]);
        xlsx.utils.book_append_sheet(wb, emptyWs, `Kelas ${cls}`);
        continue;
      }

      // 2. Fetch orders in this class
      const orders = await dbQuery.all('SELECT student_name, book_details FROM orders WHERE division = ? AND class_name = ? ORDER BY student_name ASC', [division, cls]);

      // 3. Construct rows
      const headers = ['Nama Siswa', ...books.map(b => b.name)];
      const sheetData = [];

      if (orders.length === 0) {
        // Empty state: list the header and a placeholder student
        const dummyRow = { 'Nama Siswa': 'Belum ada pesanan' };
        books.forEach(b => {
          dummyRow[b.name] = 0;
        });
        sheetData.push(dummyRow);
      } else {
        orders.forEach(order => {
          let orderedBooks = [];
          try {
            orderedBooks = JSON.parse(order.book_details);
          } catch (e) {
            orderedBooks = [];
          }

          const row = { 'Nama Siswa': order.student_name };
          
          books.forEach(book => {
            // Match order book by name (case-insensitive & trimmed to be safe)
            const isOrdered = orderedBooks.some(ob => ob.name.trim().toLowerCase() === book.name.trim().toLowerCase());
            row[book.name] = isOrdered ? book.price : 0;
          });

          sheetData.push(row);
        });
      }

      const ws = xlsx.utils.json_to_sheet(sheetData, { header: headers });
      
      // Auto-fit columns
      const wscols = [{ wch: 25 }]; // Nama Siswa
      books.forEach(b => {
        wscols.push({ wch: Math.max(b.name.length + 3, 14) });
      });
      ws['!cols'] = wscols;

      xlsx.utils.book_append_sheet(wb, ws, `Kelas ${cls}`);
    }

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = kelas && kelas !== 'all' ? `rekap_pesanan_${division}_kelas_${kelas}.xlsx` : `rekap_pesanan_buku_${division}_per_kelas.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengekspor rekap per kelas.' });
  }
});

// ----------------------------------------------------
// PUBLIC ORDER INVOICE & QRIS IMAGE ENDPOINTS
// ----------------------------------------------------

// GET public order invoice detail (requires valid invoice token)
app.get('/api/orders/:id/invoice', async (req, res) => {
  const { id } = req.params;
  const token = req.query.t;

  if (!token) {
    return res.status(403).json({ message: 'Akses ditolak: token invoice diperlukan.' });
  }

  try {
    const order = await dbQuery.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
    }

    if (!verifyOrderToken(order, token)) {
      return res.status(403).json({ message: 'Akses ditolak: token invoice tidak valid atau kedaluwarsa.' });
    }

    let books = [];
    try {
      books = typeof order.book_details === 'string' ? JSON.parse(order.book_details) : (order.book_details || []);
    } catch (e) {
      books = [];
    }

    const divMeta = getDivisionMeta(order.division);
    const orderCode = `${divMeta.prefix}-${String(order.id).padStart(4, '0')}`;
    const staticQris = await getDivisionStaticQris(order.division);

    let qrisConfigured = false;
    let merchantName = null;
    let qrisDataUrl = null;
    let dynamicQrisString = null;

    if (staticQris && Number(order.total_price) > 0) {
      const qrisVal = validateQRIS(staticQris);
      if (qrisVal.valid) {
        try {
          const dynamicResult = convertToDynamic(staticQris, { amount: Number(order.total_price) });
          qrisConfigured = true;
          merchantName = dynamicResult.merchantName;
          dynamicQrisString = dynamicResult.dynamicQris;
          qrisDataUrl = await QRCode.toDataURL(dynamicResult.dynamicQris, { width: 420, margin: 2 });
        } catch (err) {
          console.error('Error generating dynamic QRIS for invoice:', err);
        }
      }
    }

    res.json({
      id: order.id,
      order_code: orderCode,
      division: order.division,
      division_name: divMeta.name,
      wa_admin: divMeta.waAdmin,
      student_name: order.student_name,
      class_name: order.class_name,
      va_number: order.va_number,
      parent_name: order.parent_name,
      parent_whatsapp: order.parent_whatsapp,
      parent_email: order.parent_email,
      total_price: Number(order.total_price),
      created_at: order.created_at,
      books: books,
      qris_configured: qrisConfigured,
      merchant_name: merchantName,
      qris_data_url: qrisDataUrl,
      dynamic_qris: dynamicQrisString,
      qris_image_url: qrisConfigured ? `/api/orders/${order.id}/qris.png?t=${token}` : null,
      poster_image_url: qrisConfigured ? `/api/orders/${order.id}/poster.png?t=${token}` : null
    });
  } catch (error) {
    console.error('Error fetching order invoice:', error);
    res.status(500).json({ message: 'Gagal mengambil data tagihan pesanan.' });
  }
});

// GET dynamic QRIS PNG image (requires valid invoice token)
app.get('/api/orders/:id/qris.png', async (req, res) => {
  const { id } = req.params;
  const token = req.query.t;

  if (!token) {
    return res.status(403).json({ message: 'Akses ditolak: token invoice diperlukan.' });
  }

  try {
    const order = await dbQuery.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
    }

    if (!verifyOrderToken(order, token)) {
      return res.status(403).json({ message: 'Akses ditolak: token invoice tidak valid atau kedaluwarsa.' });
    }

    const staticQris = await getDivisionStaticQris(order.division);
    if (!staticQris) {
      return res.status(404).json({ message: 'QRIS untuk divisi ini belum dikonfigurasi.' });
    }

    const amount = Number(order.total_price);
    if (amount <= 0) {
      return res.status(400).json({ message: 'Total tagihan Rp 0, QRIS tidak diperlukan.' });
    }

    const dynamicResult = convertToDynamic(staticQris, { amount });
    const pngBuffer = await QRCode.toBuffer(dynamicResult.dynamicQris, {
      type: 'png',
      width: 480,
      margin: 2
    });

    const divMeta = getDivisionMeta(order.division);
    const filename = `QRIS-${divMeta.prefix}-${String(order.id).padStart(4, '0')}.png`;

    res.setHeader('Content-Type', 'image/png');
    if (req.query.download === '1' || req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Error generating dynamic QRIS image:', error);
    res.status(500).json({ message: 'Gagal menghasilkan gambar QRIS: ' + error.message });
  }
});

// GET dynamic QRIS official poster image (PNG format, requires valid invoice token)
app.get('/api/orders/:id/poster.png', async (req, res) => {
  const { id } = req.params;
  const token = req.query.t;

  if (!token) {
    return res.status(403).json({ message: 'Akses ditolak: token invoice diperlukan.' });
  }

  try {
    const order = await dbQuery.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan.' });
    }

    if (!verifyOrderToken(order, token)) {
      return res.status(403).json({ message: 'Akses ditolak: token invoice tidak valid atau kedaluwarsa.' });
    }

    const staticQris = await getDivisionStaticQris(order.division);
    if (!staticQris) {
      return res.status(404).json({ message: 'QRIS untuk divisi ini belum dikonfigurasi.' });
    }

    const amount = Number(order.total_price);
    if (amount <= 0) {
      return res.status(400).json({ message: 'Total tagihan Rp 0, QRIS tidak diperlukan.' });
    }

    const dynamicResult = convertToDynamic(staticQris, { amount });
    const posterBuffer = await generateQRISPosterBuffer(dynamicResult.dynamicQris);

    const divMeta = getDivisionMeta(order.division);
    const filename = `Poster-QRIS-${divMeta.prefix}-${String(order.id).padStart(4, '0')}.png`;

    res.setHeader('Content-Type', 'image/png');
    if (req.query.download === '1' || req.query.download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(posterBuffer);
  } catch (error) {
    console.error('Error generating dynamic QRIS poster:', error);
    res.status(500).json({ message: 'Gagal menghasilkan poster QRIS: ' + error.message });
  }
});

// Catch-all route to serve index.html for undefined routes (excluding api)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const isVercel = !!process.env.VERCEL;

// Initialize DB and start server (or export for serverless environment)
initDatabase().then(() => {
  if (!isVercel) {
    app.listen(PORT, () => {
      console.log(`Server Sekolah Islam Mumtaz berjalan di http://localhost:${PORT}`);
    });
  } else {
    console.log('Database initialized successfully in Serverless mode (Vercel).');
  }
}).catch(err => {
  console.error('Gagal menginisialisasi database:', err);
  if (!isVercel) {
    process.exit(1);
  }
});

module.exports = app;
