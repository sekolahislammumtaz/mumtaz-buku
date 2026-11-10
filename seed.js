const { initDatabase, dbQuery } = require('./database');

const books = [
  // ==========================================
  // SD ISLAM NAZHIRAH (sd) - Kelas 1 - 6
  // ==========================================
  // Kelas 1
  { division: 'sd', kelas: '1', name: 'Tematik Tema 1: Diriku', publisher: 'Kemendikbud', price: 45000 },
  { division: 'sd', kelas: '1', name: 'Tematik Tema 2: Kegemaranku', publisher: 'Kemendikbud', price: 45000 },
  { division: 'sd', kelas: '1', name: 'Pendidikan Agama Islam dan Budi Pekerti Kelas 1', publisher: 'Erlangga', price: 55000 },
  { division: 'sd', kelas: '1', name: 'Pendidikan Pancasila Kelas 1', publisher: 'Yudhistira', price: 50000 },
  { division: 'sd', kelas: '1', name: 'Bahasa Inggris: My Next Words Grade 1', publisher: 'Kemendikbud', price: 48000 },
  { division: 'sd', kelas: '1', name: 'Matematika Volume 1 Kelas 1', publisher: 'Kemendikbud', price: 52000 },

  // Kelas 2
  { division: 'sd', kelas: '2', name: 'Tematik Tema 1: Hidup Rukun', publisher: 'Kemendikbud', price: 45000 },
  { division: 'sd', kelas: '2', name: 'Matematika Kelas 2', publisher: 'Kemendikbud', price: 52000 },
  { division: 'sd', kelas: '2', name: 'Pendidikan Agama Islam Kelas 2', publisher: 'Erlangga', price: 55000 },
  { division: 'sd', kelas: '2', name: 'Bahasa Indonesia: Aku Bisa! Kelas 2', publisher: 'Kemendikbud', price: 50000 },
  { division: 'sd', kelas: '2', name: 'Bahasa Inggris: My Next Words Grade 2', publisher: 'Kemendikbud', price: 48000 },

  // Kelas 3
  { division: 'sd', kelas: '3', name: 'IPAS (Ilmu Pengetahuan Alam & Sosial) Kelas 3', publisher: 'Kemendikbud', price: 55000 },
  { division: 'sd', kelas: '3', name: 'Matematika Kelas 3', publisher: 'Kemendikbud', price: 54000 },
  { division: 'sd', kelas: '3', name: 'Bahasa Indonesia: Kawan Seiring Kelas 3', publisher: 'Kemendikbud', price: 52000 },
  { division: 'sd', kelas: '3', name: 'Pendidikan Agama Islam Kelas 3', publisher: 'Erlangga', price: 58000 },
  { division: 'sd', kelas: '3', name: 'Bahasa Inggris Grade 3', publisher: 'Erlangga', price: 55000 },

  // Kelas 4
  { division: 'sd', kelas: '4', name: 'IPAS Kelas 4', publisher: 'Kemendikbud', price: 60000 },
  { division: 'sd', kelas: '4', name: 'Matematika Kelas 4', publisher: 'Kemendikbud', price: 58000 },
  { division: 'sd', kelas: '4', name: 'Bahasa Indonesia: Lihat Sekitar Kelas 4', publisher: 'Kemendikbud', price: 55000 },
  { division: 'sd', kelas: '4', name: 'Pendidikan Agama Islam Kelas 4', publisher: 'Erlangga', price: 60000 },
  { division: 'sd', kelas: '4', name: 'Bahasa Inggris: My Next Words Grade 4', publisher: 'Kemendikbud', price: 52000 },

  // Kelas 5
  { division: 'sd', kelas: '5', name: 'IPAS Kelas 5', publisher: 'Kemendikbud', price: 62000 },
  { division: 'sd', kelas: '5', name: 'Matematika Kelas 5', publisher: 'Kemendikbud', price: 60000 },
  { division: 'sd', kelas: '5', name: 'Bahasa Indonesia: Bergerak Bersama Kelas 5', publisher: 'Kemendikbud', price: 58000 },
  { division: 'sd', kelas: '5', name: 'Pendidikan Agama Islam Kelas 5', publisher: 'Erlangga', price: 62000 },
  { division: 'sd', kelas: '5', name: 'Bahasa Inggris Grade 5', publisher: 'Erlangga', price: 58000 },

  // Kelas 6
  { division: 'sd', kelas: '6', name: 'IPAS Kelas 6', publisher: 'Kemendikbud', price: 65000 },
  { division: 'sd', kelas: '6', name: 'Matematika Kelas 6', publisher: 'Kemendikbud', price: 62000 },
  { division: 'sd', kelas: '6', name: 'Bahasa Indonesia: Menjelajah Dunia Kelas 6', publisher: 'Kemendikbud', price: 60000 },
  { division: 'sd', kelas: '6', name: 'Pendidikan Agama Islam Kelas 6', publisher: 'Erlangga', price: 65000 },
  { division: 'sd', kelas: '6', name: 'Bahasa Inggris Grade 6', publisher: 'Erlangga', price: 60000 },

  // ==========================================
  // SMP & SMA ISLAM NAZHIRAH (smp_sma) - Kelas 7 - 12
  // ==========================================
  // Kelas 7
  { division: 'smp_sma', kelas: '7', name: 'Matematika SMP Kelas 7', publisher: 'Kemendikbud', price: 65000 },
  { division: 'smp_sma', kelas: '7', name: 'IPA Terpadu Kelas 7', publisher: 'Erlangga', price: 80000 },
  { division: 'smp_sma', kelas: '7', name: 'Bahasa Indonesia Kelas 7', publisher: 'Kemendikbud', price: 58000 },
  { division: 'smp_sma', kelas: '7', name: 'Bahasa Inggris: English in Focus Kelas 7', publisher: 'Erlangga', price: 82000 },
  { division: 'smp_sma', kelas: '7', name: 'PAI & Budi Pekerti Kelas 7', publisher: 'Tiga Serangkai', price: 62000 },

  // Kelas 8
  { division: 'smp_sma', kelas: '8', name: 'Matematika SMP Kelas 8', publisher: 'Kemendikbud', price: 68000 },
  { division: 'smp_sma', kelas: '8', name: 'IPA Terpadu Kelas 8', publisher: 'Erlangga', price: 82000 },
  { division: 'smp_sma', kelas: '8', name: 'IPS Terpadu Kelas 8', publisher: 'Kemendikbud', price: 72000 },
  { division: 'smp_sma', kelas: '8', name: 'Bahasa Inggris Kelas 8', publisher: 'Erlangga', price: 85000 },
  { division: 'smp_sma', kelas: '8', name: 'PAI & Budi Pekerti Kelas 8', publisher: 'Tiga Serangkai', price: 65000 },

  // Kelas 9
  { division: 'smp_sma', kelas: '9', name: 'Matematika SMP Kelas 9', publisher: 'Kemendikbud', price: 70000 },
  { division: 'smp_sma', kelas: '9', name: 'IPA Terpadu Kelas 9', publisher: 'Erlangga', price: 85000 },
  { division: 'smp_sma', kelas: '9', name: 'Bahasa Indonesia Kelas 9', publisher: 'Kemendikbud', price: 60000 },
  { division: 'smp_sma', kelas: '9', name: 'PPKn Kelas 9', publisher: 'Kemendikbud', price: 55000 },
  { division: 'smp_sma', kelas: '9', name: 'PAI & Budi Pekerti Kelas 9', publisher: 'Tiga Serangkai', price: 65000 },

  // Kelas 10
  { division: 'smp_sma', kelas: '10', name: 'Matematika Wajib SMA Kelas 10', publisher: 'Erlangga', price: 92000 },
  { division: 'smp_sma', kelas: '10', name: 'Fisika Kelas 10', publisher: 'Erlangga', price: 98000 },
  { division: 'smp_sma', kelas: '10', name: 'Kimia Kelas 10', publisher: 'Erlangga', price: 98000 },
  { division: 'smp_sma', kelas: '10', name: 'Biologi Kelas 10', publisher: 'Erlangga', price: 95000 },
  { division: 'smp_sma', kelas: '10', name: 'Bahasa Inggris Kelas 10', publisher: 'Kemendikbud', price: 65000 },

  // Kelas 11
  { division: 'smp_sma', kelas: '11', name: 'Matematika Tingkat Lanjut Kelas 11', publisher: 'Erlangga', price: 98000 },
  { division: 'smp_sma', kelas: '11', name: 'Fisika Kelas 11', publisher: 'Erlangga', price: 105000 },
  { division: 'smp_sma', kelas: '11', name: 'Kimia Kelas 11', publisher: 'Erlangga', price: 105000 },
  { division: 'smp_sma', kelas: '11', name: 'Biologi Kelas 11', publisher: 'Erlangga', price: 100000 },
  { division: 'smp_sma', kelas: '11', name: 'Bahasa Indonesia Kelas 11', publisher: 'Kemendikbud', price: 70000 },

  // Kelas 12
  { division: 'smp_sma', kelas: '12', name: 'Matematika Tingkat Lanjut Kelas 12', publisher: 'Erlangga', price: 100000 },
  { division: 'smp_sma', kelas: '12', name: 'Fisika Kelas 12', publisher: 'Erlangga', price: 108000 },
  { division: 'smp_sma', kelas: '12', name: 'Kimia Kelas 12', publisher: 'Erlangga', price: 110000 },
  { division: 'smp_sma', kelas: '12', name: 'Biologi Kelas 12', publisher: 'Erlangga', price: 105000 },
  { division: 'smp_sma', kelas: '12', name: 'PAI & Budi Pekerti Kelas 12', publisher: 'Tiga Serangkai', price: 72000 },

  // ==========================================
  // SEKOLAH ISLAM MUMTAZ (mumtaz) - Kelas 7 - 12
  // ==========================================
  // Kelas 7
  { division: 'mumtaz', kelas: '7', name: 'Matematika Kelas 7', publisher: 'Kemendikbud', price: 65000 },
  { division: 'mumtaz', kelas: '7', name: 'Ilmu Pengetahuan Alam Kelas 7', publisher: 'Erlangga', price: 78000 },
  { division: 'mumtaz', kelas: '7', name: 'Bahasa Indonesia Kelas 7', publisher: 'Kemendikbud', price: 55000 },
  { division: 'mumtaz', kelas: '7', name: 'Bahasa Inggris: English in Focus Kelas 7', publisher: 'Erlangga', price: 82000 },
  { division: 'mumtaz', kelas: '7', name: 'Pendidikan Agama Islam Kelas 7', publisher: 'Tiga Serangkai', price: 60000 },

  // Kelas 8
  { division: 'mumtaz', kelas: '8', name: 'Matematika Kelas 8', publisher: 'Kemendikbud', price: 68000 },
  { division: 'mumtaz', kelas: '8', name: 'Ilmu Pengetahuan Alam Kelas 8', publisher: 'Erlangga', price: 80000 },
  { division: 'mumtaz', kelas: '8', name: 'Ilmu Pengetahuan Sosial Kelas 8', publisher: 'Kemendikbud', price: 72000 },
  { division: 'mumtaz', kelas: '8', name: 'Bahasa Inggris Kelas 8', publisher: 'Erlangga', price: 85000 },
  { division: 'mumtaz', kelas: '8', name: 'Pendidikan Agama Islam Kelas 8', publisher: 'Tiga Serangkai', price: 62000 },

  // Kelas 9
  { division: 'mumtaz', kelas: '9', name: 'Matematika Kelas 9', publisher: 'Kemendikbud', price: 70000 },
  { division: 'mumtaz', kelas: '9', name: 'Ilmu Pengetahuan Alam Kelas 9', publisher: 'Erlangga', price: 85000 },
  { division: 'mumtaz', kelas: '9', name: 'Bahasa Indonesia Kelas 9', publisher: 'Kemendikbud', price: 58000 },
  { division: 'mumtaz', kelas: '9', name: 'Pendidikan Pancasila dan Kewarganegaraan Kelas 9', publisher: 'Kemendikbud', price: 52000 },
  { division: 'mumtaz', kelas: '9', name: 'Pendidikan Agama Islam Kelas 9', publisher: 'Tiga Serangkai', price: 65000 },

  // Kelas 10
  { division: 'mumtaz', kelas: '10', name: 'Matematika Wajib Kelas 10', publisher: 'Erlangga', price: 90000 },
  { division: 'mumtaz', kelas: '10', name: 'Fisika Kelas 10', publisher: 'Erlangga', price: 95000 },
  { division: 'mumtaz', kelas: '10', name: 'Kimia Kelas 10', publisher: 'Erlangga', price: 98000 },
  { division: 'mumtaz', kelas: '10', name: 'Biologi Kelas 10', publisher: 'Erlangga', price: 92000 },
  { division: 'mumtaz', kelas: '10', name: 'Sejarah Indonesia Kelas 10', publisher: 'Kemendikbud', price: 60000 },

  // Kelas 11
  { division: 'mumtaz', kelas: '11', name: 'Matematika Peminatan Kelas 11', publisher: 'Erlangga', price: 95000 },
  { division: 'mumtaz', kelas: '11', name: 'Fisika Kelas 11', publisher: 'Erlangga', price: 102000 },
  { division: 'mumtaz', kelas: '11', name: 'Kimia Kelas 11', publisher: 'Erlangga', price: 105000 },
  { division: 'mumtaz', kelas: '11', name: 'Biologi Kelas 11', publisher: 'Erlangga', price: 98000 },
  { division: 'mumtaz', kelas: '11', name: 'Bahasa Inggris Kelas 11', publisher: 'Kemendikbud', price: 68000 },

  // Kelas 12
  { division: 'mumtaz', kelas: '12', name: 'Matematika Wajib Kelas 12', publisher: 'Erlangga', price: 98000 },
  { division: 'mumtaz', kelas: '12', name: 'Fisika Kelas 12', publisher: 'Erlangga', price: 105000 },
  { division: 'mumtaz', kelas: '12', name: 'Kimia Kelas 12', publisher: 'Erlangga', price: 108000 },
  { division: 'mumtaz', kelas: '12', name: 'Biologi Kelas 12', publisher: 'Erlangga', price: 102000 },
  { division: 'mumtaz', kelas: '12', name: 'Pendidikan Agama Islam Kelas 12', publisher: 'Tiga Serangkai', price: 70000 }
];

