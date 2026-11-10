/**
 * order.js - Logic Pemesanan Buku Multi-Divisi
 * Digunakan oleh pesan-sd.html, pesan-smp-sma.html, dan pesan-mumtaz.html
 */

// Konfigurasi Divisi dari HTML data attributes atau window.ORDER_CONFIG
const CONFIG = window.ORDER_CONFIG || {
  division: document.body.dataset.division || 'mumtaz',
  divisionName: document.body.dataset.divisionName || 'Sekolah Islam Mumtaz',
  waTarget: document.body.dataset.waTarget || '628999741234',
  classes: (document.body.dataset.classes || '7,8,9,10,11,12').split(',')
};

// State Aplikasi
let loadedBooks = [];
let selectedBookIds = new Set();
let totalPrice = 0;
let currentClassStudents = [];

// DOM Elements
const studentClassSelect = document.getElementById('student-class');
const studentNameSelect = document.getElementById('student-name-select');
const vaNumberInput = document.getElementById('va-number');
const parentWhatsappInput = document.getElementById('parent-whatsapp');
const parentEmailInput = document.getElementById('parent-email');
const booksSection = document.getElementById('books-section');
const booksListContainer = document.getElementById('books-list');
const bottomBar = document.getElementById('bottom-bar');
const priceTotalEl = document.getElementById('price-total');
const successModal = document.getElementById('success-modal');
const whatsappBtn = document.getElementById('whatsapp-btn');
const toastContainer = document.getElementById('toast-container');

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  initClassDropdown();
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

// Format Rupiah
function formatRupiah(number) {
  return 'Rp ' + Number(number || 0).toLocaleString('id-ID');
}

// Inisialisasi Opsi Kelas sesuai Divisi
function initClassDropdown() {
  if (!studentClassSelect) return;
  // Periksa apakah opsi kelas sudah ada selain placeholder
  if (studentClassSelect.options.length <= 1) {
    studentClassSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas Terlebih Dahulu --</option>';
    CONFIG.classes.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.trim();
      opt.textContent = `Kelas ${cls.trim()}`;
      studentClassSelect.appendChild(opt);
    });
  }
}

// Handle perubahan dropdown Kelas (Langkah 1)
async function handleClassChange(classVal) {
  if (!classVal) return;

  // 1. Reset dropdown Siswa & field VA, WA, Email
  studentNameSelect.innerHTML = '<option value="" disabled selected>Memuat data siswa...</option>';
  studentNameSelect.disabled = true;
  vaNumberInput.value = '';
  parentWhatsappInput.value = '';
  parentEmailInput.value = '';

  // 2. Reset Buku & Total
  selectedBookIds.clear();
  calculateTotal();
  booksSection.style.display = 'block';
  booksListContainer.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Memuat daftar buku...</div>';

  try {
    // 3. Panggil API Siswa dan API Buku secara paralel
    const [studentsRes, booksRes] = await Promise.all([
      fetch(`/api/students/${CONFIG.division}/class/${encodeURIComponent(classVal)}`),
      fetch(`/api/books/${CONFIG.division}/class/${encodeURIComponent(classVal)}`)
    ]);

    // Handle data siswa
    if (studentsRes.ok) {
      currentClassStudents = await studentsRes.json();
      populateStudentDropdown(currentClassStudents);
    } else {
      studentNameSelect.innerHTML = '<option value="" disabled selected>Gagal memuat siswa</option>';
      showToast('Gagal mengambil daftar siswa untuk kelas ini.', 'error');
    }

    // Handle data buku
    if (booksRes.ok) {
      loadedBooks = await booksRes.json();
      renderBooksList();
    } else {
      booksListContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #EF4444;"><i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat daftar buku.</div>';
      showToast('Gagal mengambil daftar buku.', 'error');
    }

  } catch (error) {
    console.error('Error saat memilih kelas:', error);
    studentNameSelect.innerHTML = '<option value="" disabled selected>Gagal koneksi server</option>';
    booksListContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #EF4444;"><i class="fa-solid fa-triangle-exclamation"></i> Koneksi server terganggu.</div>';
    showToast('Terjadi kesalahan saat memuat data.', 'error');
  }
}

// Isi Dropdown Nama Siswa (Langkah 2)
function populateStudentDropdown(students) {
  studentNameSelect.innerHTML = '';
  
  if (!students || students.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = `Belum ada data siswa terdaftar di Kelas ${studentClassSelect.value}`;
    studentNameSelect.appendChild(opt);
    studentNameSelect.disabled = true;
    return;
  }

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.disabled = true;
  defaultOpt.selected = true;
  defaultOpt.textContent = `-- Pilih Nama Lengkap Siswa (${students.length} Siswa) --`;
  studentNameSelect.appendChild(defaultOpt);

  students.forEach(student => {
    const opt = document.createElement('option');
    opt.value = student.name;
    opt.textContent = student.name;
    opt.dataset.va = student.va_number || '';
    opt.dataset.wa = student.whatsapp || '';
    opt.dataset.email = student.email || '';
    studentNameSelect.appendChild(opt);
  });

  studentNameSelect.disabled = false;
}

// Handle saat Nama Siswa dipilih -> Otomatis isi VA, WA, dan Email
function handleStudentSelect(studentName) {
  if (!studentName) {
    vaNumberInput.value = '';
    parentWhatsappInput.value = '';
    parentEmailInput.value = '';
    return;
  }

  const selectedOption = studentNameSelect.options[studentNameSelect.selectedIndex];
  if (selectedOption) {
    vaNumberInput.value = selectedOption.dataset.va || '';
    parentWhatsappInput.value = selectedOption.dataset.wa || '';
    parentEmailInput.value = selectedOption.dataset.email || '';
  }
}

