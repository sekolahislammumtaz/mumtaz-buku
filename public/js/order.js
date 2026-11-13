/**
 * order.js - Logic Pemesanan Buku Multi-Divisi dengan Pencegahan Pesanan Dobel
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
let currentStudentOrderedBooks = []; // Riwayat buku yang sudah dipesan siswa terpilih

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
  ensureDuplicateModal();
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

// Escape HTML untuk mencegah XSS
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format tanggal pesanan Indonesia
function formatOrderDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

// Inisialisasi Opsi Kelas sesuai Divisi
function initClassDropdown() {
  if (!studentClassSelect) return;
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

  // 1. Reset riwayat pesanan siswa, dropdown Siswa & field VA, WA, Email
  currentStudentOrderedBooks = [];
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
      showToast('Gagal memuat data siswa.', 'error');
    }

    // Handle data buku
    if (booksRes.ok) {
      loadedBooks = await booksRes.json();
      renderBooksList();
    } else {
      booksListContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: #EF4444;"><i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat daftar buku.</div>';
      showToast('Gagal memuat data buku.', 'error');
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

// Cek apakah buku tertentu sudah pernah dipesan oleh siswa yang dipilih
function isBookOrdered(book) {
  if (!currentStudentOrderedBooks || currentStudentOrderedBooks.length === 0) return false;
  const targetName = (book.name || '').trim().toLowerCase();
  return currentStudentOrderedBooks.some(ob => {
    if (ob.book_id && Number(ob.book_id) === Number(book.id)) return true;
    if (ob.name && ob.name.trim().toLowerCase() === targetName) return true;
    return false;
  });
}

// Pastikan modal konfirmasi riwayat pesanan tersedia di DOM
function ensureDuplicateModal() {
  let modal = document.getElementById('duplicate-warning-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'duplicate-warning-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px; text-align: left; padding: 28px;">
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px;">
        <div style="background: rgba(245, 158, 11, 0.15); color: #D97706; width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <div>
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--primary-navy); margin: 0;">Riwayat Pesanan Terdeteksi</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;" id="duplicate-modal-student-name">Untuk siswa: -</p>
        </div>
      </div>
      
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--border-radius-md); padding: 14px 16px; margin-bottom: 16px;">
        <p style="font-size: 0.9rem; font-weight: 700; color: var(--text-dark); margin-bottom: 8px;">
          Daftar buku yang telah dipesan sebelumnya:
        </p>
        <ul id="duplicate-books-list" class="duplicate-modal-list">
          <!-- Dynamic items -->
        </ul>
      </div>

      <p style="font-size: 0.88rem; color: #475569; line-height: 1.5; margin-bottom: 20px;">
        Buku di atas sudah tercatat dalam sistem dan tidak dapat dipilih kembali. Anda dapat melanjutkan pemesanan untuk buku lain yang belum dipesan, atau menghubungi admin jika ingin melakukan penyesuaian pesanan.
      </p>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button type="button" id="btn-confirm-duplicate" class="btn-order" style="width: 100%; justify-content: center; padding: 12px; font-size: 0.95rem;">
          <i class="fa-solid fa-check"></i> Lanjutkan Pemilihan Buku
        </button>
        <a href="#" id="duplicate-wa-admin-btn" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 11px; background: #25D366; color: #FFF; font-weight: 600; border-radius: var(--border-radius-sm); text-decoration: none; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);">
          <i class="fa-brands fa-whatsapp" style="font-size: 1.15rem;"></i> Hubungi Admin via WhatsApp
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const confirmBtn = modal.querySelector('#btn-confirm-duplicate');
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      modal.classList.remove('show');
    };
  }

  return modal;
}

// Tampilkan popup/modal konfirmasi jika siswa telah memiliki riwayat pesanan
function showDuplicateModal(studentName, orderedBooks) {
  const modal = ensureDuplicateModal();
  const studentNameEl = modal.querySelector('#duplicate-modal-student-name');
  const booksListEl = modal.querySelector('#duplicate-books-list');
  const waBtnEl = modal.querySelector('#duplicate-wa-admin-btn');
  const confirmBtn = modal.querySelector('#btn-confirm-duplicate');

  if (studentNameEl) {
    const classVal = studentClassSelect ? studentClassSelect.value : '';
    studentNameEl.textContent = `Untuk Siswa: ${studentName}${classVal ? ' (Kelas ' + classVal + ')' : ''}`;
  }

  if (booksListEl) {
    booksListEl.innerHTML = '';
    orderedBooks.forEach(book => {
      const li = document.createElement('li');
      const dateFormatted = formatOrderDate(book.order_date || book.created_at);
      const dateText = dateFormatted ? ` <span style="color: var(--text-muted); font-size: 0.8rem;">(Dipesan: ${dateFormatted})</span>` : '';
      li.innerHTML = `<strong>${escapeHtml(book.name)}</strong>${dateText}`;
      booksListEl.appendChild(li);
    });
  }

  if (waBtnEl) {
    const cleanWaTarget = (CONFIG.waTarget || '').replace(/[^0-9]/g, '');
    const booksListText = orderedBooks.map(b => `• ${b.name}`).join('\n');
    const waText = `Assalamu'alaikum Warahmatullahi Wabarakatuh,

Yth. Admin ${CONFIG.divisionName},
Saya orang tua/wali dari siswa:
• Nama Siswa : ${studentName}
• Kelas : Kelas ${studentClassSelect ? studentClassSelect.value : ''}
• No. VA : ${vaNumberInput ? vaNumberInput.value : ''}

Siswa telah tercatat memesan buku berikut:
${booksListText}

Saya ingin berkonsultasi mengenai perubahan / pembatalan pesanan buku tersebut. Mohon bantuannya.

Jazakumullahu Khairan Wabarakallahu Fiikum.`;
    waBtnEl.href = `https://wa.me/${cleanWaTarget}?text=${encodeURIComponent(waText)}`;
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      modal.classList.remove('show');
    };
  }

  modal.classList.add('show');
}

// Handle saat Nama Siswa dipilih -> Otomatis isi data & periksa riwayat pesanan sebelumnya
async function handleStudentSelect(studentName) {
  if (!studentName) {
    vaNumberInput.value = '';
    parentWhatsappInput.value = '';
    parentEmailInput.value = '';
    currentStudentOrderedBooks = [];
    selectedBookIds.clear();
    calculateTotal();
    renderBooksList();
    return;
  }

  const selectedOption = studentNameSelect.options[studentNameSelect.selectedIndex];
  if (selectedOption) {
    vaNumberInput.value = selectedOption.dataset.va || '';
    parentWhatsappInput.value = selectedOption.dataset.wa || '';
    parentEmailInput.value = selectedOption.dataset.email || '';
  }

  // Bersihkan buku yang sedang dicentang sebelum berganti siswa
  selectedBookIds.clear();
  calculateTotal();

  const vaNumber = vaNumberInput.value.trim();

  try {
    const res = await fetch(`/api/orders/check-student?division=${encodeURIComponent(CONFIG.division)}&student_name=${encodeURIComponent(studentName)}&va_number=${encodeURIComponent(vaNumber)}`);
    if (res.ok) {
      const data = await res.json();
      currentStudentOrderedBooks = data.orderedBooks || data.ordered_books || [];

      // Render ulang checklist buku dengan status dinonaktifkan untuk buku yang sudah pernah dipesan
      renderBooksList();

      // Jika ada riwayat buku yang sudah dipesan, munculkan modal konfirmasi
      if (currentStudentOrderedBooks.length > 0) {
        showDuplicateModal(studentName, currentStudentOrderedBooks);
      }
    } else {
      currentStudentOrderedBooks = [];
      renderBooksList();
    }
  } catch (err) {
    console.error('Gagal memeriksa riwayat pesanan siswa:', err);
    currentStudentOrderedBooks = [];
    renderBooksList();
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

  const studentName = studentNameSelect.value;
  const allOrdered = studentName && loadedBooks.length > 0 && loadedBooks.every(isBookOrdered);

  // Jika semua buku untuk kelas ini sudah pernah dipesan oleh siswa ini
  if (allOrdered) {
    const cleanWaTarget = (CONFIG.waTarget || '').replace(/[^0-9]/g, '');
    const waText = `Assalamu'alaikum Warahmatullahi Wabarakatuh,

Yth. Admin ${CONFIG.divisionName},
Saya orang tua/wali dari siswa:
• Nama Siswa : ${studentName}
• Kelas : Kelas ${studentClassSelect.value}
• No. VA : ${vaNumberInput.value}

Seluruh buku pada kelas ini telah tercatat dipesan sebelumnya. Saya ingin melakukan konfirmasi / pengecekan status pesanan. Mohon bantuannya.

Jazakumullahu Khairan Wabarakallahu Fiikum.`;
    const waUrl = `https://wa.me/${cleanWaTarget}?text=${encodeURIComponent(waText)}`;

    const noticeCard = document.createElement('div');
    noticeCard.className = 'all-books-ordered-card';
    noticeCard.innerHTML = `
      <div class="all-books-ordered-icon">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h3 class="all-books-ordered-title">Seluruh Buku Kelas ${studentClassSelect.value} Telah Dipesan</h3>
      <p class="all-books-ordered-desc">
        Seluruh paket buku untuk <strong>${escapeHtml(studentName)}</strong> telah tercatat dalam sistem. Tidak ada buku lain yang perlu dipesan.
      </p>
      <p style="font-size: 0.85rem; color: #166534; margin-bottom: 16px;">
        Apabila Anda membutuhkan bantuan atau ingin melakukan penyesuaian pesanan, silakan hubungi admin sekolah:
      </p>
      <a href="${waUrl}" target="_blank" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 22px; background: #25D366; color: #FFF; font-weight: 700; border-radius: var(--border-radius-sm); text-decoration: none; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(37, 211, 102, 0.3);">
        <i class="fa-brands fa-whatsapp" style="font-size: 1.2rem;"></i> Hubungi Admin via WhatsApp
      </a>
    `;
    booksListContainer.appendChild(noticeCard);
  }

  loadedBooks.forEach(book => {
    const ordered = isBookOrdered(book);

    const label = document.createElement('label');
    label.className = `book-item-label ${ordered ? 'book-item-ordered' : ''}`;
    label.id = `book-label-${book.id}`;
    if (ordered) {
      label.title = 'Buku ini sudah pernah dipesan sebelumnya untuk siswa ini.';
    }

    // Checkbox input
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'book-checkbox';
    input.value = book.id;

    if (ordered) {
      input.disabled = true;
      input.checked = false;
    } else {
      input.checked = selectedBookIds.has(book.id);
      if (input.checked) {
        label.classList.add('selected-row');
      }
      input.onchange = (e) => handleBookToggle(e, book.id, label);
    }

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

    // Tampilkan badge "Sudah Dipesan" jika buku sudah pernah dibeli siswa ini
    if (ordered) {
      const badge = document.createElement('span');
      badge.className = 'badge-ordered-book';
      badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Sudah Dipesan';
      details.appendChild(badge);
    }

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
    showToast('Pilih kelas terlebih dahulu.', 'error');
    return;
  }

  if (!studentName) {
    showToast('Pilih nama siswa.', 'error');
    return;
  }

  if (!vaNumber) {
    showToast('Nomor Virtual Account belum terisi.', 'error');
    return;
  }

  if (selectedBookIds.size === 0) {
    showToast('Pilih minimal satu buku untuk dipesan.', 'error');
    return;
  }

  // Validasi keamanan di frontend: pastikan tidak ada buku yang sudah pernah dipesan yang ikut terkirim
  const duplicateSelected = Array.from(selectedBookIds).filter(id => {
    const book = loadedBooks.find(b => b.id === id);
    return book && isBookOrdered(book);
  });

  if (duplicateSelected.length > 0) {
    showToast('Beberapa buku telah dipesan sebelumnya. Pilih buku yang belum dipesan.', 'error');
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
    showToast('Menyimpan pesanan...', 'success');

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

    const resData = await response.json();

    // 1. Tampilkan data identitas pesanan pada Modal Sukses
    const orderCodeBadge = document.getElementById('order-code-badge');
    if (orderCodeBadge) {
      orderCodeBadge.textContent = resData.order_code || '-';
    }

    const modalTotalAmount = document.getElementById('modal-total-amount');
    if (modalTotalAmount) {
      modalTotalAmount.textContent = formatRupiah(resData.total_price || totalPrice);
    }

    // 2. Konfigurasi tampilan QRIS Poster Resmi atau Catatan Cadangan
    const qrisSection = document.getElementById('modal-qris-section');
    const noQrisNote = document.getElementById('modal-no-qris-note');
    const qrisImg = document.getElementById('modal-qris-image');
    const qrisMerchant = document.getElementById('modal-qris-merchant');
    const qrisPosterDownloadBtn = document.getElementById('modal-qris-download-poster');
    const invoiceLink = document.getElementById('modal-invoice-link');

    if (resData.qris_configured) {
      if (qrisSection) qrisSection.style.display = 'block';
      if (noQrisNote) noQrisNote.style.display = 'none';

      if (qrisMerchant) {
        qrisMerchant.textContent = resData.merchant_name || 'SEKOLAH ISLAM MUMTAZ';
      }

      // Default URL poster dari backend
      const posterDownloadUrl = resData.poster_image_url
        ? (resData.poster_image_url.includes('?') ? `${resData.poster_image_url}&download=1` : `${resData.poster_image_url}?download=1`)
        : '#';

      if (qrisPosterDownloadBtn) {
        qrisPosterDownloadBtn.href = posterDownloadUrl;
        qrisPosterDownloadBtn.setAttribute('download', `Poster-QRIS-${resData.order_code || 'Mumtaz'}.png`);
      }

      // Rendring instan menggunakan canvas client-side jika renderer siap
      if (window.QRIS_RENDERER && resData.qris_data_url) {
        window.QRIS_RENDERER.renderQRISTemplate(null, resData.qris_data_url, { division: currentDivision }).then(rendered => {
          if (qrisImg) qrisImg.src = rendered.dataUrl;
          if (qrisPosterDownloadBtn) {
            qrisPosterDownloadBtn.onclick = (e) => {
              e.preventDefault();
              window.QRIS_RENDERER.downloadQRISImage(rendered.dataUrl, `Poster-QRIS-${resData.order_code || 'Mumtaz'}.jpg`);
            };
          }
        }).catch(err => {
          console.warn('Canvas render fallback to backend poster image:', err);
          if (qrisImg) {
            qrisImg.src = resData.poster_image_url || (resData.qris_data_url || resData.qris_image_url || '');
          }
        });
      } else if (qrisImg) {
        qrisImg.src = resData.poster_image_url || (resData.qris_data_url || resData.qris_image_url || '');
      }

      if (invoiceLink) {
        invoiceLink.href = resData.invoice_url || '#';
      }
    } else {
      if (qrisSection) qrisSection.style.display = 'none';
      if (noQrisNote) noQrisNote.style.display = 'block';
    }

    // 3. Detail buku terpilih untuk format pesan WA
    const selectedBooks = loadedBooks.filter(b => selectedBookIds.has(b.id));
    const booksListText = selectedBooks.map(b => `• ${b.name} (${formatRupiah(b.price)})`).join('\n');

    // Link tagihan lengkap
    const invoiceFullUrl = `${window.location.origin}${resData.invoice_url || ''}`;

    // 4. Format Pesan WhatsApp Terstruktur & Formal Islami
    const waText = `Assalamu'alaikum Warahmatullahi Wabarakatuh,

Yth. Admin Pemesanan Buku ${CONFIG.divisionName},
Berikut rincian pemesanan buku siswa:

• Kode Pesanan : ${resData.order_code}
• Nama Siswa : ${studentName}
• Kelas : Kelas ${className}
• No. Virtual Account : ${vaNumber}
• No. WhatsApp : ${parentWhatsapp || '-'}
• Email : ${parentEmail || '-'}

Daftar Buku yang Dipesan:
${booksListText}

Total Pembayaran: ${formatRupiah(resData.total_price || totalPrice)}
Link Tagihan & QRIS: ${invoiceFullUrl}

Mohon konfirmasi dan petunjuk selanjutnya.
Jazakumullahu Khairan Wabarakallahu Fiikum.`;

    const cleanWaTarget = (CONFIG.waTarget || '').replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanWaTarget}?text=${encodeURIComponent(waText)}`;

    // Set tautan tombol WhatsApp di modal
    if (whatsappBtn) {
      whatsappBtn.href = waUrl;
      whatsappBtn.onclick = () => {
        // Biarkan modal tetap ada saat membuka tab WA baru, atau user dapat menutupnya sendiri
      };
    }

    // Pasang tombol Tutup modal sukses
    const closeSuccessBtn = document.getElementById('btn-close-success-modal');
    if (closeSuccessBtn) {
      closeSuccessBtn.onclick = () => {
        if (successModal) successModal.classList.remove('show');
      };
    }

    // 5. Reset Form
    document.getElementById('booking-form').reset();
    booksSection.style.display = 'none';
    selectedBookIds.clear();
    currentStudentOrderedBooks = [];
    calculateTotal();

    // 6. Tampilkan Modal Sukses (tanpa auto window.open agar orang tua leluasa melihat & download QRIS)
    if (successModal) {
      successModal.classList.add('show');
    }
    showToast('Pesanan berhasil disimpan.', 'success');

  } catch (error) {
    console.error('Error saat menyimpan pesanan:', error);
    showToast(error.message || 'Terjadi kesalahan saat menyimpan pesanan.', 'error');
  }
}
