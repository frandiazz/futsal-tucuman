// Tests de la API · node:test, cero dependencias. Requiere Node >= 22.13 (node:sqlite).
// Levanta el servidor con DATA_DIR temporal en un puerto efímero y ejercita los
// mismos casos que las 20 pruebas manuales originales.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');

const TMP = path.join(os.tmpdir(), 'futsal-test-' + crypto.randomBytes(4).toString('hex'));
process.env.PORT = '0';
process.env.DATA_DIR = TMP;
process.env.ADMIN_PASSWORD = 'clave-test-1234';

const { server, db } = require('../server.js');
let BASE; const cookies = {}; // cookies.admin, cookies.planillero

const req = async (p, { m = 'GET', token, body } = {}) => {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Cookie = 't=' + token;
  const r = await fetch(BASE + p, { method: m, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const out = { status: r.status, json: await r.json().catch(() => null), setCookie: r.headers.get('set-cookie') };
  const c = /t=([^;]+)/.exec(out.setCookie || '');
  if (c) out.cookie = c[1];
  return out;
};
const login = async (usuario, clave) => req('/api/login', { m: 'POST', body: { usuario, clave } });

test.after(async () => {
  await new Promise(r => server.close(r));
  try { db.close(); } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});

test('setup: servidor escuchando', async () => {
  await new Promise(r => server.listening ? r() : server.once('listening', r));
  BASE = 'http://127.0.0.1:' + server.address().port;
  assert.ok(server.address().port > 0);
});

// ---- Público sin sesión ----
test('health responde ok', async () => {
  const r = await req('/api/health');
  assert.equal(r.status, 200); assert.equal(r.json.ok, true);
});

test('comps: 7 filas division/zona, 5 divisiones y 83 equipos', async () => {
  const r = await req('/api/comps');
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 7);
  assert.equal(new Set(r.json.map(c => c.division)).size, 5);
  assert.equal(r.json.reduce((a, c) => a + c.equipos, 0), 83);
});

test('tablas ordenadas por puntos y flag revisar en Primera A', async () => {
  const comps = (await req('/api/comps')).json;
  const pa = comps.find(c => c.division === 'Primera A');
  const ej1 = comps.find(c => c.division === 'Elite 1');
  const t = (await req('/api/tablas?comp=' + ej1.id)).json;
  assert.equal(t[0].nombre, 'Mala Fama'); assert.equal(t[0].pts, 2);
  assert.ok(t[1].pts <= t[0].pts && t[2].pts <= t[1].pts, 'orden por puntos desc');
  assert.ok(t.every(x => Number.isInteger(x.pts) && Number.isInteger(x.dg) && typeof x.nombre === 'string'), 'estructura de filas');
  const paT = (await req('/api/tablas?comp=' + pa.id)).json;
  const pj = paT.find(x => x.nombre === 'Primera Junta');
  assert.equal(pj.revisar, true, 'Primera Junta marcada revisar');
  assert.equal(pj.pj, 3); assert.equal(pj.g + pj.e + pj.p, 2);
});

test('tablas sin comp devuelve 400', async () => {
  assert.equal((await req('/api/tablas')).status, 400);
});

test('endpoint admin sin sesión devuelve 401', async () => {
  assert.equal((await req('/api/pagos')).status, 401);
  assert.equal((await req('/api/audit')).status, 401);
  assert.equal((await req('/api/usuarios', { m: 'POST', body: {} })).status, 401);
});

// ---- Login y claves ----
test('login con clave incorrecta 401', async () => {
  assert.equal((await login('admin', 'incorrecta-xx')).status, 401);
  assert.equal((await login('noexiste', 'incorrecta-xx')).status, 401);
});

test('obtener sesiones admin y planillero', async () => {
  let r = await login('admin', 'clave-test-1234');
  assert.equal(r.status, 200); assert.equal(r.json.debe_cambiar, 1); assert.equal(r.json.rol, 'admin');
  cookies.admin = r.cookie;
  assert.ok(cookies.admin);
  const me = await req('/api/me', { token: cookies.admin });
  assert.equal(me.json.usuario, 'admin');
});

test('cambiar-clave: actual incorrecta 401, correcta 200 y deshabilita debe_cambiar / revoca sesión previa', async () => {
  const old = cookies.admin;
  const bad = await req('/api/cambiar-clave', { m: 'POST', token: old, body: { actual: 'otra-incorrecta', nueva: 'nueva-clave-99' } });
  assert.equal(bad.status, 401);
  const ok = await req('/api/cambiar-clave', { m: 'POST', token: old, body: { actual: 'clave-test-1234', nueva: 'nueva-clave-99' } });
  assert.equal(ok.status, 200);
  assert.equal((await req('/api/me', { token: old })).json.usuario, undefined, 'token anterior revocado por sesion_ver');
  cookies.admin = ok.cookie;
  assert.equal((await req('/api/me', { token: cookies.admin })).json.debe_cambiar, 0);
  const corta = await req('/api/cambiar-clave', { m: 'POST', token: cookies.admin, body: { actual: 'nueva-clave-99', nueva: 'corta' } });
  assert.equal(corta.status, 400);
});

// ---- Roles ----
test('crear planillero con rol limitado', async () => {
  let r = await req('/api/usuarios', { m: 'POST', token: cookies.admin, body: { usuario: 'planilla', clave: 'clave-plan-123', rol: 'planillero' } });
  assert.equal(r.status, 201);
  assert.equal((await req('/api/usuarios', { m: 'POST', token: cookies.admin, body: { usuario: 'planilla', clave: 'clave-plan-123', rol: 'planillero' } })).status, 409);
  assert.equal((await req('/api/usuarios', { m: 'POST', token: cookies.admin, body: { usuario: 'otro', clave: 'corta', rol: 'planillero' } })).status, 400);
  assert.equal((await req('/api/usuarios', { m: 'POST', token: cookies.admin, body: { usuario: 'otro', clave: 'clave-larga-x', rol: 'dueño' } })).status, 400);
  const l = await login('planilla', 'clave-plan-123'); cookies.planillero = l.cookie;
  assert.equal(l.status, 200); assert.equal(l.json.rol, 'planillero');
});

// ---- Resultados ----
test('cargar resultado: permisos y validaciones', async () => {
  const comps = (await req('/api/comps')).json;
  const e1 = comps.find(c => c.division === 'Elite 1');
  const eqs = (await req('/api/equipos?comp=' + e1.id)).json;
  const [a, b] = eqs;
  const pa = comps.find(c => c.division === 'Primera A');
  const paEqs = (await req('/api/equipos?comp=' + pa.id)).json;
  const fuera = paEqs[0];
  const pl = cookies.planillero;
  assert.equal((await req('/api/resultados', { m: 'POST', token: pl, body: { comp: e1.id, local: a.id, visitante: a.id, gl: 1, gv: 0 } })).status, 400, 'local = visitante');
  assert.equal((await req('/api/resultados', { m: 'POST', token: pl, body: { comp: e1.id, local: a.id, visitante: fuera.id, gl: 1, gv: 0 } })).status, 400, 'equipos de distinta división');
  assert.equal((await req('/api/resultados', { m: 'POST', token: pl, body: { comp: e1.id, local: a.id, visitante: b.id, gl: -1, gv: 0 } })).status, 400, 'gl negativo');
  assert.equal((await req('/api/resultados', { m: 'POST', token: pl, body: { comp: e1.id, local: a.id, visitante: b.id, gl: 0, gv: 100 } })).status, 400, 'gv > 99');
  assert.equal((await req('/api/resultados', { m: 'POST', body: { comp: e1.id, local: a.id, visitante: b.id, gl: 1, gv: 0 } })).status, 401, 'sin sesión');
  r = await req('/api/resultados', { m: 'POST', token: pl, body: { comp: e1.id, local: a.id, visitante: b.id, gl: 3, gv: 2 } });
  resultID = r.json.id; assert.equal(r.status, 201);
  const lista = (await req('/api/partidos')).json;
  const cargado = lista.find(x => x.id === resultID);
  assert.ok(cargado && cargado.local === a.nombre && cargado.visitante === b.nombre && cargado.gl === 3 && cargado.gv === 2);
});

test('borrar resultado: solo admin', async () => {
  assert.equal((await req('/api/resultados/' + resultID, { m: 'DELETE', token: cookies.planillero })).status, 403, 'planillero no borra');
  assert.equal((await req('/api/resultados/' + resultID, { m: 'DELETE', token: cookies.admin })).status, 200);
});

test('JSON inválido devuelve 500 sin tumba el servidor', async () => {
  const r = await fetch(BASE + '/api/resultados', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 't=' + cookies.planillero }, body: '{no-json' });
  assert.equal(r.status, 500);
  assert.equal((await req('/api/health')).status, 200);
});

