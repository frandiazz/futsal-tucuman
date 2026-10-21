@echo off
rem Futsal Tucuman - arranca la plataforma en http://localhost:3000
cd /d "%~dp0"
rem Usa Node 22 o superior (node:sqlite). Si el Node instalado es viejo, usa el portable.
set "NODE=node"
for /f %%v in ('node -p "parseInt(process.versions.node)" 2^>nul') do if %%v LSS 22 set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
echo ===============================================
echo  Futsal Tucuman - plataforma en marcha
echo  Cuando aparezca "Futsal Tucuman en http://localhost:3000",
echo  abri esa direccion en el navegador.
echo  Para cerrar: Ctrl+C aqui o cierra esta ventana.
echo ===============================================
"%NODE%" server.js
pause
