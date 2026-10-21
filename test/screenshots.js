// Captura screenshots de cada vista en desktop y mobile.
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'futsal-shot-' + crypto.randomBytes(4).toString('hex'));
const OUT = path.join(ROOT, 'screenshots');
const PORT = 34777;

const PAGES = [
  ['inicio', '/'],
  ['tablas', '/#/tablas'],
  ['resultados', '/#/resultados'],
  ['seleccion', '/#/seleccion'],
  ['sedes', '/#/sedes'],
  ['login', '/#/panel'],
  ['landing', '/propuesta-asociacion-futsal.html'],
];

const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
];

const get = (url) => new Promise((res, rej) => { http.get(url, r => { r.resume(); res(r.statusCode); }).on('error', rej); });

async function main() {
  if (!fs.existsSync(CHROME)) { console.log('SKIP: sin Chrome'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP, ADMIN_PASSWORD: 'clave-shot-1234' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { try { if (await get(`http://127.0.0.1:${PORT}/api/health`) === 200) break; } catch {} await new Promise(r => setTimeout(r, 250)); }

  // Datos minimos para que las vistas no queden vacias
  const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', clave: 'clave-shot-1234' }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const comps = await (await fetch(`http://127.0.0.1:${PORT}/api/comps`, { headers: { Cookie: cookie } })).json();
  const e1 = comps.find(c => c.division === 'Elite 1');
  const eq = await (await fetch(`http://127.0.0.1:${PORT}/api/equipos?comp=${e1.id}`, { headers: { Cookie: cookie } })).json();
  const pairs = [[eq[0], eq[1]], [eq[2], eq[3]], [eq[4], eq[5]]];
  for (const [i, [local, visitante]] of pairs.entries()) {
    await fetch(`http://127.0.0.1:${PORT}/api/resultados`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ comp: e1.id, local: local.id, visitante: visitante.id, gl: 3 + i, gv: i }),
    });
  }
  await fetch(`http://127.0.0.1:${PORT}/api/fixture`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ comp: e1.id, fecha_num: 1, local: eq[0].id, visitante: eq[1].id, fecha: '2026-11-15', hora: '21:00', sede: 'La Usina', cancha: 'Cancha 1' }),
  });

  const debugPort = 9800 + Math.floor(Math.random() * 150);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(TMP, 'p')}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl; if (wsUrl) break; } catch {} await new Promise(r => setTimeout(r, 250)); }

  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);

  let count = 0;
  for (const [vpName, width, height] of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: vpName === 'mobile' }, sessionId);
    for (const [name, route] of PAGES) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${route}` }, sessionId);
      await new Promise(r => setTimeout(r, 1500));
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      const file = path.join(OUT, `${name}-${vpName}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      count++;
      console.log(`  ${file.replace(ROOT, '.')}`);
    }
  }

  ws.close(); chrome.kill(); server.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  console.log(`\n${count} screenshots guardados en screenshots/`);
}
main().catch(e => { console.error(e); process.exit(1); });