// ---- Equipos ----
test('inscribir equipo: duplicado rechazado (case-insensitive)', async () => {
  const comps = (await req('/api/comps')).json, e1 = comps.find(c => c.division === 'Elite 1');
  assert.equal((await req('/api/equipos', { m: 'POST', token: cookies.planillero, body: { comp: e1.id, nombre: 'Nuevo FC' } })).status, 403, 'planillero no inscribe');
  assert.equal((await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: e1.id, nombre: 'Mala Fama' } })).status, 409);
  assert.equal((await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: e1.id, nombre: 'mala fama ' } })).status, 409, 'case/trims');
  assert.equal((await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: 999999, nombre: 'Fantasma' } })).status, 400);
  const r = await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: e1.id, nombre: 'Nuevo FC' } });
  assert.equal(r.status, 201);
  newTeamId = r.json.id;
});

test('editar equipo: fotos, colores, delegados y validaciones', async () => {
  const comps = (await req('/api/comps')).json, e1 = comps.find(c => c.division === 'Elite 1');
  assert.equal((await req('/api/equipos/' + newTeamId, { m: 'PATCH', token: cookies.planillero, body: { nombre: 'Cambio' } })).status, 403, 'planillero no edita');
  assert.equal((await req('/api/equipos/' + newTeamId, { m: 'PATCH', token: cookies.admin, body: { nombre: 'Mala Fama' } })).status, 409, 'nombre duplicado en division');
  const r = await req('/api/equipos/' + newTeamId, { m: 'PATCH', token: cookies.admin, body: {
    nombre: 'Nuevo FC Modificado',
    foto: 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4TFsAAAAv',
    color: '#38bdf8',
    delegado: 'Juan Carlos Pérez',
    telefono: '3814123456'
  }});
  assert.equal(r.status, 200);
  const eq = (await req('/api/equipos/' + newTeamId)).json;
  assert.equal(eq.nombre, 'Nuevo FC Modificado');
  assert.equal(eq.foto, 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4TFsAAAAv');
  assert.equal(eq.color, '#38bdf8');
  assert.equal(eq.delegado, 'Juan Carlos Pérez');
  assert.equal(eq.telefono, '3814123456');
  // Revertir nombre para no alterar tests posteriores que busquen Nuevo FC
  await req('/api/equipos/' + newTeamId, { m: 'PATCH', token: cookies.admin, body: { nombre: 'Nuevo FC' } });
});

// ---- Reservas ----
test('reservas: superposición bloqueada por UNIQUE', async () => {
  const slot = { sede: 'La Usina', cancha: 'Cancha 1', fecha: '2026-11-01', hora: '21:00', detalle: 'partido Elite 1' };
  assert.equal((await req('/api/reservas', { m: 'POST', token: cookies.planillero, body: slot })).status, 403, 'planillero no reserva');
  assert.equal((await req('/api/reservas', { m: 'POST', token: cookies.admin, body: { ...slot, fecha: '1-11-2026' } })).status, 400, 'formato de fecha');
  const ok = await req('/api/reservas', { m: 'POST', token: cookies.admin, body: slot });
  assert.equal(ok.status, 201); reservaID = ok.json.id;
  assert.equal((await req('/api/reservas', { m: 'POST', token: cookies.admin, body: { ...slot, detalle: 'duplicado' } })).status, 409, 'mismo slot');
  assert.equal((await req('/api/reservas', { m: 'POST', token: cookies.admin, body: { ...slot, hora: '22:00' } })).status, 201, 'otra hora ok');
  const lista = (await req('/api/reservas')).json;
  assert.ok(lista.some(x => x.sede === 'La Usina' && x.fecha === '2026-11-01' && x.hora === '21:00'));
});

// ---- Sedes ----
test('sedes: crear, duplicada, canchas fuera de rango, borrar', async () => {
  assert.equal((await req('/api/sedes', { m: 'POST', token: cookies.planillero, body: { nombre: 'Otra Sede' } })).status, 403);
  assert.equal((await req('/api/sedes', { m: 'POST', token: cookies.admin, body: { nombre: 'La Usina' } })).status, 409);
  assert.equal((await req('/api/sedes', { m: 'POST', token: cookies.admin, body: { nombre: 'Otra Sede', canchas: 0 } })).status, 400);
  let r = await req('/api/sedes', { m: 'POST', token: cookies.admin, body: { nombre: 'Otra Sede', canchas: 3 } });
  assert.equal(r.status, 201); sedeID = r.json.id;
  const lista = (await req('/api/sedes')).json;
  assert.ok(lista.some(s => s.nombre === 'Otra Sede' && s.canchas === 3));
  assert.equal((await req('/api/sedes/' + sedeID, { m: 'DELETE', token: cookies.admin })).status, 200);
  assert.equal(((await req('/api/sedes')).json).some(s => s.id === sedeID), false);
});

// ---- Pagos ----
test('pagos: concepto y monto validados, habilitado tras pagar inscripción', async () => {
  assert.equal((await req('/api/pagos', { m: 'POST', token: cookies.planillero, body: { equipo: newTeamId, concepto: 'Inscripción', monto: 5000 } })).status, 403);
  assert.equal((await req('/api/pagos', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, concepto: 'Cuota', monto: 5000 } })).status, 400);
  assert.equal((await req('/api/pagos', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, concepto: 'Inscripción', monto: 0 } })).status, 400);
  assert.equal((await req('/api/pagos', { m: 'POST', token: cookies.admin, body: { equipo: 999999, concepto: 'Inscripción', monto: 100 } })).status, 400);
  r = await req('/api/pagos', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, concepto: 'Inscripción', monto: 50000 } });
  assert.equal(r.status, 201, 'pago inscripción creado');
  const lista = (await req('/api/pagos', { token: cookies.admin })).json;
  if (!Array.isArray(lista)) console.error('DEBUG PAGOS GET =', JSON.stringify(lista), 'status', (await req('/api/pagos', { token: cookies.admin })).status);
  let p = lista.find(g => g.equipo === 'Nuevo FC');
  assert.ok(p && p.habilitado === 1, 'habilitado tras pagar inscripción');
  r = await req('/api/pagos', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, concepto: 'Pago por partido', monto: 1500 } });
  assert.equal(r.status, 201);
  const pagos = (await req('/api/pagos', { token: cookies.admin })).json.filter(g => g.equipo === 'Nuevo FC');
  assert.equal(pagos.length, 2, 'una fila por pago');
  assert.ok(pagos.some(g => g.concepto === 'Pago por partido'), 'pago por partido registrado');
});

