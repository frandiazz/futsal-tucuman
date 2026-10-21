@echo off
rem Futsal Tucuman - corre la suite completa de 35 pruebas automatizadas
cd /d "%~dp0"
set "NODE=node"
for /f %%v in ('node -p "parseInt(process.versions.node)" 2^>nul') do if %%v LSS 22 set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
echo ===============================================
echo  Futsal Tucuman - Ejecutando pruebas unitarias
echo ===============================================
"%NODE%" --test test\api.test.js
pause
