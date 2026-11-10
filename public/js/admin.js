/**
 * admin.js - Panel Administrator Multi-Divisi
 * Mendukung SD Islam Nazhirah, SMP & SMA Islam Nazhirah, dan Sekolah Islam Mumtaz
 */

// Konfigurasi Metadata Divisi
const DIVISION_METADATA = {
  sd: {
    name: 'SD Islam Nazhirah',
    logo: '/images/sd.png',
    classes: ['1', '2', '3', '4', '5', '6'],
    prefix: 'SD'
  },
  smp_sma: {
    name: 'SMP & SMA Islam Nazhirah',
    logo: '/images/nz.png',
    classes: ['7', '8', '9', '10', '11', '12'],
    prefix: 'NZ'
  },
  mumtaz: {
    name: 'Sekolah Islam Mumtaz',
    logo: '/images/logo.png',
    classes: ['7', '8', '9', '10', '11', '12'],
    prefix: 'MUMTAZ'
  }
};

// Admin App Variables
let token = localStorage.getItem('admin_token') || localStorage.getItem('mumtaz_admin_token') || '';
let activeDivision = localStorage.getItem('admin_division') || 'mumtaz';
let allOrders = [];
let allBooks = [];
let allStudents = [];

// Elements
const authOverlay = document.getElementById('auth-overlay');
const adminDashboard = document.getElementById('admin-dashboard');
const ordersTableBody = document.getElementById('orders-table-body');
const booksTableBody = document.getElementById('books-table-body');
const toastContainer = document.getElementById('toast-container');

// Modals & Inputs
const editBookModal = document.getElementById('edit-book-modal');
const editOrderModal = document.getElementById('edit-order-modal');
const changePasswordModal = document.getElementById('change-password-modal');

// Init Check saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
  // Sync dropdown login dengan activeDivision yang tersimpan
  const loginDivSelect = document.getElementById('login-division');
  if (loginDivSelect) {
    loginDivSelect.value = activeDivision;
    handleLoginDivisionChange(activeDivision);
  }

  if (token) {
    checkTokenValidity();
  } else {
    showLoginScreen();
  }
});

// Toast Helper
function showToast(message, type = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = document.createElement('i');
  icon.className = `toast-icon fa-solid ${type === 'success' ? 'fa-circle-check success' : 'fa-circle-exclamation error'}`;
  
  const text = document.createElement('span');
  text.innerText = message;
  
  toast.appendChild(icon);
  toast.appendChild(text);
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// Format Currency
function formatRupiah(number) {
  return 'Rp ' + Number(number || 0).toLocaleString('id-ID');
}

// Format ISO Date
function formatDate(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Toggle password view
function togglePasswordVisibility() {
  const passwordInput = document.getElementById('admin-password');
  const eyeIcon = document.getElementById('eye-icon');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeIcon.classList.remove('fa-eye');
    eyeIcon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    eyeIcon.classList.remove('fa-eye-slash');
    eyeIcon.classList.add('fa-eye');
  }
}

// Handle perubahan dropdown divisi pada form login
function handleLoginDivisionChange(div) {
  const meta = DIVISION_METADATA[div] || DIVISION_METADATA.mumtaz;
  const logoEl = document.getElementById('auth-school-logo');
  const titleEl = document.getElementById('auth-school-title');
  if (logoEl) logoEl.src = meta.logo;
  if (titleEl) titleEl.innerText = meta.name;
}

// Update UI & Dropdown Kelas sesuai divisi aktif
function updateDivisionUI(division) {
  const meta = DIVISION_METADATA[division] || DIVISION_METADATA.mumtaz;

  // 1. Update Navbar
  const navTitle = document.getElementById('admin-navbar-title');
  const navLogo = document.getElementById('admin-navbar-logo');
  if (navTitle) navTitle.innerText = meta.name;
  if (navLogo) navLogo.src = meta.logo;

  // 2. Update Label Kelas
  const labelBookClass = document.getElementById('label-book-class');
  if (labelBookClass) {
    labelBookClass.innerText = `Kelas (${meta.classes[0]} - ${meta.classes[meta.classes.length - 1]})`;
  }

  // 3. Update Modal Ubah Password Title
  const changePassTitle = document.getElementById('change-password-title');
  if (changePassTitle) {
    changePassTitle.innerHTML = `<i class="fa-solid fa-key"></i> Ubah Password Admin (${meta.name})`;
  }

  // Helper untuk mengisi dropdown kelas
  const fillDropdown = (elId, includeAll = false, defaultText = 'Pilih kelas...') => {
    const select = document.getElementById(elId);
    if (!select) return;
    select.innerHTML = '';
    if (includeAll) {
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = 'Semua Kelas';
      select.appendChild(optAll);
    } else {
      const optDef = document.createElement('option');
      optDef.value = '';
      optDef.disabled = true;
      optDef.selected = true;
      optDef.textContent = defaultText;
      select.appendChild(optDef);
    }

    meta.classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = `Kelas ${c}`;
      select.appendChild(opt);
    });
  };

  // Isi semua dropdown kelas di dashboard
  fillDropdown('recap-class-select', true);
  fillDropdown('book-class', false, 'Pilih...');
  fillDropdown('import-class', false, 'Pilih kelas...');
  fillDropdown('clear-class', false, 'Pilih kelas...');
  fillDropdown('filter-class', true);
  fillDropdown('filter-student-class', true);
  fillDropdown('edit-book-class', false, 'Pilih kelas...');
  fillDropdown('edit-order-class', false, 'Pilih kelas...');
}