// ---- Fixture ----
test('fixture: programar (solo admin), cargar resultado (planillero ok), estados', async () => {
  const comps = (await req('/api/comps')).json, e1 = comps.find(c => c.division === 'Elite 1');
  const eqs = (await req('/api/equipos?comp=' + e1.id)).json;
  const [a, b] = eqs;
  let fx = (await req('/api/fixture?comp=' + e1.id)).json;
  assert.equal(Array.isArray(fx) && fx.length, false, 'fixture vacío al inicio');
  const slot = { comp: e1.id, fecha_num: 1, local: a.id, visitante: b.id, fecha: '2026-11-02', hora: '20:00', sede: 'La Usina', cancha: 'Cancha 1' };
  assert.equal((await req('/api/fixture', { m: 'POST', token: cookies.planillero, body: slot })).status, 403, 'planillero no programa');
  assert.equal((await req('/api/fixture', { m: 'POST', token: cookies.admin, body: { ...slot, local: a.id, visitante: a.id } })).status, 400);
  assert.equal((await req('/api/fixture', { m: 'POST', token: cookies.admin, body: { ...slot, fecha_num: 0 } })).status, 400);
  const r = await req('/api/fixture', { m: 'POST', token: cookies.admin, body: slot });
  assert.equal(r.status, 201); fixtureID = r.json.id;
  fx = (await req('/api/fixture?comp=' + e1.id)).json;
  assert.equal(fx[0].estado, 'programado');
  assert.equal(fx[0].local, a.nombre, 'nombres de equipos en la respuesta');
  assert.equal((await req('/api/fixture/' + fixtureID, { m: 'PATCH', token: cookies.admin, body: { gl: 101, gv: 0 } })).status, 400, 'goles fuera de rango');
  assert.equal((await req('/api/fixture/' + fixtureID, { m: 'PATCH', token: cookies.planillero, body: { gl: 2, gv: 1 } })).status, 200, 'planillero carga resultado');
  fx = (await req('/api/fixture?comp=' + e1.id)).json;
  assert.equal(fx[0].estado, 'jugado'); assert.equal(fx[0].gl, 2); assert.equal(fx[0].gv, 1);
  assert.equal((await req('/api/fixture/' + fixtureID, { m: 'PATCH', token: cookies.admin, body: { gl: 0, gv: 0 } })).status, 409, 'no se recarga un jugado');
  assert.equal((await req('/api/fixture/' + fixtureID, { m: 'DELETE', token: cookies.admin })).status, 409, 'no se borra un jugado');
  const otro = (await req('/api/fixture', { m: 'POST', token: cookies.admin, body: { comp: e1.id, fecha_num: 2, local: eqs[2].id, visitante: eqs[3].id } })).json;
  assert.equal((await req('/api/fixture/' + otro.id, { m: 'DELETE', token: cookies.admin })).status, 200, 'borra programado');
  const t = (await req('/api/tablas?comp=' + e1.id)).json;
  assert.equal(t.find(x => x.id === a.id).gf !== undefined, true);
});

