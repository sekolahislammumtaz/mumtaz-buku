@echo off
cd /d "%~dp0"
title Server Pemesanan Buku Mumtaz ^& Nazhirah

:: Bersihkan port 3000 jika ada proses yang sedang berjalan sebelumnya
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

cls
echo ============================================================
echo  SEKOLAH ISLAM NAZHIRAH ^& SEKOLAH ISLAM MUMTAZ
echo  Server Pemesanan Buku (Localhost)
echo ============================================================
echo Aplikasi dapat diakses di:
echo - Halaman Utama : http://localhost:3000
echo - Panel Admin   : http://localhost:3000/admin.html
echo (Jendela ini jangan ditutup selama menggunakan aplikasi.
echo  Tutup jendela ini atau tekan Ctrl+C untuk mematikan server.)
echo ============================================================
echo.

start http://localhost:3000
node server.js
