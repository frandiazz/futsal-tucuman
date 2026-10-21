// Detecta colisiones de binding en un mismo modulo ES:
// un identificador declarado localmente Y tambien importado.
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

const problems = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // Identificadores importados
  const imported = new Set();
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}\s*)?from\s*['"][^'"]+['"]/g)) {
    if (m[1]) imported.add(m[1]);
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const as = t.split(/\s+as\s+/);
        imported.add((as[1] || as[0]).trim());
      }
    }
  }

  // Identificadores declarados localmente (function / const / let / var / class)
  const declared = new Map();
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
    const name = m[1];
    if (!declared.has(name)) declared.set(name, []);
    declared.get(name).push(m[0].trim());
  }

  for (const [name, decls] of declared) {
    if (imported.has(name)) {
      problems.push(`${rel}: '${name}' se importa y tambien se declara localmente (${decls.length}x)`);
    }
    if (decls.length > 1) {
      problems.push(`${rel}: '${name}' declarado ${decls.length} veces en el mismo modulo`);
    }
  }
}

if (problems.length) {
  console.log('COLISIONES:\n' + problems.map(p => '  x ' + p).join('\n'));
  process.exit(1);
}
console.log('OK: sin colisiones de binding');
