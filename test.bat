@echo off
rem Futsal Tucuman - corre la suite completa de pruebas
rem   - 36 tests de API (node:test)
rem   - chequeos estaticos: imports, bindings, escapeHtml, encoding
rem   - 13 verificaciones en Chrome headless (rutas + flujo de login)
cd /d "%~dp0"
set "NODE=node"
for /f %%v in ('node -p "parseInt(process.versions.node)" 2^>nul') do if %%v LSS 22 set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=%USERPROFILE%\.node22\node-v22.14.0-win-x64\node.exe"
echo ===============================================
echo  Futsal Tucuman - Suite de pruebas completa
echo ===============================================
echo.
echo [1/3] Tests de API...
"%NODE%" --test test\api.test.js
if errorlevel 1 goto :error
echo.
echo [2/3] Chequeos estaticos...
"%NODE%" test\imports.test.js || goto :error
"%NODE%" test\bindings.test.js || goto :error
"%NODE%" test\escapehtml.test.js || goto :error
"%NODE%" test\encoding.test.js || goto :error
echo.
echo [3/3] Pruebas en navegador (Chrome headless)...
"%NODE%" test\browser.test.js || goto :error
echo.
echo ===============================================
echo  Todas las pruebas pasaron.
echo ===============================================
pause
exit /b 0
:error
echo.
echo ===============================================
echo  HUBO FALLOS. Revisar la salida arriba.
echo ===============================================
pause
exit /b 1