// API Fetch wrapper dengan Bearer Token
async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${token}`;
  
  try {
    const response = await fetch(url, options);
    
    // Sesi kedaluwarsa
    if (response.status === 401 || response.status === 403) {
      handleLogout();
      showToast('Sesi Anda telah berakhir. Silakan masuk kembali.', 'error');
      throw new Error('Sesi berakhir');
    }
    
    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// Verifikasi Validitas Token ke Server
async function checkTokenValidity() {
  try {
    const response = await apiFetch('/api/admin/check');
    if (response.ok) {
      const data = await response.json();
      activeDivision = data.division || activeDivision || 'mumtaz';
      localStorage.setItem('admin_division', activeDivision);
      showDashboard();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    showLoginScreen();
  }
}

function showLoginScreen() {
  authOverlay.style.opacity = '1';
  authOverlay.style.pointerEvents = 'auto';
  adminDashboard.style.display = 'none';
}

function showDashboard() {
  authOverlay.style.opacity = '0';
  authOverlay.style.pointerEvents = 'none';
  adminDashboard.style.display = 'block';
  
  // Perbarui UI dan dropdown untuk divisi aktif
  updateDivisionUI(activeDivision);

  // Load data untuk divisi aktif
  loadOrders();
  loadBooks();
}

// Handle Login Form Submission
async function handleLogin(event) {
  event.preventDefault();
  const division = document.getElementById('login-division').value;
  const password = document.getElementById('admin-password').value;
  
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ division, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      token = data.token;
      activeDivision = data.division || division;
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_division', activeDivision);
      localStorage.setItem('mumtaz_admin_token', token); // compatibility
      document.getElementById('admin-password').value = '';
      
      const meta = DIVISION_METADATA[activeDivision] || DIVISION_METADATA.mumtaz;
      showToast(`Selamat datang, Administrator ${meta.name}!`, 'success');
      showDashboard();
    } else {
      showToast(data.message || 'Gagal masuk.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// Ganti Divisi
function handleSwitchDivision() {
  token = '';
  localStorage.removeItem('admin_token');
  localStorage.removeItem('mumtaz_admin_token');
  showLoginScreen();
  showToast('Silakan pilih divisi sekolah untuk masuk.', 'success');
}

// Logout
function handleLogout() {
  token = '';
  localStorage.removeItem('admin_token');
  localStorage.removeItem('mumtaz_admin_token');
  showLoginScreen();
}

// Tabs Manager
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  if (tabName === 'orders') {
    document.getElementById('tab-orders-btn').classList.add('active');
    document.getElementById('tab-orders').classList.add('active');
    loadOrders();
  } else if (tabName === 'books') {
    document.getElementById('tab-books-btn').classList.add('active');
    document.getElementById('tab-books').classList.add('active');
    loadBooks();
  } else if (tabName === 'students') {
    document.getElementById('tab-students-btn').classList.add('active');
    document.getElementById('tab-students').classList.add('active');
    loadStudents();
  }
}

// ----------------------------------------------------
// ORDERS OPERATIONS
// ----------------------------------------------------
async function loadOrders() {
  ordersTableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat data pesanan...</td></tr>';
  
  try {
    const response = await apiFetch('/api/admin/orders');
    if (!response.ok) throw new Error();
    
    allOrders = await response.json();
    renderOrdersTable();
  } catch (error) {
    showToast('Gagal memuat data pesanan.', 'error');
  }
}

function renderOrdersTable() {
  if (allOrders.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">
          Belum ada pesanan buku yang masuk untuk divisi ini.
        </td>
      </tr>
    `;
    return;
  }
  
  ordersTableBody.innerHTML = '';
  const prefix = (DIVISION_METADATA[activeDivision] ? DIVISION_METADATA[activeDivision].prefix : 'ORDER');
  
  allOrders.forEach((order, index) => {
    const tr = document.createElement('tr');
    
    // Books list rendering
    const booksListStr = (order.book_details || []).map(b => 
      `<div style="margin-bottom: 4px; font-weight: 500;">
        • ${b.name} (${formatRupiah(b.price)})
       </div>`
    ).join('');

    const formattedOrderId = `${prefix}-${order.id.toString().padStart(4, '0')}`;
    const cleanWa = (order.parent_whatsapp || '').replace(/[^0-9]/g, '');

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td style="font-weight: 700; color: var(--primary-navy); white-space: nowrap;">${formattedOrderId}</td>
      <td style="white-space: nowrap;">${formatDate(order.created_at)}</td>
      <td style="font-weight: 600;">${order.student_name}</td>
      <td><span class="badge-class">Kelas ${order.class_name}</span></td>
      <td style="font-family: monospace; font-size: 0.85rem;">${order.va_number}</td>
      <td>
        ${cleanWa ? `
          <a href="https://wa.me/${cleanWa}" target="_blank" style="color: #25D366; font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
            <i class="fa-brands fa-whatsapp"></i> ${order.parent_whatsapp}
          </a>
        ` : '<span style="color: var(--text-muted); font-size: 0.8rem;">-</span>'}
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${order.parent_email || '-'}</div>
      </td>
      <td>${booksListStr || '<span style="color: var(--text-muted);">-</span>'}</td>
      <td style="font-weight: 800; color: var(--primary-navy-dark); white-space: nowrap;">${formatRupiah(order.total_price)}</td>
      <td>
        <div class="actions-flex">
          <button onclick="openEditOrderModal(${order.id})" class="btn-sm-edit" title="Ubah"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteOrder(${order.id})" class="btn-sm-delete" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    
    ordersTableBody.appendChild(tr);
  });
}