const students = [
  // ==========================================
  // SD ISLAM NAZHIRAH (sd)
  // ==========================================
  { division: 'sd', name: 'Ahmad Fadhil Pratama', kelas: '1', va_number: '98812301001', whatsapp: '081234567801', email: 'fadhil.ortu@gmail.com' },
  { division: 'sd', name: 'Aisyah Humaira Putri', kelas: '1', va_number: '98812301002', whatsapp: '081234567802', email: 'aisyah.parent@gmail.com' },
  { division: 'sd', name: 'Bilqis Nafisah', kelas: '2', va_number: '98812302001', whatsapp: '081234567803', email: 'bilqis.ortu@gmail.com' },
  { division: 'sd', name: 'Bima Satria Utama', kelas: '2', va_number: '98812302002', whatsapp: '081234567804', email: 'bima.ortu@gmail.com' },
  { division: 'sd', name: 'Dzaky Al-Ghifari', kelas: '3', va_number: '98812303001', whatsapp: '081234567805', email: 'dzaky.ortu@gmail.com' },
  { division: 'sd', name: 'Dhiya Ulhaq', kelas: '3', va_number: '98812303002', whatsapp: '081234567806', email: 'dhiya.ortu@gmail.com' },
  { division: 'sd', name: 'Fatimah Zahra', kelas: '4', va_number: '98812304001', whatsapp: '081234567807', email: 'fatimah.ortu@gmail.com' },
  { division: 'sd', name: 'Fakhri Aliando', kelas: '4', va_number: '98812304002', whatsapp: '081234567808', email: 'fakhri.ortu@gmail.com' },
  { division: 'sd', name: 'Hanif Rabbani', kelas: '5', va_number: '98812305001', whatsapp: '081234567809', email: 'hanif.ortu@gmail.com' },
  { division: 'sd', name: 'Hasna Salsabila', kelas: '5', va_number: '98812305002', whatsapp: '081234567810', email: 'hasna.ortu@gmail.com' },
  { division: 'sd', name: 'Ibrahim Malik', kelas: '6', va_number: '98812306001', whatsapp: '081234567811', email: 'ibrahim.ortu@gmail.com' },
  { division: 'sd', name: 'Inaya Zahrani', kelas: '6', va_number: '98812306002', whatsapp: '081234567812', email: 'inaya.ortu@gmail.com' },

  // ==========================================
  // SMP & SMA ISLAM NAZHIRAH (smp_sma)
  // ==========================================
  { division: 'smp_sma', name: 'Muhammad Rayhan Nazhir', kelas: '7', va_number: '98823407001', whatsapp: '082134567801', email: 'rayhan.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Nabila Syakirah', kelas: '7', va_number: '98823407002', whatsapp: '082134567802', email: 'nabila.parent@gmail.com' },
  { division: 'smp_sma', name: 'Omar Danial', kelas: '8', va_number: '98823408001', whatsapp: '082134567803', email: 'omar.danial@gmail.com' },
  { division: 'smp_sma', name: 'Olivia Putri', kelas: '8', va_number: '98823408002', whatsapp: '082134567804', email: 'olivia.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Putri Khadijah', kelas: '9', va_number: '98823409001', whatsapp: '082134567805', email: 'putri.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Panji Gumilang', kelas: '9', va_number: '98823409002', whatsapp: '082134567806', email: 'panji.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Rafif Athallah', kelas: '10', va_number: '98823410001', whatsapp: '082134567807', email: 'rafif.family@gmail.com' },
  { division: 'smp_sma', name: 'Rania Alifah', kelas: '10', va_number: '98823410002', whatsapp: '082134567808', email: 'rania.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Salma Salsabila', kelas: '11', va_number: '98823411001', whatsapp: '082134567809', email: 'salma.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Syamil Basayev', kelas: '11', va_number: '98823411002', whatsapp: '082134567810', email: 'syamil.ortu@gmail.com' },
  { division: 'smp_sma', name: 'Tariq Ziyad', kelas: '12', va_number: '98823412001', whatsapp: '082134567811', email: 'tariq.ziyad@gmail.com' },
  { division: 'smp_sma', name: 'Tsabita Az-Zahra', kelas: '12', va_number: '98823412002', whatsapp: '082134567812', email: 'tsabita.ortu@gmail.com' },

  // ==========================================
  // SEKOLAH ISLAM MUMTAZ (mumtaz)
  // ==========================================
  { division: 'mumtaz', name: 'Abdullah Mumtaz', kelas: '7', va_number: '98800107001', whatsapp: '081398765401', email: 'abdullah.mumtaz@gmail.com' },
  { division: 'mumtaz', name: 'Annisa Rahmawati', kelas: '7', va_number: '98800107002', whatsapp: '081398765402', email: 'annisa.rahma@gmail.com' },
  { division: 'mumtaz', name: 'Farhan Maulana', kelas: '8', va_number: '98800108001', whatsapp: '081398765403', email: 'farhan.m@gmail.com' },
  { division: 'mumtaz', name: 'Faza Mutia', kelas: '8', va_number: '98800108002', whatsapp: '081398765404', email: 'faza.mutia@gmail.com' },
  { division: 'mumtaz', name: 'Hani Salsabila', kelas: '9', va_number: '98800109001', whatsapp: '081398765405', email: 'hani.salsa@gmail.com' },
  { division: 'mumtaz', name: 'Hilman Fauzi', kelas: '9', va_number: '98800109002', whatsapp: '081398765406', email: 'hilman.fauzi@gmail.com' },
  { division: 'mumtaz', name: 'Kenzo Alvaro', kelas: '10', va_number: '98800110001', whatsapp: '081398765407', email: 'kenzo.ortu@gmail.com' },
  { division: 'mumtaz', name: 'Khansa Naura', kelas: '10', va_number: '98800110002', whatsapp: '081398765408', email: 'khansa.naura@gmail.com' },
  { division: 'mumtaz', name: 'Maryam Az-Zahra', kelas: '11', va_number: '98800111001', whatsapp: '081398765409', email: 'maryam.ortu@gmail.com' },
  { division: 'mumtaz', name: 'Miqdad Ar-Rasyid', kelas: '11', va_number: '98800111002', whatsapp: '081398765410', email: 'miqdad.ortu@gmail.com' },
  { division: 'mumtaz', name: 'Zaidan Al-Farisi', kelas: '12', va_number: '98800112001', whatsapp: '081398765411', email: 'zaidan.alfarisi@gmail.com' },
  { division: 'mumtaz', name: 'Zulfa Zakiyah', kelas: '12', va_number: '98800112002', whatsapp: '081398765412', email: 'zulfa.zakiyah@gmail.com' }
];

async function runSeeder() {
  try {
    await initDatabase();
    
    console.log('Clearing existing books and students...');
    await dbQuery.run('DELETE FROM books');
    await dbQuery.run('DELETE FROM students');
    console.log('Cleared existing books and students.');

    console.log(`Seeding ${books.length} books across 3 divisions...`);
    for (const book of books) {
      await dbQuery.run(
        'INSERT INTO books (division, kelas, name, publisher, price) VALUES (?, ?, ?, ?, ?)',
        [book.division, book.kelas, book.name, book.publisher, book.price]
      );
    }
    
    console.log(`Seeding ${students.length} sample students across 3 divisions...`);
    for (const student of students) {
      await dbQuery.run(
        'INSERT INTO students (division, name, kelas, va_number, whatsapp, email) VALUES (?, ?, ?, ?, ?, ?)',
        [student.division, student.name, student.kelas, student.va_number, student.whatsapp, student.email]
      );
    }

    console.log(`Successfully seeded ${books.length} books and ${students.length} students.`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

runSeeder();
