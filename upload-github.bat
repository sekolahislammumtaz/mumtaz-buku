@echo off
echo [INFO] Menyimpan dan mengunggah perubahan ke GitHub...
git add .
if "%~1"=="" (
    git commit -m "Update otomatis sistem pemesanan buku multi-divisi"
) else (
    git commit -m "%~1"
)
git push -u origin main
if %ERRORLEVEL% EQU 0 (
    echo [SUKSES] Berhasil diunggah ke GitHub!
) else (
    echo [GAGAL] Gagal mengunggah ke GitHub. Periksa koneksi atau kredensial Git.
)
