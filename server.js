// Futsal Tucumán · servidor sin dependencias (Node >= 22.13). Base de datos: SQLite.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000, PROD = process.env.NODE_ENV === 'production';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'futsal.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN('admin','planillero')), debe_cambiar INTEGER NOT NULL DEFAULT 0, token_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS torneos(id INTEGER PRIMARY KEY, nombre TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS comps(id INTEGER PRIMARY KEY, division TEXT NOT NULL, zona TEXT NOT NULL DEFAULT '', torneo_id INTEGER NOT NULL REFERENCES torneos(id), UNIQUE(division,zona,torneo_id));
CREATE TABLE IF NOT EXISTS equipos(id INTEGER PRIMARY KEY, comp_id INTEGER NOT NULL REFERENCES comps(id), nombre TEXT NOT NULL,
  b_pj INT DEFAULT 0, b_g INT DEFAULT 0, b_e INT DEFAULT 0, b_p INT DEFAULT 0, b_gf INT DEFAULT 0, b_gc INT DEFAULT 0,
  foto TEXT, color TEXT, delegado TEXT, telefono TEXT, UNIQUE(comp_id,nombre));
CREATE TABLE IF NOT EXISTS partidos(id INTEGER PRIMARY KEY, comp_id INTEGER NOT NULL REFERENCES comps(id),
  local_id INTEGER NOT NULL REFERENCES equipos(id), visit_id INTEGER NOT NULL REFERENCES equipos(id),
  gl INT NOT NULL CHECK(gl BETWEEN 0 AND 99), gv INT NOT NULL CHECK(gv BETWEEN 0 AND 99), por TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP, CHECK(local_id<>visit_id));
CREATE TABLE IF NOT EXISTS fixtures(id INTEGER PRIMARY KEY, comp_id INTEGER NOT NULL REFERENCES comps(id),
  fecha_num INTEGER NOT NULL, local_id INTEGER NOT NULL REFERENCES equipos(id), visit_id INTEGER NOT NULL REFERENCES equipos(id),
  fecha TEXT, hora TEXT, sede TEXT, cancha TEXT,
  estado TEXT NOT NULL DEFAULT 'programado' CHECK(estado IN ('programado','jugado','reprogramado','suspendido')),
  gl INT, gv INT, por TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP, CHECK(local_id<>visit_id));