// ---- Auditoría ----
test('auditoría registra acciones:', async () => {
  const au = (await req('/api/audit', { token: cookies.admin })).json;
  const acc = au.map(a => a.accion);
  for (const esperada of ['login', 'cambio_clave', 'crear_usuario', 'cargar_resultado', 'borrar_resultado', 'inscribir_equipo', 'crear_reserva', 'crear_sede', 'registrar_pago']) assert.ok(acc.includes(esperada), 'contiene ' + esperada);
  assert.equal((await req('/api/audit')).status, 401, 'sin sesión 401');
  assert.equal((await req('/api/audit', { token: cookies.planillero })).status, 403, 'planillero no ve auditoría');
});

// ---- Fixture avanzado: generación, estados, reprogramación ----
test('round-robin simple en Elite 2: 66 cruces únicos en 11 fechas', async () => {
  const comps = (await req('/api/comps')).json, e2 = comps.find(c => c.division === 'Elite 2');
  assert.equal((await req('/api/fixture/round', { m: 'POST', token: cookies.planillero, body: { comp: e2.id } })).status, 403, 'planillero no genera');
  assert.equal((await req('/api/fixture/round', { m: 'POST', body: { comp: e2.id } })).status, 401, 'sin sesión');
  assert.equal((await req('/api/fixture/round', { m: 'POST', token: cookies.admin, body: { comp: 999999 } })).status, 400, 'división inexistente');
  const r = await req('/api/fixture/round', { m: 'POST', token: cookies.admin, body: { comp: e2.id } });
  assert.equal(r.status, 201); assert.equal(r.json.partidos, 66); assert.equal(r.json.rondas, 11);
  const fx = (await req('/api/fixture?comp=' + e2.id)).json;
  assert.equal(fx.length, 66);
  assert.ok(fx.every(x => x.estado === 'programado'));
  const pares = new Set();
  for (const x of fx) { const k = [x.local, x.visitante].sort().join(' vs '); assert.ok(!pares.has(k), 'cruce repetido: ' + k); pares.add(k); }
  assert.equal(pares.size, 66, '12 equipos generan 66 cruces');
  for (const e of (await req('/api/equipos?comp=' + e2.id)).json) {
    const mios = fx.filter(x => x.local === e.nombre || x.visitante === e.nombre);
    assert.equal(mios.length, 11, e.nombre + ' juega 11');
    assert.equal(new Set(mios.map(x => x.fecha_num)).size, mios.length, e.nombre + ' una vez por fecha');
  }
  assert.equal((await req('/api/fixture/round', { m: 'POST', token: cookies.admin, body: { comp: e2.id } })).status, 409, 'no regenera si ya hay partidos');
});