// Render Checklist Buku
function renderBooksList() {
  if (!loadedBooks || loadedBooks.length === 0) {
    booksListContainer.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-muted); background: #F8FAFC; border-radius: var(--border-radius-md); border: 1px dashed #CBD5E1;">
        <i class="fa-solid fa-book-open" style="font-size: 2rem; color: #94A3B8; margin-bottom: 8px;"></i>
        <p style="font-weight: 600;">Belum ada daftar buku untuk Kelas ${studentClassSelect.value}.</p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Silakan hubungi administrator sekolah jika ini keliru.</p>
      </div>
    `;
    return;
  }

  booksListContainer.innerHTML = '';

  loadedBooks.forEach(book => {
    const label = document.createElement('label');
    label.className = 'book-item-label';
    label.id = `book-label-${book.id}`;

    // Checkbox input
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'book-checkbox';
    input.value = book.id;
    input.onchange = (e) => handleBookToggle(e, book.id, label);

    // Custom checkmark
    const checkmark = document.createElement('span');
    checkmark.className = 'custom-checkmark';

    // Details wrapper
    const details = document.createElement('div');
    details.className = 'book-details';

    const name = document.createElement('span');
    name.className = 'book-name';
    name.innerText = book.name;

    const publisher = document.createElement('span');
    publisher.className = 'book-publisher';
    publisher.innerText = `Penerbit: ${book.publisher || CONFIG.divisionName}`;

    details.appendChild(name);
    details.appendChild(publisher);

    // Price
    const price = document.createElement('span');
    price.className = 'book-price';
    price.innerText = formatRupiah(book.price);

    // Append elements
    label.appendChild(input);
    label.appendChild(checkmark);
    label.appendChild(details);
    label.appendChild(price);

    booksListContainer.appendChild(label);
  });
}

// Toggle checklist buku
function handleBookToggle(event, bookId, labelElement) {
  if (event.target.checked) {
    selectedBookIds.add(bookId);
    labelElement.classList.add('selected-row');
  } else {
    selectedBookIds.delete(bookId);
    labelElement.classList.remove('selected-row');
  }
  calculateTotal();
}

// Hitung total harga & perbarui floating bar bawah
function calculateTotal() {
  totalPrice = 0;

  selectedBookIds.forEach(id => {
    const book = loadedBooks.find(b => b.id === id);
    if (book) {
      totalPrice += (book.price || 0);
    }
  });

  priceTotalEl.innerText = formatRupiah(totalPrice);

  if (selectedBookIds.size > 0) {
    bottomBar.classList.add('show');
  } else {
    bottomBar.classList.remove('show');
  }
}

// Handle submit formulir pemesanan
async function handleFormSubmit(event) {
  event.preventDefault();

  const className = studentClassSelect.value.replace(/[^0-9]/g, '');
  const studentName = studentNameSelect.value;
  const vaNumber = vaNumberInput.value.trim();
  const parentWhatsapp = parentWhatsappInput.value.trim();
  const parentEmail = parentEmailInput.value.trim();

  if (!className) {
    showToast('Harap pilih kelas terlebih dahulu.', 'error');
    return;
  }

  if (!studentName) {
    showToast('Harap pilih nama siswa dari daftar.', 'error');
    return;
  }

  if (!vaNumber) {
    showToast('Nomor Virtual Account belum terisi.', 'error');
    return;
  }

  if (selectedBookIds.size === 0) {
    showToast('Harap centang minimal satu buku yang ingin dipesan.', 'error');
    return;
  }

  const orderData = {
    division: CONFIG.division,
    student_name: studentName,
    class_name: className,
    va_number: vaNumber,
    parent_whatsapp: parentWhatsapp,
    parent_email: parentEmail,
    book_ids: Array.from(selectedBookIds),
    total_price: totalPrice
  };

  try {
    showToast('Menyimpan pesanan Anda...', 'success');

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Gagal menyimpan pesanan.');
    }

    // Detail buku terpilih untuk format pesan WA
    const selectedBooks = loadedBooks.filter(b => selectedBookIds.has(b.id));
    const booksListText = selectedBooks.map(b => `- ${b.name} (${formatRupiah(b.price)})`).join('\n');

    // Format Pesan WhatsApp
    const waText = `Assalamu'alaikum. Saya orang tua dari ${studentName} dari Kelas ${className} (${CONFIG.divisionName}) VA no ${vaNumber} dengan email ${parentEmail} mau pesan buku berikut :\n${booksListText}\nTotal: ${formatRupiah(totalPrice)}\nJazakumullahu Khairan`;

    const cleanWaTarget = CONFIG.waTarget.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanWaTarget}?text=${encodeURIComponent(waText)}`;

    // Set tautan tombol WhatsApp di modal
    whatsappBtn.href = waUrl;

    // Reset Form
    document.getElementById('booking-form').reset();
    booksSection.style.display = 'none';
    selectedBookIds.clear();
    calculateTotal();

    // Tampilkan Modal Sukses
    successModal.classList.add('show');

    // Upayakan auto redirect ke WhatsApp
    const waWindow = window.open(waUrl, '_blank');
    if (!waWindow || waWindow.closed || typeof waWindow.closed === 'undefined') {
      showToast('Pesanan tersimpan! Silakan klik tombol untuk membuka WhatsApp.', 'success');
    } else {
      showToast('Pesanan tersimpan, membuka WhatsApp...', 'success');
    }

    whatsappBtn.onclick = () => {
      successModal.classList.remove('show');
    };

  } catch (error) {
    console.error('Error saat menyimpan pesanan:', error);
    showToast(error.message || 'Terjadi kesalahan saat menyimpan pesanan.', 'error');
  }
}