CREATE TABLE IF NOT EXISTS reservas(id INTEGER PRIMARY KEY, sede TEXT NOT NULL, cancha TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, detalle TEXT DEFAULT '', UNIQUE(sede,cancha,fecha,hora));
CREATE TABLE IF NOT EXISTS pagos(id INTEGER PRIMARY KEY, equipo_id INTEGER NOT NULL REFERENCES equipos(id), concepto TEXT NOT NULL CHECK(concepto IN('Inscripción','Pago por partido')), monto REAL NOT NULL CHECK(monto>0), creado TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS jugadores(id INTEGER PRIMARY KEY, equipo_id INTEGER NOT NULL REFERENCES equipos(id), nombre TEXT NOT NULL, UNIQUE(equipo_id,nombre));
CREATE TABLE IF NOT EXISTS sedes(id INTEGER PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, canchas INTEGER NOT NULL DEFAULT 2 CHECK(canchas BETWEEN 1 AND 10));
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, usuario TEXT NOT NULL, accion TEXT NOT NULL, detalle TEXT, creado TEXT DEFAULT CURRENT_TIMESTAMP);`);

// ---- Seguridad: claves, hash, sesiones firmadas ----
const kf = path.join(DATA, 'secret.key');
if (!fs.existsSync(kf)) fs.writeFileSync(kf, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = process.env.SESSION_SECRET || fs.readFileSync(kf, 'utf8');
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const checkPw = (pw, h) => { const [s, k] = h.split(':'); const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(pw, s, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const mkToken = u => { const p = Buffer.from(JSON.stringify({ u: u.usuario, r: u.rol, c: u.debe_cambiar || 0, v: u.token_version || 0, e: Date.now() + 12 * 3600e3 })).toString('base64url'); return p + '.' + sign(p); };
function sesion(req) {
  const m = /(?:^|; )t=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [p, s] = m[1].split('.'); if (!p || !s || sign(p) !== s) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url')); if (o.e <= Date.now()) return null; const u = db.prepare('SELECT token_version FROM users WHERE usuario=?').get(o.u); if (!u || u.token_version !== o.v) return null; return { usuario: o.u, rol: o.r, debe_cambiar: o.c }; } catch { return null; }
}
const intentos = new Map();
function limite(ip) { const n = Date.now(), a = (intentos.get(ip) || []).filter(t => n - t < 60e3); a.push(n); intentos.set(ip, a); return a.length > 8; }

function audit(usuario, accion, detalle) {
  db.prepare('INSERT INTO audit_log(usuario,accion,detalle) VALUES(?,?,?)').run(usuario, accion, detalle || '');
}

// ---- Datos iniciales (tablas reales del Clausura 2026 como base) ----
if (!db.prepare('SELECT 1 FROM torneos').get()) {
  db.prepare('INSERT INTO torneos(nombre) VALUES(?)').run('Clausura 2026');
}
const torneoId = db.prepare('SELECT id FROM torneos WHERE nombre=?').get('Clausura 2026').id;
if (!db.prepare('SELECT 1 FROM comps').get()) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
  const ic = db.prepare('INSERT INTO comps(division,zona,torneo_id) VALUES(?,?,?)'), ie = db.prepare('INSERT INTO equipos(comp_id,nombre,b_pj,b_g,b_e,b_p,b_gf,b_gc) VALUES(?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for (const d in seed) for (const z in seed[d]) {
    const id = ic.run(d, z, torneoId).lastInsertRowid;
    for (const t of seed[d][z].split(';')) { const a = t.split(','); ie.run(id, a[0], ...a.slice(1).map(Number)); }
  }
  db.exec('COMMIT');
}
// Sedes por defecto
if (!db.prepare('SELECT 1 FROM sedes').get()) {
  const is = db.prepare('INSERT INTO sedes(nombre,canchas) VALUES(?,?)');
  for (const s of ['La Usina', 'La Diagonal', 'Complejo Avellaneda', 'Complejo Natalio Mirkin']) is.run(s, 2);
}
if (!db.prepare('SELECT 1 FROM users').get()) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  if (pw.length < 8) throw new Error('ADMIN_PASSWORD debe tener al menos 8 caracteres');
  db.prepare('INSERT INTO users(usuario,hash,rol,debe_cambiar) VALUES(?,?,?,1)').run('admin', hashPw(pw), 'admin');
  console.log(process.env.ADMIN_PASSWORD ? 'Usuario admin creado.' : `Usuario admin creado. Contraseña inicial: ${pw}  (cambiala y guardala ahora)`);
}

// ---- Lógica de tablas: base importada + partidos cargados ----
function tabla(compId) {
  const eq = db.prepare('SELECT * FROM equipos WHERE comp_id=?').all(compId), m = new Map();
  for (const e of eq) m.set(e.id, { id: e.id, nombre: e.nombre, pj: e.b_pj, g: e.b_g, e: e.b_e, p: e.b_p, gf: e.b_gf, gc: e.b_gc });
  for (const p of db.prepare('SELECT * FROM partidos WHERE comp_id=?').all(compId))
    for (const [id, f, c] of [[p.local_id, p.gl, p.gv], [p.visit_id, p.gv, p.gl]]) {
      const t = m.get(id); if (!t) continue; t.pj++; t.gf += f; t.gc += c; f > c ? t.g++ : f < c ? t.p++ : t.e++;
    }
  for (const fx of db.prepare('SELECT * FROM fixtures WHERE comp_id=? AND estado=?').all(compId, 'jugado'))
    for (const [id, f, c] of [[fx.local_id, fx.gl, fx.gv], [fx.visit_id, fx.gv, fx.gl]]) {
      const t = m.get(id); if (!t || fx.gl === null || fx.gv === null) continue; t.pj++; t.gf += f; t.gc += c; f > c ? t.g++ : f < c ? t.p++ : t.e++;
    }
  return [...m.values()].map(t => ({ ...t, pts: 2 * t.g + t.e, dg: t.gf - t.gc, revisar: t.pj !== t.g + t.e + t.p }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.nombre.localeCompare(b.nombre));
}

// ---- API ----
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 10000) { no(new Error('grande')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error('JSON inválido')); } }); });
const str = (v, max = 80) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;
const int = v => Number.isInteger(v) ? v : null;
const need = (s, ...roles) => { if (!s) throw { code: 401, msg: 'Iniciá sesión.' }; if (roles.length && !roles.includes(s.rol)) throw { code: 403, msg: 'No tenés permiso.' }; };

async function api(req, res, u) {
  const s = sesion(req), m = req.method, p = u.pathname;
  if (m === 'GET' && p === '/api/health') return json(res, 200, { ok: true });
  if (m === 'POST' && p === '/api/login') {
    if (limite(req.socket.remoteAddress)) return json(res, 429, { error: 'Demasiados intentos. Esperá un minuto.' });
    const b = await body(req), r = typeof b.usuario === 'string' && db.prepare('SELECT * FROM users WHERE usuario=?').get(b.usuario);
    if (!r || typeof b.clave !== 'string' || !checkPw(b.clave, r.hash)) return json(res, 401, { error: 'Usuario o clave incorrectos.' });
    res.setHeader('Set-Cookie', `t=${mkToken(r)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${PROD ? '; Secure' : ''}`);
    audit(r.usuario, 'login', '');
    return json(res, 200, { usuario: r.usuario, rol: r.rol, debe_cambiar: r.debe_cambiar });
  }
  if (m === 'POST' && p === '/api/logout') { res.setHeader('Set-Cookie', 't=; Max-Age=0; Path=/'); audit(s?.usuario || 'unknown', 'logout', ''); return json(res, 200, {}); }
  if (m === 'GET' && p === '/api/me') return json(res, 200, s || {});
  if (m === 'POST' && p === '/api/cambiar-clave') {
    need(s);
    const b = await body(req);
    if (typeof b.actual !== 'string' || typeof b.nueva !== 'string' || b.nueva.length < 8) return json(res, 400, { error: 'Clave actual y nueva (mín 8) requeridas.' });
    const u = db.prepare('SELECT * FROM users WHERE usuario=?').get(s.usuario);
    if (!checkPw(b.actual, u.hash)) return json(res, 401, { error: 'Clave actual incorrecta.' });
    db.prepare('UPDATE users SET hash=?, debe_cambiar=0, token_version=token_version+1 WHERE usuario=?').run(hashPw(b.nueva), s.usuario);
    audit(s.usuario, 'cambio_clave', '');
    const updated = db.prepare('SELECT * FROM users WHERE usuario=?').get(s.usuario);
    res.setHeader('Set-Cookie', `t=${mkToken(updated)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${PROD ? '; Secure' : ''}`);
    return json(res, 200, {});
  }
  if (m === 'GET' && p === '/api/comps') return json(res, 200, db.prepare('SELECT c.*, t.nombre torneo, (SELECT COUNT(*) FROM equipos WHERE comp_id=c.id) equipos FROM comps c JOIN torneos t ON t.id=c.torneo_id ORDER BY c.id').all());
  if (m === 'GET' && p === '/api/tablas') { const id = int(+u.searchParams.get('comp')); return id ? json(res, 200, tabla(id)) : json(res, 400, { error: 'Falta comp.' }); }
  if (m === 'GET' && p === '/api/partidos') return json(res, 200, db.prepare(`SELECT p.id,p.gl,p.gv,p.creado,c.division,c.zona,l.nombre local,v.nombre visitante FROM partidos p JOIN comps c ON c.id=p.comp_id JOIN equipos l ON l.id=p.local_id JOIN equipos v ON v.id=p.visit_id ORDER BY p.id DESC LIMIT 60`).all());
  if (m === 'GET' && p === '/api/equipos') return json(res, 200, db.prepare('SELECT id,nombre FROM equipos WHERE comp_id=? ORDER BY nombre').all(+u.searchParams.get('comp') || 0));
  if (m === 'POST' && p === '/api/resultados') {
    need(s, 'admin', 'planillero'); const b = await body(req), c = int(b.comp), l = int(b.local), v = int(b.visitante), gl = int(b.gl), gv = int(b.gv);
    if (!c || !l || !v || gl === null || gv === null || gl < 0 || gv < 0 || gl > 99 || gv > 99) return json(res, 400, { error: 'Datos inválidos.' });
    if (l === v) return json(res, 400, { error: 'El local y el visitante no pueden ser el mismo equipo.' });
    const ok = db.prepare('SELECT COUNT(*) n FROM equipos WHERE comp_id=? AND id IN(?,?)').get(c, l, v).n;
    if (ok !== 2) return json(res, 400, { error: 'Los equipos no pertenecen a esa división.' });
    const r = db.prepare('INSERT INTO partidos(comp_id,local_id,visit_id,gl,gv,por) VALUES(?,?,?,?,?,?)').run(c, l, v, gl, gv, s.usuario);
    audit(s.usuario, 'cargar_resultado', `${l} vs ${v} (${gl}-${gv})`);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  if (m === 'DELETE' && /^\/api\/resultados\/\d+$/.test(p)) { need(s, 'admin'); db.prepare('DELETE FROM partidos WHERE id=?').run(+p.split('/')[3]); audit(s.usuario, 'borrar_resultado', p.split('/')[3]); return json(res, 200, {}); }
  if (m === 'POST' && p === '/api/equipos') {
    need(s, 'admin'); const b = await body(req), c = int(b.comp), n = str(b.nombre);
    if (!c || !n) return json(res, 400, { error: 'Datos inválidos.' });
    if (!db.prepare('SELECT 1 FROM comps WHERE id=?').get(c)) return json(res, 400, { error: 'División inexistente.' });
    if (db.prepare('SELECT 1 FROM equipos WHERE comp_id=? AND lower(nombre)=lower(?)').get(c, n)) return json(res, 409, { error: 'Ya existe un equipo con ese nombre en esta división.' });
    const r = db.prepare('INSERT INTO equipos(comp_id,nombre) VALUES(?,?)').run(c, n);
    audit(s.usuario, 'inscribir_equipo', n);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  if (m === 'PATCH' && /^\/api\/equipos\/\d+$/.test(p)) {
    need(s, 'admin'); const id = +p.split('/')[3], b = await body(req);
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(b)) if (['nombre','foto','color','delegado','telefono'].includes(k) && v !== undefined) { sets.push(`${k}=?`); vals.push(str(v, k==='nombre'?80:500)); }
    if (!sets.length) return json(res, 400, { error: 'Nada para actualizar.' });
    if (sets.includes('nombre=?')) {
      const comp = db.prepare('SELECT comp_id FROM equipos WHERE id=?').get(id);
      if (db.prepare('SELECT 1 FROM equipos WHERE comp_id=? AND lower(nombre)=lower(?) AND id<>?').get(comp.comp_id, vals[sets.indexOf('nombre=?')], id)) return json(res, 409, { error: 'Nombre duplicado en la división.' });
    }
    vals.push(id); db.prepare(`UPDATE equipos SET ${sets.join(',')} WHERE id=?`).run(...vals);
    audit(s.usuario, 'editar_equipo', id);
    return json(res, 200, {});
  }
  if (m === 'GET' && p === '/api/equipos/detail') {
    const id = int(+u.searchParams.get('id'));
    if (!id) return json(res, 400, { error: 'Falta id.' });
    const eq = db.prepare(`SELECT e.*, c.division, c.zona, t.nombre torneo FROM equipos e JOIN comps c ON c.id=e.comp_id JOIN torneos t ON t.id=c.torneo_id WHERE e.id=?`).get(id);
    if (!eq) return json(res, 404, { error: 'No encontrado.' });
    const jugadores = db.prepare('SELECT id,nombre FROM jugadores WHERE equipo_id=? ORDER BY nombre').all(id);
    const partidos = db.prepare(`SELECT f.fecha_num, f.fecha, f.hora, f.sede, f.cancha, f.estado, f.gl, f.gv,
      l.nombre local, v.nombre visitante FROM fixtures f JOIN equipos l ON l.id=f.local_id JOIN equipos v ON v.id=f.visit_id WHERE f.comp_id=(SELECT comp_id FROM equipos WHERE id=?) AND (f.local_id=? OR f.visit_id=?) ORDER BY f.fecha_num`).all(id, id, id);
    return json(res, 200, { ...eq, jugadores, partidos });
  }
  if (m === 'DELETE' && /^\/api\/equipos\/\d+$/.test(p)) {
    need(s, 'admin'); const id = +p.split('/')[3];
    const eq = db.prepare('SELECT * FROM equipos WHERE id=?').get(id);
    if (!eq) return json(res, 404, { error: 'No encontrado.' });
    const tienePartidos = db.prepare('SELECT 1 FROM partidos WHERE local_id=? OR visit_id=?').get(id, id) || db.prepare('SELECT 1 FROM fixtures WHERE local_id=? OR visit_id=?').get(id, id);
    const tienePagos = db.prepare('SELECT 1 FROM pagos WHERE equipo_id=?').get(id);
    if (tienePartidos || tienePagos) return json(res, 409, { error: 'El equipo tiene partidos o pagos, no se puede borrar.' });
    db.prepare('DELETE FROM jugadores WHERE equipo_id=?').run(id);
    db.prepare('DELETE FROM equipos WHERE id=?').run(id);
    audit(s.usuario, 'borrar_equipo', eq.nombre);
    return json(res, 200, {});
  }
  if (m === 'GET' && p === '/api/reservas') return json(res, 200, db.prepare('SELECT * FROM reservas ORDER BY fecha,hora').all());
  if (m === 'POST' && p === '/api/reservas') {
    need(s, 'admin'); const b = await body(req), x = [str(b.sede), str(b.cancha, 20), str(b.fecha, 10), str(b.hora, 5)];
    if (x.includes(null) || !/^\d{4}-\d{2}-\d{2}$/.test(x[2]) || !/^\d{2}:\d{2}$/.test(x[3])) return json(res, 400, { error: 'Datos inválidos.' });
    try { const r = db.prepare('INSERT INTO reservas(sede,cancha,fecha,hora,detalle) VALUES(?,?,?,?,?)').run(...x, str(b.detalle, 120) || ''); audit(s.usuario, 'crear_reserva', `${x[0]} ${x[1]} ${x[2]} ${x[3]}`); return json(res, 201, { id: r.lastInsertRowid }); }
    catch (e) { return json(res, 409, { error: 'Superposición bloqueada: esa cancha ya está reservada en ese horario.' }); }
  }
  if (m === 'DELETE' && /^\/api\/reservas\/\d+$/.test(p)) { need(s, 'admin'); db.prepare('DELETE FROM reservas WHERE id=?').run(+p.split('/')[3]); audit(s.usuario, 'borrar_reserva', p.split('/')[3]); return json(res, 200, {}); }
  if (m === 'GET' && p === '/api/pagos') { need(s, 'admin'); return json(res, 200, db.prepare(`SELECT g.id,g.concepto,g.monto,g.creado,e.nombre equipo,c.division,c.zona,
    EXISTS(SELECT 1 FROM pagos x WHERE x.equipo_id=g.equipo_id AND x.concepto='Inscripción') habilitado FROM pagos g JOIN equipos e ON e.id=g.equipo_id JOIN comps c ON c.id=e.comp_id ORDER BY g.id DESC LIMIT 100`).all()); }
  if (m === 'POST' && p === '/api/pagos') {
    need(s, 'admin'); const b = await body(req), e = int(b.equipo), mo = Number(b.monto);
    if (!e || !(mo > 0) || !['Inscripción', 'Pago por partido'].includes(b.concepto)) return json(res, 400, { error: 'Datos inválidos.' });
    if (!db.prepare('SELECT 1 FROM equipos WHERE id=?').get(e)) return json(res, 400, { error: 'Equipo inexistente.' });
    const r = db.prepare('INSERT INTO pagos(equipo_id,concepto,monto) VALUES(?,?,?)').run(e, b.concepto, mo);
    audit(s.usuario, 'registrar_pago', `${b.concepto} $${mo}`);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  if (m === 'DELETE' && /^\/api\/pagos\/\d+$/.test(p)) { need(s, 'admin'); db.prepare('DELETE FROM pagos WHERE id=?').run(+p.split('/')[3]); audit(s.usuario, 'borrar_pago', p.split('/')[3]); return json(res, 200, {}); }
  if (m === 'POST' && p === '/api/usuarios') {
    need(s, 'admin'); const b = await body(req), n = str(b.usuario, 30);
    if (!n || typeof b.clave !== 'string' || b.clave.length < 8 || !['admin', 'planillero'].includes(b.rol)) return json(res, 400, { error: 'Usuario, rol y clave (mínimo 8 caracteres) son obligatorios.' });
    try { db.prepare('INSERT INTO users(usuario,hash,rol,debe_cambiar) VALUES(?,?,?,1)').run(n, hashPw(b.clave), b.rol); audit(s.usuario, 'crear_usuario', n); return json(res, 201, {}); }
    catch { return json(res, 409, { error: 'Ese usuario ya existe.' }); }
  }
  if (m === 'GET' && p === '/api/usuarios') { need(s, 'admin'); return json(res, 200, db.prepare('SELECT id,usuario,rol,debe_cambiar FROM users ORDER BY id').all()); }
  if (m === 'POST' && p === '/api/usuarios/reset') {
    need(s, 'admin'); const b = await body(req), n = str(b.usuario);
    if (!n) return json(res, 400, { error: 'Usuario requerido.' });
    const u = db.prepare('SELECT * FROM users WHERE usuario=?').get(n);
    if (!u) return json(res, 404, { error: 'Usuario no encontrado.' });
    if (b.clave !== undefined) {
      if (typeof b.clave !== 'string' || b.clave.length < 8) return json(res, 400, { error: 'Clave mínima 8 caracteres.' });
    }
    const nueva = b.clave && b.clave.length >= 8 ? b.clave : crypto.randomBytes(9).toString('base64url');
    db.prepare('UPDATE users SET hash=?, debe_cambiar=1, token_version=token_version+1 WHERE usuario=?').run(hashPw(nueva), n);
    audit(s.usuario, 'reset_clave', n);
    return json(res, 200, { clave: nueva });
  }
  if (m === 'DELETE' && /^\/api\/usuarios\/\d+$/.test(p)) {
    need(s, 'admin'); const id = +p.split('/')[3];
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return json(res, 404, { error: 'No encontrado.' });
    if (u.usuario === s.usuario) return json(res, 400, { error: 'No podés borrar tu propio usuario.' });
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    audit(s.usuario, 'borrar_usuario', u.usuario);
    return json(res, 200, {});
  }
  // ---- Fixture ----
  if (m === 'GET' && p === '/api/fixture') {
    const comp = int(+u.searchParams.get('comp'));
    if (!comp) return json(res, 400, { error: 'Falta comp.' });
    return json(res, 200, db.prepare(`SELECT f.*, l.nombre local, v.nombre visitante FROM fixtures f JOIN equipos l ON l.id=f.local_id JOIN equipos v ON v.id=f.visit_id WHERE f.comp_id=? ORDER BY f.fecha_num, f.id`).all(comp));
  }
  if (m === 'POST' && p === '/api/fixture') {
    need(s, 'admin'); const b = await body(req), c = int(b.comp), fn = int(b.fecha_num), l = int(b.local), v = int(b.visitante);
    if (!c || !fn || !l || !v || fn < 1 || l === v) return json(res, 400, { error: 'Datos inválidos.' });
    const ok = db.prepare('SELECT COUNT(*) n FROM equipos WHERE comp_id=? AND id IN(?,?)').get(c, l, v).n;
    if (ok !== 2) return json(res, 400, { error: 'Equipos no pertenecen a la división.' });
    const r = db.prepare('INSERT INTO fixtures(comp_id,fecha_num,local_id,visit_id,fecha,hora,sede,cancha,estado) VALUES(?,?,?,?,?,?,?,?,?)').run(c, fn, l, v, str(b.fecha) || null, str(b.hora) || null, str(b.sede) || null, str(b.cancha) || null, 'programado');
    audit(s.usuario, 'programar_partido', `${l} vs ${v} fecha ${fn}`);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  if (m === 'POST' && p === '/api/fixture/round') {
    need(s, 'admin'); const b = await body(req), c = int(b.comp);
    if (!c) return json(res, 400, { error: 'Falta comp.' });
    const existing = db.prepare('SELECT 1 FROM fixtures WHERE comp_id=?').get(c);
    if (existing) return json(res, 409, { error: 'Ya existe fixture para esta división.' });
    const eqs = db.prepare('SELECT id,nombre FROM equipos WHERE comp_id=? ORDER BY nombre').all(c);
    if (eqs.length < 2) return json(res, 400, { error: 'Mínimo 2 equipos.' });
    const doble = !!b.doble;
    const baseFecha = str(b.fecha) || null;
    const ids = eqs.map(e => e.id);
    const n = ids.length;
    const pares = [];
    if (n % 2 === 1) ids.push(null); // BYE
    const totalRondas = n % 2 === 1 ? n : n - 1;
    const rondas = doble ? totalRondas * 2 : totalRondas;
    for (let r = 0; r < totalRondas; r++) {
      for (let i = 0; i < ids.length / 2; i++) {
        const a = ids[i], b2 = ids[ids.length - 1 - i];
        if (a && b2) pares.push([a, b2]);
      }
      ids.splice(1, 0, ids.pop());
    }
    if (doble) {
      const len = pares.length;
      for (let i = 0; i < len; i++) pares.push([pares[i][1], pares[i][0]]);
    }
    db.exec('BEGIN');
    for (let i = 0; i < pares.length; i++) {
      const [l, v] = pares[i];
      const fn = Math.floor(i / (n % 2 === 1 ? (n - 1) / 2 : n / 2)) + 1;
      let fecha = null, hora = null, sede = null, cancha = null;
      if (baseFecha) {
        const d = new Date(baseFecha);
        d.setDate(d.getDate() + (fn - 1) * 7);
        fecha = d.toISOString().split('T')[0];
      }
      db.prepare('INSERT INTO fixtures(comp_id,fecha_num,local_id,visit_id,fecha,hora,sede,cancha,estado) VALUES(?,?,?,?,?,?,?,?,?)').run(c, fn, l, v, fecha, hora, sede, cancha, 'programado');
    }
    db.exec('COMMIT');
    audit(s.usuario, 'generar_fixture', `comp ${c} ${doble?'doble':'simple'} ${pares.length} partidos ${rondas} rondas`);
    return json(res, 201, { partidos: pares.length, rondas });
  }
  if (m === 'PATCH' && /^\/api\/fixture\/\d+$/.test(p)) {
    need(s); const id = +p.split('/')[3], b = await body(req);
    const fx = db.prepare('SELECT * FROM fixtures WHERE id=?').get(id);
    if (!fx) return json(res, 404, { error: 'No encontrado.' });
    const hasUpdate = b.estado !== undefined || b.fecha !== undefined || b.hora !== undefined || b.fecha_num !== undefined || b.gl !== undefined || b.gv !== undefined;
    if (!hasUpdate) return json(res, 400, { error: 'Nada para actualizar.' });
    if ((b.gl !== undefined || b.gv !== undefined) && (b.fecha !== undefined || b.fecha_num !== undefined)) return json(res, 400, { error: 'Goles y fecha no se mandan juntos.' });
    if (b.estado) {
      if (!['programado','jugado','reprogramado','suspendido'].includes(b.estado)) return json(res, 400, { error: 'Estado inválido.' });
      if (b.estado === 'jugado') {
        if (s.rol !== 'admin' && s.rol !== 'planillero') return json(res, 403, { error: 'No tenés permiso.' });
        if (fx.gl !== null || fx.gv !== null) return json(res, 409, { error: 'El partido ya tiene resultado.' });
        if (b.gl === undefined || b.gv === undefined) return json(res, 400, { error: 'Para marcar como jugado se requieren goles (gl, gv).' });
      }
      if (b.estado !== 'jugado' && s.rol !== 'admin') return json(res, 403, { error: 'Solo admin cambia estado.' });
      if (fx.estado === 'jugado' && b.estado !== 'jugado') return json(res, 409, { error: 'No se puede cambiar estado de un partido jugado sin borrar el resultado.' });
      db.prepare('UPDATE fixtures SET estado=? WHERE id=?').run(b.estado, id);
      audit(s.usuario, 'cambiar_estado_fixture', `${id} -> ${b.estado}`);
    }
    if (b.fecha) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return json(res, 400, { error: 'Formato de fecha inválido (YYYY-MM-DD).' });
      if (s.rol !== 'admin') return json(res, 403, { error: 'Solo admin reprograma.' });
      if (fx.estado === 'jugado') return json(res, 409, { error: 'No se reprograma un partido jugado.' });
      db.prepare('UPDATE fixtures SET fecha=?, estado=? WHERE id=?').run(b.fecha, 'reprogramado', id);
      audit(s.usuario, 'reprogramar_partido', `${id} -> ${b.fecha}`);
    }
    if (b.hora) {
      if (!/^\d{2}:\d{2}$/.test(b.hora)) return json(res, 400, { error: 'Formato de hora inválido (HH:MM).' });
      if (s.rol !== 'admin') return json(res, 403, { error: 'Solo admin.' });
      db.prepare('UPDATE fixtures SET hora=? WHERE id=?').run(b.hora, id);
    }
    if (b.fecha_num !== undefined) {
      if (s.rol !== 'admin') return json(res, 403, { error: 'Solo admin.' });
      if (!Number.isInteger(b.fecha_num) || b.fecha_num < 1) return json(res, 400, { error: 'Fecha numérica inválida.' });
      db.prepare('UPDATE fixtures SET fecha_num=? WHERE id=?').run(b.fecha_num, id);
    }
    if (b.gl !== undefined || b.gv !== undefined) {
      if (fx.estado === 'jugado') return json(res, 409, { error: 'Resultado ya cargado.' });
      const gl = int(b.gl), gv = int(b.gv);
      if (gl === null || gv === null || gl < 0 || gv < 0 || gl > 99 || gv > 99) return json(res, 400, { error: 'Goles inválidos (0-99).' });
      if (s.rol !== 'admin' && s.rol !== 'planillero') return json(res, 403, { error: 'No tenés permiso.' });
      const newEstado = b.estado || 'jugado';
      db.prepare('UPDATE fixtures SET gl=?, gv=?, por=?, estado=? WHERE id=?').run(gl, gv, s.usuario, newEstado, id);
      audit(s.usuario, 'cargar_resultado_fixture', `${fx.local_id} vs ${fx.visit_id} (${gl}-${gv})`);
    }
    return json(res, 200, {});
  }
  if (m === 'DELETE' && /^\/api\/fixture\/\d+$/.test(p)) {
    need(s, 'admin'); const id = +p.split('/')[3];
    const fx = db.prepare('SELECT * FROM fixtures WHERE id=?').get(id);
    if (!fx) return json(res, 404, { error: 'No encontrado.' });
    if (fx.estado === 'jugado') return json(res, 409, { error: 'No se borra un partido jugado.' });
    db.prepare('DELETE FROM fixtures WHERE id=?').run(id);
    audit(s.usuario, 'borrar_fixture', id);
    return json(res, 200, {});
  }
  // ---- Auditoría ----
  if (m === 'GET' && p === '/api/audit') {
    need(s, 'admin'); return json(res, 200, db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all());
  }
  // ---- Importar histórico ----
  if (m === 'POST' && p === '/api/importar') {
    need(s, 'admin'); const b = await body(req), c = int(b.comp), reset = !!b.reset;
    if (!c) return json(res, 400, { error: 'Falta comp.' });
    if (!db.prepare('SELECT 1 FROM comps WHERE id=?').get(c)) return json(res, 400, { error: 'División inexistente.' });
    const filas = (b.filas || '').trim().split('\n').filter(l => l.trim());
    if (!filas.length) return json(res, 400, { error: 'Sin filas.' });
    if (filas.length > 500) return json(res, 400, { error: 'Lote mayor a 500 filas.' });
    if (reset) {
      db.prepare('UPDATE equipos SET b_pj=0,b_g=0,b_e=0,b_p=0,b_gf=0,b_gc=0 WHERE comp_id=?').run(c);
      db.prepare('DELETE FROM partidos WHERE comp_id=? AND por=?').run(c, 'importacion');
    }
    let importados = 0, errores = [];
    for (let i = 0; i < filas.length; i++) {
      const partes = filas[i].split(',').map(x => x.trim());
      if (partes.length !== 4) { errores.push({ fila: i+1, error: 'Formato: local,visitante,goles_local,goles_visitante' }); continue; }
      const [local, visitante, gls, gvs] = partes;
      const gl = parseInt(gls), gv = parseInt(gvs);
      if (isNaN(gl) || isNaN(gv) || gl < 0 || gl > 99 || gv < 0 || gv > 99) { errores.push({ fila: i+1, error: 'Goles inválidos (0-99)' }); continue; }
      const eqL = db.prepare('SELECT id FROM equipos WHERE comp_id=? AND lower(nombre)=lower(?)').get(c, local);
      const eqV = db.prepare('SELECT id FROM equipos WHERE comp_id=? AND lower(nombre)=lower(?)').get(c, visitante);
      if (!eqL || !eqV) { errores.push({ fila: i+1, error: 'Equipo no encontrado' }); continue; }
      if (eqL.id === eqV.id) { errores.push({ fila: i+1, error: 'Local y visitante iguales' }); continue; }
      db.prepare('INSERT INTO partidos(comp_id,local_id,visit_id,gl,gv,por) VALUES(?,?,?,?,?,?)').run(c, eqL.id, eqV.id, gl, gv, 'importacion');
      importados++;
    }
    audit(s.usuario, 'importar_historico', `comp ${c} ${importados} ok ${errores.length} errores`);
    return json(res, 200, { importados, errores });
  }
  // ---- Duplicados ----
  if (m === 'GET' && p === '/api/duplicados') {
    const avisos = [];
    const todos = db.prepare(`SELECT e.id, e.nombre, c.division, c.zona FROM equipos e JOIN comps c ON c.id=e.comp_id ORDER BY e.nombre`).all();
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
    for (let i = 0; i < todos.length; i++) {
      for (let j = i+1; j < todos.length; j++) {
        const a = todos[i], b = todos[j];
        const na = norm(a.nombre), nb = norm(b.nombre);
        if (na === nb) {
          if (a.division !== b.division || a.zona !== b.zona) avisos.push({ tipo: 'igual', a: { nombre: a.nombre, division: a.division, zona: a.zona }, b: { nombre: b.nombre, division: b.division, zona: b.zona } });
        } else {
          // Similares: uno contenido en otro, o distancia de Levenshtein <= 2, o comparten raíz de 4+ chars
          const lenA = na.length, lenB = nb.length;
          const minLen = Math.min(lenA, lenB);
          const maxLen = Math.max(lenA, lenB);
          let similar = false;
          if (minLen >= 4 && (na.includes(nb) || nb.includes(na))) similar = true;
          else if (maxLen <= 10) {
            // Levenshtein simple
            let dp = Array.from({length: lenA+1}, (_,i) => Array.from({length: lenB+1}, (_,j) => i===0?j:j===0?i:0));
            for (let x=1;x<=lenA;x++) for (let y=1;y<=lenB;y++) dp[x][y] = na[x-1]===nb[y-1] ? dp[x-1][y-1] : 1+Math.min(dp[x-1][y], dp[x][y-1], dp[x-1][y-1]);
            if (dp[lenA][lenB] <= 2) similar = true;
          }
          if (similar) avisos.push({ tipo: 'parecido', a: { nombre: a.nombre, division: a.division, zona: a.zona }, b: { nombre: b.nombre, division: b.division, zona: b.zona } });
        }
      }
    }
    return json(res, 200, avisos);
  }
  // ---- Torneos ----
  if (m === 'GET' && p === '/api/torneos') {
    return json(res, 200, db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM comps WHERE torneo_id=t.id) comps FROM torneos t ORDER BY t.id`).all());
  }
  if (m === 'POST' && p === '/api/torneos') {
    need(s, 'admin'); const b = await body(req), n = str(b.nombre);
    if (!n) return json(res, 400, { error: 'Nombre requerido.' });
    if (db.prepare('SELECT 1 FROM torneos WHERE lower(nombre)=lower(?)').get(n)) return json(res, 409, { error: 'Torneo ya existe.' });
    const r = db.prepare('INSERT INTO torneos(nombre) VALUES(?)').run(n);
    audit(s.usuario, 'crear_torneo', n);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  // ---- Divisiones (comps) administrables ----
  if (m === 'POST' && p === '/api/comps') {
    need(s, 'admin'); const b = await body(req), div = str(b.division), zona = str(b.zona) || '';
    if (!div) return json(res, 400, { error: 'División requerida.' });
    let torneoId = int(b.torneo_id);
    if (!torneoId && b.torneo) {
      const t = db.prepare('SELECT id FROM torneos WHERE lower(nombre)=lower(?)').get(str(b.torneo));
      if (t) torneoId = t.id;
    }
    if (!torneoId) return json(res, 400, { error: 'Torneo requerido.' });
    if (!db.prepare('SELECT 1 FROM torneos WHERE id=?').get(torneoId)) return json(res, 400, { error: 'Torneo inexistente.' });
    try { const r = db.prepare('INSERT INTO comps(division,zona,torneo_id) VALUES(?,?,?)').run(div, zona, torneoId); audit(s.usuario, 'crear_division', `${div} ${zona} torneo ${torneoId}`); return json(res, 201, { id: r.lastInsertRowid }); }
    catch { return json(res, 409, { error: 'División/zona ya existe en ese torneo.' }); }
  }
  if (m === 'DELETE' && /^\/api\/comps\/\d+$/.test(p)) {
    need(s, 'admin'); const id = +p.split('/')[3];
    const c = db.prepare('SELECT * FROM comps WHERE id=?').get(id);
    if (!c) return json(res, 404, { error: 'No encontrada.' });
    const equipos = db.prepare('SELECT 1 FROM equipos WHERE comp_id=?').get(id);
    if (equipos) return json(res, 409, { error: 'La división tiene equipos, no se puede borrar.' });
    db.prepare('DELETE FROM comps WHERE id=?').run(id);
    audit(s.usuario, 'borrar_division', `${c.division} ${c.zona}`);
    return json(res, 200, {});
  }
  // ---- Jugadores / Plantel ----
  if (m === 'GET' && p === '/api/jugadores') {
    const eq = int(+u.searchParams.get('equipo'));
    if (!eq) return json(res, 400, { error: 'Falta equipo.' });
    return json(res, 200, db.prepare('SELECT id,nombre FROM jugadores WHERE equipo_id=? ORDER BY nombre').all(eq));
  }
  if (m === 'POST' && p === '/api/jugadores') {
    need(s, 'admin'); const b = await body(req), eq = int(b.equipo);
    if (!eq) return json(res, 400, { error: 'Falta equipo.' });
    if (!db.prepare('SELECT 1 FROM equipos WHERE id=?').get(eq)) return json(res, 400, { error: 'Equipo inexistente.' });
    const lista = (b.lista || '').split(/[\n;,]+/).map(x => x.trim()).filter(Boolean);
    if (!lista.length) return json(res, 400, { error: 'Lista vacía.' });
    const actuales = db.prepare('SELECT COUNT(*) c FROM jugadores WHERE equipo_id=?').get(eq).c;
    if (actuales + lista.length > 40) return json(res, 400, { error: 'Límite de 40 jugadores por equipo.' });
    let agregados = 0;
    for (const n of lista) {
      try { db.prepare('INSERT INTO jugadores(equipo_id,nombre) VALUES(?,?)').run(eq, n); agregados++; } catch {}
    }
    audit(s.usuario, 'cargar_plantel', `equipo ${eq} ${agregados} jugadores`);
    return json(res, 201, { agregados, total: actuales + agregados });
  }
  if (m === 'DELETE' && /^\/api\/jugadores\/\d+$/.test(p)) {
    need(s, 'admin'); db.prepare('DELETE FROM jugadores WHERE id=?').run(+p.split('/')[3]); audit(s.usuario, 'borrar_jugador', p.split('/')[3]); return json(res, 200, {});
  }
  // ---- Sedes CRUD ----
  if (m === 'GET' && p === '/api/sedes') {
    return json(res, 200, db.prepare('SELECT * FROM sedes ORDER BY nombre').all());
  }
  if (m === 'POST' && p === '/api/sedes') {
    need(s, 'admin'); const b = await body(req), n = str(b.nombre);
    if (!n) return json(res, 400, { error: 'Nombre requerido.' });
    if (db.prepare('SELECT 1 FROM sedes WHERE lower(nombre)=lower(?)').get(n)) return json(res, 409, { error: 'Sede ya existe.' });
    if (b.canchas === undefined) return json(res, 400, { error: 'Canchas requerido.' });
    const c = int(b.canchas);
    if (c === null || c < 1 || c > 10) return json(res, 400, { error: 'Canchas entre 1 y 10.' });
    const r = db.prepare('INSERT INTO sedes(nombre,canchas) VALUES(?,?)').run(n, c);
    audit(s.usuario, 'crear_sede', n);
    return json(res, 201, { id: r.lastInsertRowid });
  }
  if (m === 'DELETE' && /^\/api\/sedes\/\d+$/.test(p)) {
    need(s, 'admin'); db.prepare('DELETE FROM sedes WHERE id=?').run(+p.split('/')[3]); audit(s.usuario, 'borrar_sede', p.split('/')[3]); return json(res, 200, {});
  }
  // ---- Backup ----
  if (m === 'GET' && p === '/api/backup') {
    need(s, 'admin');
    const datos = {
      torneos: db.prepare('SELECT * FROM torneos').all(),
      comps: db.prepare('SELECT * FROM comps').all(),
      equipos: db.prepare('SELECT * FROM equipos').all(),
      partidos: db.prepare('SELECT * FROM partidos').all(),
      fixtures: db.prepare('SELECT * FROM fixtures').all(),
      jugadores: db.prepare('SELECT * FROM jugadores').all(),
      sedes: db.prepare('SELECT * FROM sedes').all(),
      reservas: db.prepare('SELECT * FROM reservas').all(),
      pagos: db.prepare('SELECT * FROM pagos').all(),
      usuarios: db.prepare('SELECT id,usuario,rol,debe_cambiar FROM users').all(),
      audit_log: db.prepare('SELECT * FROM audit_log').all(),
    };
    return json(res, 200, { datos });
  }
  // ---- Resumen público ----
  if (m === 'GET' && p === '/api/resumen') {
    const equipos = db.prepare('SELECT COUNT(*) c FROM equipos').get().c;
    const jugadosPartidos = db.prepare('SELECT COUNT(*) c FROM partidos').get().c;
    const jugadosFixtures = db.prepare("SELECT COUNT(*) c FROM fixtures WHERE estado='jugado'").get().c;
    const jugados = jugadosPartidos + jugadosFixtures;
    const golesPartidos = db.prepare('SELECT SUM(gl+gv) s FROM partidos').get().s || 0;
    const golesFixtures = db.prepare("SELECT SUM(gl+gv) s FROM fixtures WHERE estado='jugado'").get().s || 0;
    const goles = golesPartidos + golesFixtures;
    const proximos = db.prepare(`SELECT f.*, l.nombre local, v.nombre visitante FROM fixtures f JOIN equipos l ON l.id=f.local_id JOIN equipos v ON v.id=f.visit_id WHERE f.estado IN ('programado','reprogramado') ORDER BY f.fecha, f.hora LIMIT 10`).all();
    const recientes = db.prepare(`SELECT p.*, l.nombre local, v.nombre visitante FROM partidos p JOIN equipos l ON l.id=p.local_id JOIN equipos v ON v.id=p.visit_id ORDER BY p.id DESC LIMIT 10`).all();
    return json(res, 200, { equipos, jugados, goles, proximos, recientes });
  }
  // ---- Equipo público ----
  if (m === 'GET' && /^\/api\/equipos\/\d+$/.test(p)) {
    const id = +p.split('/')[3];
    const eq = db.prepare(`SELECT e.*, c.division, c.zona, t.nombre torneo FROM equipos e JOIN comps c ON c.id=e.comp_id JOIN torneos t ON t.id=c.torneo_id WHERE e.id=?`).get(id);
    if (!eq) return json(res, 404, { error: 'No encontrado.' });
    const jugadores = db.prepare('SELECT id,nombre FROM jugadores WHERE equipo_id=? ORDER BY nombre').all(id);
    const partidos = db.prepare(`SELECT f.fecha_num, f.fecha, f.hora, f.sede, f.cancha, f.estado, f.gl, f.gv,
      l.nombre local, v.nombre visitante FROM fixtures f JOIN equipos l ON l.id=f.local_id JOIN equipos v ON v.id=f.visit_id WHERE f.comp_id=(SELECT comp_id FROM equipos WHERE id=?) AND (f.local_id=? OR f.visit_id=?) ORDER BY f.fecha_num`).all(id, id, id);
    return json(res, 200, { ...eq, jugadores, partidos });
  }
  return json(res, 404, { error: 'No encontrado.' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    let f = path.normalize(path.join(__dirname, 'public', u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (e && e.code && e.msg) return json(res, e.code, { error: e.msg });
    console.error(e); json(res, 500, { error: 'Error interno.' });
  }
}).listen(PORT, () => console.log(`Futsal Tucumán en http://localhost:${PORT}`));

module.exports = { server, db };
