// Verifica que todos los imports de los módulos ESM resuelvan
// a archivos existentes y a exports realmente declarados.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'public');
const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const exportsCache = new Map();

function getExports(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();

  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  // export const/let/function/class X
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  // export default
  if (/export\s+default\b/.test(src)) names.add('default');
  // export * from
  const star = /export\s+\*\s+from\s+['"]([^'"]+)['"]/.exec(src);

  exportsCache.set(file, { names, star: star ? star[1] : null });
  return exportsCache.get(file);
}

function resolveExport(target, name, seen = new Set()) {
  if (seen.has(target)) return false;
  seen.add(target);
  const { names, star } = getExports(target);
  if (names.has(name)) return true;
  if (star) {
    const starPath = path.resolve(path.dirname(target), star);
    if (fs.existsSync(starPath)) return resolveExport(starPath, name, seen);
  }
  return false;
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // static imports
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}\s*)?from\s*['"]([^'"]+)['"]/g)) {
    const [, defaultImport, namedBlock, spec] = m;
    if (!spec.startsWith('.')) continue; // bare specifier = package
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) {
      errors.push(`${rel}: import "${spec}" -> archivo no existe`);
      continue;
    }
    if (namedBlock) {
      for (const part of namedBlock.split(',')) {
        const t = part.trim();
        if (!t) continue;
        const name = t.split(/\s+as\s+/)[0].trim();
        if (!resolveExport(target, name)) {
          errors.push(`${rel}: import { ${name} } from "${spec}" -> no se exporta`);
        }
      }
    }
  }

  // dynamic imports
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) {
      errors.push(`${rel}: import dinamico "${spec}" -> archivo no existe`);
    }
  }
}

// Deteccion de uso de createFormField dentro de template strings (bug silencioso)
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const m of src.matchAll(/\$\{createFormField\(/g)) {
    errors.push(`${rel}: createFormField() usado en template string (devuelve HTMLElement, usar formFieldHtml())`);
  }
}

if (errors.length) {
  console.log('ERRORES:\n' + errors.map(e => '  ✗ ' + e).join('\n'));
} else {
  console.log('✓ Todos los imports resuelven correctamente');
}
if (warnings.length) console.log('AVISOS:\n' + warnings.map(w => '  ! ' + w).join('\n'));
process.exit(errors.length ? 1 : 0);