test('round-robin doble con calendario semanal en Primera A', async () => {
  const comps = (await req('/api/comps')).json, pa = comps.find(c => c.division === 'Primera A');
  const r = await req('/api/fixture/round', { m: 'POST', token: cookies.admin, body: { comp: pa.id, doble: true, fecha: '2026-11-07' } });
  assert.equal(r.status, 201); assert.equal(r.json.partidos, 132); assert.equal(r.json.rondas, 22);
  const fx = (await req('/api/fixture?comp=' + pa.id)).json;
  assert.ok(fx.every(x => x.fecha_num >= 1 && x.fecha_num <= 22), 'rondas 1..22');
  assert.equal(fx.find(x => x.fecha_num === 1).fecha, '2026-11-07', 'primera fecha con la base');
  const ymd = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const ult = new Date(2026, 10, 7); ult.setDate(ult.getDate() + 21 * 7);
  assert.equal(fx.find(x => x.fecha_num === 22).fecha, ymd(ult), 'última fecha = base + 21 semanas');
  const eqs = (await req('/api/equipos?comp=' + pa.id)).json, [q1, q2] = eqs;
  assert.ok(fx.some(x => x.local === q1.nombre && x.visitante === q2.nombre) && fx.some(x => x.local === q2.nombre && x.visitante === q1.nombre), 'ida y vuelta entre dos equipos');
  for (const e of eqs) assert.equal(fx.filter(x => x.local === e.nombre || x.visitante === e.nombre).length, 22, e.nombre + ' juega 22');
});

test('round-robin con cantidad impar (BYE) en Primera B', async () => {
  const comps = (await req('/api/comps')).json, pb = comps.find(c => c.division === 'Primera B');
  assert.equal((await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: pb.id, nombre: 'Equipo Impar' } })).status, 201);
  const r = await req('/api/fixture/round', { m: 'POST', token: cookies.admin, body: { comp: pb.id } });
  assert.equal(r.status, 201); assert.equal(r.json.partidos, 105, '15 equipos: 15 fechas con descanso corriendo'); assert.equal(r.json.rondas, 15);
  const fx = (await req('/api/fixture?comp=' + pb.id)).json;
  assert.equal(fx.length, 105);
  for (const e of (await req('/api/equipos?comp=' + pb.id)).json) {
    const mios = fx.filter(x => x.local === e.nombre || x.visitante === e.nombre);
    assert.equal(mios.length, 14, e.nombre + ' juega 14 (una fecha descansa)');
  }
});

test('suspender, reprogramar y reactivar partidos (solo admin)', async () => {
  const comps = (await req('/api/comps')).json, pb = comps.find(c => c.division === 'Primera B');
  const lista = async () => (await req('/api/fixture?comp=' + pb.id)).json;
  const uno = (await lista())[0];
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.planillero, body: { estado: 'suspendido' } })).status, 403, 'planillero no cambia estado');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'jugado' } })).status, 400, 'jugado requiere goles por separado');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'fin-suspension' } })).status, 400, 'estado inválido');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { fecha: '24-12' } })).status, 400, 'fecha con formato inválido');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: {} })).status, 400, 'nada para actualizar');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'suspendido' } })).status, 200);
  let despues = (await lista()).find(x => x.id === uno.id);
  assert.equal(despues.estado, 'suspendido');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { gl: 1, gv: 1, fecha_num: 2 } })).status, 400, 'goles y fecha no se mandan juntos');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'reprogramado', fecha_num: uno.fecha_num + 5, fecha: '2026-12-24', hora: '21:00' } })).status, 200);
  despues = (await lista()).find(x => x.id === uno.id);
  assert.equal(despues.estado, 'reprogramado'); assert.equal(despues.fecha_num, uno.fecha_num + 5); assert.equal(despues.fecha, '2026-12-24'); assert.equal(despues.hora, '21:00');
  assert.equal((await req('/api/fixture/' + uno.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'programado' } })).status, 200, 'reactivar');
  assert.equal((await lista()).find(x => x.id === uno.id).estado, 'programado');
  const otro = (await lista()).find(x => x.estado === 'programado' && x.id !== uno.id);
  await req('/api/fixture/' + otro.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'suspendido' } });
  assert.equal((await req('/api/fixture/' + otro.id, { m: 'PATCH', token: cookies.planillero, body: { gl: 3, gv: 3 } })).status, 200, 'planillero carga resultado sobre suspendido');
  assert.equal((await lista()).find(x => x.id === otro.id).estado, 'jugado');
  assert.equal((await req('/api/fixture/' + otro.id, { m: 'PATCH', token: cookies.admin, body: { estado: 'suspendido' } })).status, 409, 'un jugado no se edita sin borra el resultado');
});

