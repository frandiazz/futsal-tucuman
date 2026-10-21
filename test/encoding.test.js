// Verifica que no queden caracteres corruptos (CJK, mojibake) ni entidades rotas
// en los archivos de texto del proyecto.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXTS = new Set(['.js', '.html', '.css', '.json', '.md', '.yaml', '.yml', '.svg']);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (EXTS.has(path.extname(e.name))) files.push(full);
  }
})(ROOT);

const problems = [];

// Rangos de caracteres CJK, hiragana, katakana, hangul, cirílico, árabe, hebreo
const SUSPECT = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u0400-\u04FF\u0600-\u06FF\u0590-\u05FF]/;

for (const file of files) {
  // Este archivo contiene los patrones que busca: no auto-verificarse
  if (file === __filename) continue;

  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    const m = SUSPECT.exec(line);
    if (m) {
      problems.push(`${rel}:${i + 1}: caracter suspecto "${m[0]}" (U+${m[0].codePointAt(0).toString(16).toUpperCase()})`);
    }
  });

  // Mojibake tipico: Acentos rotos en formato Latin-1 interpretado como UTF-8
  if (/Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Â°|â€|Ã"|Ã©/.test(src)) {
    problems.push(`${rel}: posible mojibake (secuencias UTF-8 interpretadas como Latin-1)`);
  }

  // Caracter de reemplazo Unicode
  if (src.includes('\uFFFD')) {
    problems.push(`${rel}: contiene U+FFFD (caracter de reemplazo)`);
  }
}

// Verificar coherencia de comillas balanceadas en HTML (sanity check)
for (const file of files.filter(f => f.endsWith('.html'))) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const open = (src.match(/<div\b/g) || []).length;
  const close = (src.match(/<\/div>/g) || []).length;
  if (open !== close) problems.push(`${rel}: ${open} <div> vs ${close} </div>`);
}

if (problems.length) {
  console.log('PROBLEMAS:\n' + problems.map(p => '  x ' + p).join('\n'));
  process.exit(1);
}
console.log(`OK: ${files.length} archivos limpios (sin caracteres corruptos ni HTML desbalanceado)`);
