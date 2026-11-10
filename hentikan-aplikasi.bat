@echo off
cd /d "%~dp0"
title Hentikan Server Pemesanan Buku

echo ============================================================
echo  SEKOLAH ISLAM NAZHIRAH ^& SEKOLAH ISLAM MUMTAZ
echo  Menghentikan Server Pemesanan Buku (Port 3000)
echo ============================================================
echo.
echo Mencari dan menghentikan proses di port 3000...

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [SUKSES] Server di port 3000 telah dihentikan.
echo ============================================================
echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