test('usuarios: listado y reseteo de clave (revoca sesión)', async () => {
  assert.equal((await req('/api/usuarios')).status, 401, 'sin sesión');
  assert.equal((await req('/api/usuarios', { token: cookies.planillero })).status, 403, 'planillero no lista');
  const us = (await req('/api/usuarios', { token: cookies.admin })).json;
  assert.ok(Array.isArray(us) && us.length >= 2, 'hay usuarios');
  assert.ok(us.every(u => u.usuario && u.rol && u.hash === undefined), 'la lista no expone hashes');
  assert.equal((await req('/api/usuarios/reset', { m: 'POST', token: cookies.admin, body: { usuario: 'fantasma' } })).status, 404, 'usuario inexistente');
  assert.equal((await req('/api/usuarios/reset', { m: 'POST', token: cookies.planillero, body: { usuario: 'planilla', clave: 'cualquier-clave-x' } })).status, 403, 'planillero no resetea');
  assert.equal((await req('/api/usuarios/reset', { m: 'POST', token: cookies.admin, body: { usuario: 'planilla', clave: 'corta' } })).status, 400, 'clave corta');
  let r = await req('/api/usuarios/reset', { m: 'POST', token: cookies.admin, body: { usuario: 'planilla', clave: 'nueva-clave-plan' } });
  assert.equal(r.status, 200);
  assert.equal((await req('/api/me', { token: cookies.planillero })).json.usuario, undefined, 'sesión anterior revocada');
  assert.equal((await login('planilla', 'clave-plan-123')).status, 401, 'la clave anterior queda inválida');
  let l = await login('planilla', 'nueva-clave-plan');
  assert.equal(l.status, 200); assert.equal(l.json.debe_cambiar, 1, 'se obliga a cambiar al entrar');
  r = await req('/api/usuarios/reset', { m: 'POST', token: cookies.admin, body: { usuario: 'planilla' } });
  assert.equal(r.status, 200); assert.ok(r.json.clave.length >= 8, 'clave autogenerada');
  l = await login('planilla', r.json.clave);
  assert.equal(l.status, 200, 'la clave autogenerada entra');
  cookies.planillero = l.cookie; // sesión nueva (la anterior fue revocada por el reset)
});

// ---- Torneos y divisiones administrables ----
test('torneos: default Clausura 2026, crear, duplicado', async () => {
  let r = await req('/api/torneos');
  assert.equal(r.status, 200);
  assert.ok(r.json.some(t => t.nombre === 'Clausura 2026' && t.comps >= 1), 'Clausura con comps');
  assert.equal((await req('/api/torneos', { m: 'POST', body: { nombre: 'X' } })).status, 401, 'sin sesión');
  r = await req('/api/torneos', { m: 'POST', token: cookies.admin, body: { nombre: 'Apertura 2027' } });
  assert.equal(r.status, 201);
  assert.equal((await req('/api/torneos', { m: 'POST', token: cookies.admin, body: { nombre: 'apertura 2027 ' } })).status, 409, 'duplicado case-insensitive');
  const comps = (await req('/api/comps')).json;
  assert.ok(comps.every(c => c.torneo === 'Clausura 2026'), 'comps existentes quedaron en Clausura 2026');
});

test('divisiones: crear con torneo, duplicada, borrar vacía y con equipos', async () => {
  assert.equal((await req('/api/comps', { m: 'POST', token: cookies.planillero, body: { division: 'X', torneo_id: 1 } })).status, 403);
  let r = await req('/api/comps', { m: 'POST', token: cookies.admin, body: { division: 'Femenino', torneo: 'Apertura 2027' } });
  assert.equal(r.status, 201); const fem = r.json.id;
  const comps = (await req('/api/comps')).json;
  const fc = comps.find(c => c.id === fem);
  assert.equal(fc.division, 'Femenino'); assert.equal(fc.torneo, 'Apertura 2027'); assert.equal(fc.equipos, 0);
  assert.equal((await req('/api/comps', { m: 'POST', token: cookies.admin, body: { division: 'Femenino' } })).status, 400, 'sin torneo');
  assert.equal((await req('/api/comps', { m: 'POST', token: cookies.admin, body: { division: 'Femenino', torneo: 'Apertura 2027' } })).status, 409, 'duplicada');
  assert.equal((await req('/api/comps/' + fem, { m: 'DELETE', token: cookies.planillero })).status, 403, 'planillero no borra');
  assert.equal((await req('/api/comps/' + fem, { m: 'DELETE', token: cookies.admin })).status, 200, 'borrar división vacía');
  assert.equal(((await req('/api/comps')).json).some(c => c.id === fem), false);
  const pb = (await req('/api/comps')).json.find(c => c.division === 'Primera B');
  assert.equal((await req('/api/comps/' + pb.id, { m: 'DELETE', token: cookies.admin })).status, 409, 'con equipos no se borra');
});

test('plantel: carga masiva, límite de 40, borrado de jugador', async () => {
  assert.equal((await req('/api/jugadores', { m: 'POST', token: cookies.planillero, body: { equipo: newTeamId, lista: 'Pepe' } })).status, 403, 'planillero no carga plantel');
  assert.equal((await req('/api/jugadores', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, lista: '   ' } })).status, 400, 'lista vacía');
  assert.equal((await req('/api/jugadores', { m: 'POST', token: cookies.admin, body: { equipo: 999999, lista: 'Alguien' } })).status, 400, 'equipo inexistente');
  let r = await req('/api/jugadores', { m: 'POST', token: cookies.admin, body: { equipo: newTeamId, lista: 'Aaa Bbb\nCcc Ddd;E ee,Eee' } });
  assert.equal(r.status, 201); assert.equal(r.json.agregados, 4); assert.equal(r.json.total, 4);
  const jug = (await req('/api/jugadores?equipo=' + newTeamId)).json;
  assert.equal(jug.length, 4); assert.ok(jug.every(j => j.nombre && !j.nombre.includes(',')), 'sin separadores');
  // techo de 40 por equipo
  r = await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: 1, nombre: 'Plantel Test FC' } });
  const pt = r.json.id;
  const cuarenta = Array.from({ length: 40 }, (_, i) => 'Jugador ' + (i + 1)).join('\n');
  assert.equal((await req('/api/jugadores', { m: 'POST', token: cookies.admin, body: { equipo: pt, lista: cuarenta } })).json.agregados, 40);
  assert.equal((await req('/api/jugadores', { m: 'POST', token: cookies.admin, body: { equipo: pt, lista: 'Un more' } })).status, 400, 'límite 40');
  // borrar uno
  const j0 = jug[0];
  assert.equal((await req('/api/jugadores/' + j0.id, { m: 'DELETE', token: cookies.admin })).status, 200);
  assert.equal(((await req('/api/jugadores?equipo=' + newTeamId)).json).length, 3);
});

