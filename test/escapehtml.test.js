// Verifica que todas las implementaciones de escapeHtml escapan correctamente.
// Detecta el bug donde las entidades HTML fueron decodificadas por una herramienta.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'public');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.js')) files.push(full);
  }
})(ROOT);

const REQUIRED = ['&amp;', '&lt;', '&gt;', '&quot;', '&#039;'];
const problems = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // Solo verificar archivos que DEFINEN escapeHtml (los que solo lo importan
  // reciben la implementacion canonica de components/index.js)
  if (!/^(?:export\s+)?function\s+escapeHtml\s*\(/m.test(src)) continue;

  // Todas las entidades deben estar presentes
  const missing = REQUIRED.filter(e => !src.includes(e));
  if (missing.length) {
    problems.push(`${rel}: faltan entidades ${missing.join(', ')}`);
  }

  // Detectar el patron roto: .replace(/&/g, '&') sin entidad
  if (/\.replace\(\/&\/g,\s*'&'\)/.test(src)) {
    problems.push(`${rel}: replace de '&' sin '&amp;' (escapeHtml roto)`);
  }
  if (/\.replace\(\/<\/g,\s*'<'\)/.test(src)) {
    problems.push(`${rel}: replace de '<' sin '&lt;' (escapeHtml roto)`);
  }
  if (/\.replace\(\/">\/g,\s*'>'\)/.test(src)) {
    problems.push(`${rel}: replace de '>' sin '&gt;' (escapeHtml roto)`);
  }
}

// Verificar que existe una unica definicion canonica
const canonical = path.join(ROOT, 'js', 'components', 'index.js');
const canonicalSrc = fs.readFileSync(canonical, 'utf8');
if (!/HTML_ENTITIES/.test(canonicalSrc) || !/&amp;/.test(canonicalSrc)) {
  problems.push('js/components/index.js: la implementacion canonica de escapeHtml esta rota');
}

// Contar definiciones duplicadas en todo el proyecto
let definitions = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const n = (src.match(/^(?:export\s+)?function\s+escapeHtml\s*\(/gm) || []).length;
  definitions += n;
  if (n > 1) problems.push(`${path.relative(ROOT, file)}: ${n} definiciones de escapeHtml (debe haber 1)`);
}
if (definitions !== 1) {
  problems.push(`Se esperaba 1 sola definicion de escapeHtml, hay ${definitions}`);
}

if (problems.length) {
  console.log('PROBLEMAS EN escapeHtml:\n' + problems.map(p => '  x ' + p).join('\n'));
  process.exit(1);
}
console.log('OK: todos los escapeHtml escapan & < > " \'');