// Edit Order
let editingOrderBooks = [];
function openEditOrderModal(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;
  
  document.getElementById('edit-order-id').value = order.id;
  document.getElementById('edit-order-student').value = order.student_name;
  document.getElementById('edit-order-class').value = order.class_name;
  document.getElementById('edit-order-va').value = order.va_number;
  document.getElementById('edit-order-parent').value = order.parent_name || '';
  document.getElementById('edit-order-whatsapp').value = order.parent_whatsapp;
  document.getElementById('edit-order-email').value = order.parent_email;
  document.getElementById('edit-order-total').value = order.total_price;
  
  editingOrderBooks = [...(order.book_details || [])];
  renderEditingOrderBooks();
  
  editOrderModal.classList.add('show');
}

function renderEditingOrderBooks() {
  const container = document.getElementById('edit-order-books-container');
  container.innerHTML = '';
  
  if (editingOrderBooks.length === 0) {
    container.innerHTML = '<span style="color: #EF4444; font-size: 0.85rem; font-weight: 600;">Tidak ada buku terpilih.</span>';
    return;
  }
  
  editingOrderBooks.forEach((book, index) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.backgroundColor = '#FFF';
    item.style.padding = '8px 12px';
    item.style.borderRadius = '4px';
    item.style.border = '1px solid #E2E8F0';
    
    item.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        <span style="font-size: 0.85rem; font-weight: 600;">${book.name}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">${book.publisher || ''}</span>
      </div>
      <div style="display:flex; align-items:center; gap: 8px;">
        <span style="font-size: 0.85rem; font-weight:700;">${formatRupiah(book.price)}</span>
        <button type="button" onclick="removeBookFromEditingOrder(${index})" style="background:none; border:none; color:#EF4444; cursor:pointer;" title="Hapus Buku dari Pesanan">
          <i class="fa-solid fa-circle-minus"></i>
        </button>
      </div>
    `;
    
    container.appendChild(item);
  });
}

function removeBookFromEditingOrder(index) {
  editingOrderBooks.splice(index, 1);
  renderEditingOrderBooks();
  
  const newTotal = editingOrderBooks.reduce((sum, b) => sum + (b.price || 0), 0);
  document.getElementById('edit-order-total').value = newTotal;
}

function closeEditOrderModal() {
  editOrderModal.classList.remove('show');
}

async function handleUpdateOrder(event) {
  event.preventDefault();
  
  const id = document.getElementById('edit-order-id').value;
  const orderData = {
    student_name: document.getElementById('edit-order-student').value.trim(),
    class_name: document.getElementById('edit-order-class').value,
    va_number: document.getElementById('edit-order-va').value.trim(),
    parent_name: document.getElementById('edit-order-parent').value.trim(),
    parent_whatsapp: document.getElementById('edit-order-whatsapp').value.trim(),
    parent_email: document.getElementById('edit-order-email').value.trim(),
    book_details: editingOrderBooks,
    total_price: parseInt(document.getElementById('edit-order-total').value) || 0
  };
  
  try {
    const response = await apiFetch(`/api/admin/orders/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      closeEditOrderModal();
      loadOrders();
    } else {
      showToast(resData.message || 'Gagal mengubah pesanan.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

async function deleteOrder(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus data pemesanan ini secara permanen?')) return;
  
  try {
    const response = await apiFetch(`/api/admin/orders/${id}`, {
      method: 'DELETE'
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      loadOrders();
    } else {
      showToast(resData.message || 'Gagal menghapus pesanan.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// Export to Excel
async function exportOrdersToExcel() {
  try {
    showToast('Menyiapkan file ekspor Excel...', 'success');
    const response = await apiFetch('/api/admin/orders/export');
    if (!response.ok) throw new Error('Ekspor gagal');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar_pesanan_buku_${activeDivision}_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('File Excel berhasil diunduh.', 'success');
  } catch (error) {
    showToast('Gagal mengekspor data ke Excel.', 'error');
  }
}

// Export Invoice to Excel
async function exportInvoiceToExcel() {
  try {
    showToast('Menyiapkan file invoice Excel...', 'success');
    const response = await apiFetch('/api/admin/orders/export-invoice');
    if (!response.ok) throw new Error('Ekspor invoice gagal');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_pesanan_${activeDivision}_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('File invoice Excel berhasil diunduh.', 'success');
  } catch (error) {
    showToast('Gagal mengekspor data invoice ke Excel.', 'error');
  }
}

// Export Recap per Class to Excel
async function exportRecapToExcel() {
  const classVal = document.getElementById('recap-class-select').value;
  try {
    showToast('Menyiapkan file rekap kelas...', 'success');
    const response = await apiFetch(`/api/admin/orders/export-recap?kelas=${encodeURIComponent(classVal)}`);
    if (!response.ok) throw new Error('Ekspor rekap gagal');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const filename = classVal === 'all' 
      ? `rekap_pesanan_buku_${activeDivision}_semua_kelas.xlsx` 
      : `rekap_pesanan_${activeDivision}_kelas_${classVal}.xlsx`;
      
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('File rekap berhasil diunduh.', 'success');
  } catch (error) {
    showToast('Gagal mengekspor rekap ke Excel.', 'error');
  }
}

// ----------------------------------------------------
// BOOKS OPERATIONS
// ----------------------------------------------------
async function loadBooks() {
  booksTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat daftar buku...</td></tr>';
  
  try {
    const response = await apiFetch('/api/admin/books');
    if (!response.ok) throw new Error();
    
    allBooks = await response.json();
    renderBooksTable(allBooks);
  } catch (error) {
    showToast('Gagal mengambil daftar buku.', 'error');
  }
}

function renderBooksTable(booksArray) {
  if (booksArray.length === 0) {
    booksTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
          Belum ada buku yang terdaftar untuk divisi ini.
        </td>
      </tr>
    `;
    return;
  }
  
  booksTableBody.innerHTML = '';
  
  booksArray.forEach((book, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><span class="badge-class">Kelas ${book.kelas}</span></td>
      <td style="font-weight: 600;">${book.name}</td>
      <td>${book.publisher}</td>
      <td style="font-weight: 700; color: var(--primary-navy); white-space: nowrap;">${formatRupiah(book.price)}</td>
      <td>
        <div class="actions-flex">
          <button onclick="openEditBookModal(${book.id})" class="btn-sm-edit" title="Ubah"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteBook(${book.id})" class="btn-sm-delete" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    booksTableBody.appendChild(tr);
  });
}

function filterBooksTable() {
  const searchVal = document.getElementById('search-book').value.toLowerCase().trim();
  const classVal = document.getElementById('filter-class').value;
  
  let filtered = allBooks;
  
  if (classVal !== 'all') {
    filtered = filtered.filter(b => b.kelas.toString() === classVal);
  }
  
  if (searchVal) {
    filtered = filtered.filter(b => 
      b.name.toLowerCase().includes(searchVal) || 
      (b.publisher && b.publisher.toLowerCase().includes(searchVal))
    );
  }
  
  renderBooksTable(filtered);
}

// Add Book Manual
async function handleAddBook(event) {
  event.preventDefault();
  
  const bookData = {
    name: document.getElementById('book-title').value.trim(),
    publisher: document.getElementById('book-publisher').value.trim(),
    kelas: document.getElementById('book-class').value,
    price: parseInt(document.getElementById('book-price').value) || 0
  };
  
  try {
    const response = await apiFetch('/api/admin/books', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookData)
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      document.getElementById('add-book-form').reset();
      loadBooks();
    } else {
      showToast(resData.message || 'Gagal menambahkan buku.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// Edit Book
function openEditBookModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;
  
  document.getElementById('edit-book-id').value = book.id;
  document.getElementById('edit-book-title').value = book.name;
  document.getElementById('edit-book-publisher').value = book.publisher;
  document.getElementById('edit-book-class').value = book.kelas;
  document.getElementById('edit-book-price').value = book.price;
  
  editBookModal.classList.add('show');
}

function closeEditBookModal() {
  editBookModal.classList.remove('show');
}

async function handleUpdateBook(event) {
  event.preventDefault();
  
  const id = document.getElementById('edit-book-id').value;
  const bookData = {
    name: document.getElementById('edit-book-title').value.trim(),
    publisher: document.getElementById('edit-book-publisher').value.trim(),
    kelas: document.getElementById('edit-book-class').value,
    price: parseInt(document.getElementById('edit-book-price').value) || 0
  };
  
  try {
    const response = await apiFetch(`/api/admin/books/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookData)
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      closeEditBookModal();
      loadBooks();
    } else {
      showToast(resData.message || 'Gagal mengubah buku.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

async function deleteBook(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus buku ini dari daftar?')) return;
  
  try {
    const response = await apiFetch(`/api/admin/books/${id}`, {
      method: 'DELETE'
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      loadBooks();
    } else {
      showToast(resData.message || 'Gagal menghapus buku.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// Bulk Clear books by class
async function clearBooksByClass() {
  const classVal = document.getElementById('clear-class').value;
  if (!classVal) {
    showToast('Silakan pilih kelas terlebih dahulu.', 'error');
    return;
  }
  
  if (!confirm(`PERINGATAN! Apakah Anda yakin ingin menghapus SEMUA daftar buku untuk Kelas ${classVal} di divisi ini?\nTindakan ini tidak dapat dibatalkan.`)) return;
  
  try {
    const response = await apiFetch(`/api/admin/books/class/${encodeURIComponent(classVal)}`, {
      method: 'DELETE'
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      document.getElementById('clear-class').value = '';
      loadBooks();
    } else {
      showToast(resData.message || 'Gagal menghapus daftar buku.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// Import books from Excel
async function handleImportBooks(event) {
  event.preventDefault();
  
  const fileInput = document.getElementById('import-file');
  const classVal = document.getElementById('import-class').value;
  
  if (fileInput.files.length === 0) {
    showToast('Pilih file Excel atau CSV terlebih dahulu.', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('kelas', classVal);
  
  try {
    showToast('Mengunggah & memproses file...', 'success');
    
    const response = await apiFetch('/api/admin/books/import', {
      method: 'POST',
      body: formData
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      document.getElementById('import-book-form').reset();
      loadBooks();
    } else {
      showToast(resData.message || 'Gagal mengimpor buku.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server atau format file tidak sesuai.', 'error');
  }
}

// ----------------------------------------------------
// PASSWORD MANAGEMENT
// ----------------------------------------------------
function openChangePasswordModal() {
  document.getElementById('change-password-form').reset();
  changePasswordModal.classList.add('show');
}

function closeChangePasswordModal() {
  changePasswordModal.classList.remove('show');
}

async function handleChangePassword(event) {
  event.preventDefault();
  
  const newPass = document.getElementById('new-admin-password').value;
  const newPassConfirm = document.getElementById('new-admin-password-confirm').value;
  
  if (newPass !== newPassConfirm) {
    showToast('Konfirmasi password baru tidak cocok.', 'error');
    return;
  }
  
  try {
    const response = await apiFetch('/api/admin/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ new_password: newPass })
    });
    
    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      closeChangePasswordModal();
    } else {
      showToast(resData.message || 'Gagal mengubah password.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

// ----------------------------------------------------
// STUDENTS MANAGEMENT
// ----------------------------------------------------
async function loadStudents() {
  const tableBody = document.getElementById('students-table-body');
  tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat data siswa...</td></tr>';

  try {
    const response = await apiFetch('/api/admin/students');
    if (!response.ok) throw new Error();
    
    allStudents = await response.json();
    renderStudentsTable();
  } catch (error) {
    showToast('Gagal memuat data siswa.', 'error');
  }
}

function renderStudentsTable(data = allStudents) {
  const tableBody = document.getElementById('students-table-body');
  if (data.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Belum ada data siswa terdaftar di divisi ini. Silakan impor dari Excel.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  data.forEach((student, index) => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td>${index + 1}</td>
      <td style="font-weight: 700; color: var(--primary-navy);">${student.name}</td>
      <td><span class="badge-class">Kelas ${student.kelas}</span></td>
      <td style="font-family: monospace; font-size: 0.95rem; font-weight: 600;">${student.va_number}</td>
      <td>${student.whatsapp || '<span style="color: var(--text-muted); font-style: italic;">Tidak ada</span>'}</td>
      <td>${student.email || '<span style="color: var(--text-muted); font-style: italic;">Tidak ada</span>'}</td>
      <td>
        <div class="actions-flex">
          <button onclick="deleteStudent(${student.id})" class="btn-sm-delete">
            <i class="fa-solid fa-trash-can"></i> Hapus
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

function filterStudentsTable() {
  const searchQuery = document.getElementById('search-student').value.toLowerCase().trim();
  const classFilter = document.getElementById('filter-student-class').value;

  const filtered = allStudents.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchQuery) || (student.va_number && student.va_number.includes(searchQuery));
    const matchesClass = classFilter === 'all' || student.kelas.toString() === classFilter;
    return matchesSearch && matchesClass;
  });

  renderStudentsTable(filtered);
}

async function deleteStudent(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus data siswa ini?')) return;

  try {
    const response = await apiFetch(`/api/admin/students/${id}`, {
      method: 'DELETE'
    });

    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      loadStudents();
    } else {
      showToast(resData.message || 'Gagal menghapus data siswa.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

async function clearAllStudents() {
  if (!confirm('PENTING: Apakah Anda yakin ingin mengosongkan SELURUH data siswa di divisi ini? Tindakan ini tidak dapat dibatalkan.')) return;

  try {
    const response = await apiFetch('/api/admin/students-clear/all', {
      method: 'DELETE'
    });

    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      loadStudents();
    } else {
      showToast(resData.message || 'Gagal mengosongkan data siswa.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server.', 'error');
  }
}

async function handleImportStudents(event) {
  event.preventDefault();
  const fileInput = document.getElementById('import-students-file');
  if (fileInput.files.length === 0) return;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    showToast('Mengunggah & memproses file data siswa...', 'success');
    
    const response = await apiFetch('/api/admin/students/import', {
      method: 'POST',
      body: formData
    });

    const resData = await response.json();
    if (response.ok) {
      showToast(resData.message, 'success');
      document.getElementById('import-students-form').reset();
      loadStudents();
    } else {
      showToast(resData.message || 'Gagal mengimpor data siswa.', 'error');
    }
  } catch (error) {
    showToast('Terjadi kesalahan koneksi server atau format file tidak sesuai.', 'error');
  }
}