test('importar histórico: reset de b_*, validación por fila, duplicar y reiniciar', async () => {
  let r = await req('/api/comps', { m: 'POST', token: cookies.admin, body: { division: 'Cadete', torneo_id: 1 } });
  assert.equal(r.status, 201); const cad = r.json.id;
  for (const n of ['Rojo', 'Verde', 'Azul', 'Amarillo']) await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: cad, nombre: n } });
  assert.equal((await req('/api/importar', { m: 'POST', body: { comp: cad, filas: '' } })).status, 401, 'sin sesión');
  const filas = 'Rojo,Verde,3,1\nAzul,Amarillo,2,2\nFalso,Fantasma,1,0';
  r = await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas } });
  assert.equal(r.status, 200); assert.equal(r.json.importados, 2); assert.equal(r.json.errores.length, 1);
  let t = (await req('/api/tablas?comp=' + cad)).json;
  const rojo = t.find(x => x.nombre === 'Rojo'), verde = t.find(x => x.nombre === 'Verde'), azul = t.find(x => x.nombre === 'Azul');
  assert.equal(rojo.pts, 2); assert.equal(verde.pts, 0); assert.equal(azul.pts, 1, 'empate vale 1');
  assert.equal(rojo.pj, 1);
  // importar sin reset duplica los partidos (comportamiento esperado) y con reset vuelve a 1
  r = await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: 'Rojo,Verde,3,1\nAzul,Amarillo,2,2' } });
  assert.equal(r.json.importados, 2);
  t = (await req('/api/tablas?comp=' + cad)).json;
  assert.equal(t.find(x => x.nombre === 'Rojo').pj, 2, 'duplicado sin reset');
  r = await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: 'Rojo,Verde,3,1\nAzul,Amarillo,2,2', reset: true } });
  assert.equal(r.json.importados, 2);
  t = (await req('/api/tablas?comp=' + cad)).json;
  assert.equal(t.find(x => x.nombre === 'Rojo').pj, 1, 'reset de b_* evita la doble cuenta');
  // validaciones
  assert.equal((await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: 999999, filas: 'a,b,1,1' } })).status, 400);
  assert.equal((await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: '' } })).status, 400, 'sin filas');
  const loteLargo = Array.from({ length: 501 }, (_, i) => `Rojo,Verde,${i % 100},1`).join('\n');
  const big = await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: loteLargo } });
  assert.equal(big.status, 400, 'lote > 500 rechazado');
  // goles invalidos por fila: reportadas, no importadas
  r = await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: 'Rojo,Verde,abc,1\nAzul,Amarillo,,,  \nVerde,Amarillo,2, ' } });
  assert.equal(r.json.importados, 0); assert.equal(r.json.errores.length, 3, 'tres filas con goles inválidos');
  const imp = (await req('/api/importar', { m: 'POST', token: cookies.admin, body: { comp: cad, filas: 'rOjO , verde , 2,0', reset: true } }));
  assert.equal(imp.json.importados, 1, 'tolera espacios y mayúsculas');
});

test('duplicados: detecta iguales entre divisiones y parecidos (Chañá/Chaja, Cuadra/Cuadriya)', async () => {
  const d = (await req('/api/duplicados')).json;
  assert.ok(Array.isArray(d) && d.length > 0, 'hay avisos');
  const hayIgual = d.some(x => x.tipo === 'igual' && ((x.a.nombre === 'Técnico' && x.b.division !== x.a.division) || (x.b.nombre === 'Técnico' && x.a.division !== x.b.division)));
  assert.ok(hayIgual, 'Técnico aparece en varias divisiones');
  const par = (A, B) => d.some(x => [x.a.nombre, x.b.nombre].sort().join('|') === [A, B].sort().join('|'));
  assert.ok(par('El Chañá', 'El Chaja'), 'Chañá vs Chaja marcados como parecidos');
  assert.ok(par('La Cuadra', 'La Cuadriya'), 'Cuadra vs Cuadriya marcados');
  const menos = d.filter(x => x.tipo === 'igual').every(x => x.a.division !== x.b.division);
  assert.ok(menos, 'iguales siempre son entre divisiones distinta');
});

test('borrar equipo: libre con partidos y pagos se bloquea', async () => {
  let r = await req('/api/equipos', { m: 'POST', token: cookies.admin, body: { comp: (await req('/api/comps')).json.find(c => c.division === 'Cadete').id, nombre: 'Temporal FC' } });
  assert.equal(r.status, 201);
  assert.equal((await req('/api/equipos/' + r.json.id, { m: 'DELETE', token: cookies.planillero })).status, 403, 'planillero no da de baja');
  assert.equal((await req('/api/equipos/' + r.json.id, { m: 'DELETE', token: cookies.admin })).status, 200);
  const pb = (await req('/api/comps')).json.find(c => c.division === 'Primera B');
  const imp = (await req('/api/equipos?comp=' + pb.id)).json.find(e => e.nombre === 'Equipo Impar');
  assert.equal((await req('/api/equipos/' + imp.id, { m: 'DELETE', token: cookies.admin })).status, 409, 'con partidos generados no se borra');
  assert.equal((await req('/api/equipos/999999', { m: 'DELETE', token: cookies.admin })).status, 404);
});

