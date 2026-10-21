// Prueba de humo en navegador real (Chrome headless via CDP).
// Levanta el servidor, carga cada ruta y reporta errores de consola/excepciones.
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'futsal-e2e-' + crypto.randomBytes(4).toString('hex'));
const PORT = 34567;

const ROUTES = [
  ['/', 'inicio'],
  ['/#/tablas', 'tablas'],
  ['/#/tablas?div=Elite%202&zona=', 'tablas-elite2'],
  ['/#/resultados', 'resultados'],
  ['/#/seleccion', 'seleccion'],
  ['/#/sedes', 'sedes'],
  ['/#/panel', 'login'],
  ['/propuesta-asociacion-futsal.html', 'landing'],
];

function get(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { r.resume(); res(r.statusCode); }).on('error', rej);
  });
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await get(`http://127.0.0.1:${PORT}/api/health`)) === 200) return true; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

// Carga datos de prueba via la API (login + resultados + fixture)
async function seedData() {
  const login = await fetch(`http://127.0.0.1:${PORT}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', clave: 'clave-e2e-1234' }),
  });
  if (!login.ok) return;
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) return;

  const comps = await (await fetch(`http://127.0.0.1:${PORT}/api/comps`, { headers: { Cookie: cookie } })).json();
  const e1 = comps.find(c => c.division === 'Elite 1');
  if (!e1) return;

  const equipos = await (await fetch(`http://127.0.0.1:${PORT}/api/equipos?comp=${e1.id}`, { headers: { Cookie: cookie } })).json();
  if (equipos.length < 2) return;

  // Dos resultados jugados
  const pairs = [[equipos[0], equipos[1]], [equipos[2], equipos[3]]];
  for (const [i, [local, visitante]] of pairs.entries()) {
    await fetch(`http://127.0.0.1:${PORT}/api/resultados`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ comp: e1.id, local: local.id, visitante: visitante.id, gl: 3 + i, gv: 1 + i }),
    });
  }

  // Un fixture programado
  await fetch(`http://127.0.0.1:${PORT}/api/fixture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      comp: e1.id, fecha_num: 1, local: equipos[0].id, visitante: equipos[1].id,
      fecha: '2026-11-15', hora: '21:00', sede: 'La Usina', cancha: 'Cancha 1',
    }),
  });
}

async function main() {
  if (!fs.existsSync(CHROME)) { console.log('SKIP: Chrome no encontrado'); process.exit(0); }

  // Servidor
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP, ADMIN_PASSWORD: 'clave-e2e-1234', NODE_ENV: 'development' },
    stdio: 'ignore',
  });

  if (!await waitForServer()) { server.kill(); console.log('FAIL: servidor no arrancó'); process.exit(1); }

  // Sembrar datos: login + cargar resultados, para verificar render con contenido
  await seedData();

  // CDP: usar Chrome con --remote-debugging-port y conectar por WebSocket
  const debugPort = 9222 + Math.floor(Math.random() * 500);
  const userDir = path.join(TMP, 'chrome-profile');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--mute-audio', '--window-size=1280,900',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  // Esperar a que el puerto de debug responda
  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      const j = await r.json();
      wsUrl = j.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!wsUrl) { chrome.kill(); server.kill(); console.log('FAIL: CDP no disponible'); process.exit(1); }

  // Cliente WebSocket nativo de Node 22+ (sin dependencias)
  if (!globalThis.WebSocket) {
    chrome.kill(); server.kill();
    console.log('SKIP: Node sin WebSocket global (requiere Node >= 22.4)');
    process.exit(0);
  }
  const WebSocket = globalThis.WebSocket;

  const ws = new WebSocket(wsUrl);
  let msgId = 0;
  const pending = new Map();
  const consoleErrors = [];
  const pageErrors = [];

  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      consoleErrors.push({
        type: msg.params.type,
        text: msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' '),
      });
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(d.exception?.description || d.text || 'unknown');
    }
  };

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  // Crear target
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);

  const results = [];
  for (const [route, name] of ROUTES) {
    const before = { ce: consoleErrors.length, pe: pageErrors.length };
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${route}` }, sessionId);
    await new Promise(r => setTimeout(r, 1400));

    // Verificar que se renderizo contenido
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = document.getElementById('main-content') || document.querySelector('main') || document.body;
        const errEl = m && m.querySelector('.empty-state__title');
        return JSON.stringify({
          htmlLen: m ? m.innerHTML.length : 0,
          h1: m && m.querySelector('h1') ? m.querySelector('h1').textContent.trim().slice(0,40) : null,
          rows: m ? m.querySelectorAll('table tbody tr').length : 0,
          cards: m ? m.querySelectorAll('.match-card, .card, .venue-card, .fixture-card, .roster-card, .lp-module, .lp-step').length : 0,
          err: errEl ? errEl.textContent : null
        });
      })()`,
      returnByValue: true,
    }, sessionId);

    const info = JSON.parse(result.value);
    const newCE = consoleErrors.slice(before.ce);
    const newPE = pageErrors.slice(before.pe);

    // Solo es error real si dice "Error al cargar" (no un estado vacio legitimo)
    const realError = info.err && /error/i.test(info.err);
    const hasContent = info.htmlLen > 500 && (info.rows > 0 || info.cards > 0 || !info.err);
    const ok = hasContent && !realError && newPE.length === 0;

    results.push({ name, route, ok, ...info, consoleErrors: newCE, pageErrors: newPE });
  }

  // Reporte
  console.log('\n=== RUTAS PUBLICAS ===\n');
  let fail = 0;
  for (const r of results) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(18)} html=${String(r.htmlLen).padStart(6)}  filas=${String(r.rows).padStart(3)}  cards=${String(r.cards).padStart(3)}  h1="${r.h1 || '-'}"`);
    if (r.err) console.log(`    estado: ${r.err}`);
    for (const pe of r.pageErrors) console.log(`    EXCEPCION: ${pe.split('\n')[0]}`);
    for (const ce of r.consoleErrors) console.log(`    CONSOLE ${ce.type}: ${ce.text.slice(0, 300)}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // FLUJO AUTENTICADO: login -> panel -> pestañas -> cargar resultado
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n=== FLUJO AUTENTICADO ===\n');
  const panelChecks = [];
  const check = (name, ok, detail = '') => {
    panelChecks.push({ name, ok, detail });
    if (!ok) fail++;
  };

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/panel` }, sessionId);
  await new Promise(r => setTimeout(r, 1200));

  // Llenar el formulario de login
  await send('Runtime.evaluate', {
    expression: `(() => {
      const u = document.querySelector('[name="usuario"]');
      const c = document.querySelector('[name="clave"]');
      if (!u || !c) return 'no-campos';
      u.value = 'admin';
      c.value = 'clave-e2e-1234';
      u.dispatchEvent(new Event('input', { bubbles: true }));
      c.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#login-form').requestSubmit();
      return 'ok';
    })()`,
    returnByValue: true,
  }, sessionId);
  await new Promise(r => setTimeout(r, 2000));

  let r1 = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      h1: document.querySelector('#main-content h1')?.textContent.trim(),
      tabs: [...document.querySelectorAll('.panel-tabs__trigger')].map(b => b.textContent.trim()),
      form: !!document.querySelector('#panel-res-form'),
      toast: document.querySelector('.toast__message')?.textContent || null
    })`,
    returnByValue: true,
  }, sessionId);
  const afterLogin = JSON.parse(r1.result.value);
  check('login entra al panel', /gesti/i.test(afterLogin.h1 || ''), `h1="${afterLogin.h1}" toast=${afterLogin.toast}`);
  check('panel muestra tabs', afterLogin.tabs.length >= 1, afterLogin.tabs.join(' | '));
  check('panel muestra form de resultado', afterLogin.form);

  // Cambiar de pestaña (a la que exista)
  if (afterLogin.tabs.length) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const b = [...document.querySelectorAll('.panel-tabs__trigger')].find(x => /equipo/i.test(x.textContent));
        if (b) b.click();
        return 'ok';
      })()`,
      returnByValue: true,
    }, sessionId);
    await new Promise(r => setTimeout(r, 900));
    const r2 = await send('Runtime.evaluate', {
      expression: `JSON.stringify({ form: !!document.querySelector('#panel-eq-form'), selected: document.querySelector('.panel-tabs__trigger[aria-selected="true"]')?.textContent.trim() })`,
      returnByValue: true,
    }, sessionId);
    const afterTab = JSON.parse(r2.result.value);
    check('cambio de pestaña funciona', afterTab.form === true, `sel=${afterTab.selected}`);
  }

  // Cargar un resultado desde el panel
  const r3 = await send('Runtime.evaluate', {
    expression: `(async () => {
      const b = [...document.querySelectorAll('.panel-tabs__trigger')].find(x => /resultado/i.test(x.textContent));
      if (b) b.click();
      await new Promise(r => setTimeout(r, 600));
      const form = document.querySelector('#panel-res-form');
      if (!form) return JSON.stringify({ err: 'sin formulario' });
      const sels = form.querySelectorAll('select');
      const local = sels[0], visitante = sels[1];
      if (!local || !visitante || local.options.length < 2) return JSON.stringify({ err: 'sin opciones' });
      local.selectedIndex = 0;
      visitante.selectedIndex = 1;
      local.dispatchEvent(new Event('change', { bubbles: true }));
      visitante.dispatchEvent(new Event('change', { bubbles: true }));
      form.querySelector('[name="gl"]').value = '2';
      form.querySelector('[name="gv"]').value = '0';
      form.requestSubmit();
      await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({
        toasts: [...document.querySelectorAll('.toast__message')].map(e => e.textContent),
        recent: document.querySelector('#recent-results .panel-list__name')?.textContent || null
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  const afterSubmit = JSON.parse(r3.result.value);
  const toastText = (afterSubmit.toasts || []).join(' | ');
  check(
    'cargar resultado desde panel',
    /guardad/i.test(toastText) && /\d\s*-\s*\d/.test(afterSubmit.recent || ''),
    `toasts=${toastText} item=${afterSubmit.recent}`
  );

  for (const p of panelChecks) {
    console.log(`${p.ok ? '✓' : '✗'} ${p.name}${p.detail ? '  (' + p.detail + ')' : ''}`);
  }

  console.log(`\n${results.length + panelChecks.length - fail}/${results.length + panelChecks.length} verificaciones OK`);

  ws.close(); chrome.kill(); server.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