test('borrar reserva, pago y usuario', async () => {
  const rv = (await req('/api/reservas')).json;
  assert.ok(rv.length >= 2);
  assert.equal((await req('/api/reservas/' + rv[0].id, { m: 'DELETE', token: cookies.planillero })).status, 403);
  assert.equal((await req('/api/reservas/' + rv[0].id, { m: 'DELETE', token: cookies.admin })).status, 200);
  assert.equal(((await req('/api/reservas')).json).some(x => x.id === rv[0].id), false);
  const pg = (await req('/api/pagos', { token: cookies.admin })).json;
  assert.ok(pg.length >= 1);
  assert.equal((await req('/api/pagos/' + pg[0].id, { m: 'DELETE', token: cookies.admin })).status, 200);
  assert.equal(((await req('/api/pagos', { token: cookies.admin })).json).some(x => x.id === pg[0].id), false);
  const us = (await req('/api/usuarios', { token: cookies.admin })).json;
  const yo = us.find(u => u.usuario === 'admin'), pl = us.find(u => u.usuario === 'planilla');
  assert.equal((await req('/api/usuarios/' + pl.id, { m: 'DELETE', token: cookies.planillero })).status, 403, 'planillero no borra usuarios');
  assert.equal((await req('/api/usuarios/' + yo.id, { m: 'DELETE', token: cookies.admin })).status, 400, 'no borro mi propio admin');
  assert.equal((await req('/api/usuarios/999999', { m: 'DELETE', token: cookies.admin })).status, 404);
  const t = (await req('/api/usuarios', { m: 'POST', token: cookies.admin, body: { usuario: 'temp-user', clave: 'clave-temporal-1', rol: 'planillero' } }));
  assert.equal(t.status, 201);
  const tid = (await req('/api/usuarios', { token: cookies.admin })).json.find(u => u.usuario === 'temp-user').id;
  assert.equal((await req('/api/usuarios/' + tid, { m: 'DELETE', token: cookies.admin })).status, 200);
  assert.equal(((await req('/api/usuarios', { token: cookies.admin })).json).some(u => u.usuario === 'temp-user'), false);
});

test('backup JSON: datos completos sin hashes', async () => {
  assert.equal((await req('/api/backup')).status, 401, 'sin sesión');
  assert.equal((await req('/api/backup', { token: cookies.planillero })).status, 403, 'solo admin');
  const r = await req('/api/backup', { token: cookies.admin });
  assert.equal(r.status, 200);
  const d = r.json.datos;
  for (const clave of ['torneos', 'comps', 'equipos', 'partidos', 'jugadores', 'sedes', 'reservas', 'pagos', 'usuarios', 'audit_log']) assert.ok(Array.isArray(d[clave]), 'contiene ' + clave);
  assert.ok(d.equipos.length >= 85, 'los equipos del seed + creados');
  assert.ok(d.usuarios.every(u => u.hash === undefined), 'no expone hashes');
});

test('resumen público: totales reales, próximos y recientes', async () => {
  const r = await req('/api/resumen');
  assert.equal(r.status, 200);
  const d = r.json;
  assert.ok(d.equipos > 80, 'equipos del seed');
  assert.ok(d.jugados > 0, 'hay partidos jugados en la suite');
  assert.ok(d.goles >= d.jugados, 'cada partido suma al menos 0 goles');
  assert.ok(Array.isArray(d.proximos) && d.proximos.length > 0, 'hay partidos programados');
  assert.ok(d.proximos.every(p => ['programado', 'reprogramado'].includes(p.estado)));
  assert.ok(Array.isArray(d.recientes) && d.recientes.length > 0);
  assert.ok(d.recientes.every(p => p.gl !== null && p.gv !== null));
  assert.ok(d.recientes[0].local_id && d.recientes[0].visit_id, 'incluye ids para enlazar equipos');
});

test('equipo público: ficha con plantel y partidos, 404 si no existe', async () => {
  const eq = (await req('/api/equipos?comp=1')).json[0];
  const r = await req('/api/equipos/' + eq.id);
  assert.equal(r.status, 200);
  assert.equal(r.json.id, eq.id); assert.equal(r.json.nombre, eq.nombre);
  assert.ok(r.json.division, 'incluye división');
  assert.ok(Array.isArray(r.json.jugadores));
  assert.ok(Array.isArray(r.json.partidos));
  assert.equal((await req('/api/equipos/999999')).status, 404);
});

// ---- Límite de intentos (al final porque afecta al IP) ----
test('límite de 8 intentos por minuto en login', async () => {
  let got429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await login('admin', 'intento-' + i);
    if (r.status === 429) { got429 = true; break; }
  }
  assert.equal(got429, true, 'aparece 429 antes de 8 intentos más los previos');
  assert.equal((await req('/api/health')).status, 200, 'el límite es por login, no por IP general');
});

let resultID, newTeamId, reservaID, sedeID, fixtureID;
