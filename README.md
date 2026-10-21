# Futsal Tucumán · plataforma web

Sistema web para la **Asociación Tucumana de Fútbol de Salón** (@tucumanfutsal, fundada en 2011, CAFS).
Servidor Node.js sin dependencias externas + base de datos SQLite + frontend modular con JavaScript nativo.
Requiere **Node 22.13 o superior**.

> Sitio **no oficial** hasta contar con autorización de la asociación.

---

## Probar en tu computadora

```bash
ADMIN_PASSWORD="una-clave-de-8-o-mas" node server.js
```

Abrí <http://localhost:3000> y entrá por "Ingresar" con usuario `admin`.
Si no definís `ADMIN_PASSWORD`, la primera vez se genera una y se imprime en la consola.

---

## Arquitectura

```
futsal-tucuman/
├── server.js              # API + servidor estático (sin dependencias)
├── seed.json              # Tablas reales del Clausura 2026 (base de cálculo)
├── render.yaml            # Configuración de deploy (Render)
├── data/                  # futsal.db + secret.key (generados, NO versionar)
├── public/                # Frontend
│   ├── index.html         # Shell + nav + footer
│   ├── manifest.json      # PWA
│   ├── sw.js              # Service Worker (offline)
│   ├── css/
│   │   ├── tokens.css     # Design tokens (color, tipografía, spacing, motion)
│   │   ├── components.css # Biblioteca de componentes
│   │   ├── layout.css     # Grid, secciones, nav, footer
│   │   └── pages.css      # Estilos por vista
│   ├── js/
│   │   ├── app.js         # Bootstrap + rutas + listeners globales
│   │   ├── router.js      # Router hash con query strings
│   │   ├── api.js         # Cliente API (cache, retry, dedup)
│   │   ├── state.js       # Estado reactivo (signals)
│   │   ├── components/    # Toast, Modal, Table, Form, Upload, Avatar...
│   │   └── views/         # Home, Tables, Results, Selection, Venues, Login
│   └── images/placeholders/  # SVG de marca para fotos sin subir
└── test/
    ├── api.test.js        # 36 tests de API (node:test)
    ├── imports.test.js    # Verifica imports ESM
    ├── bindings.test.js   # Detecta colisiones de binding
    ├── escapehtml.test.js # Detecta escapeHtml roto (XSS)
    └── browser.test.js    # Chrome headless: 7 rutas + flujo de login
```

---

## Qué hace

### Público
- **Tablas** por división y zona, ordenables, con resaltado de posiciones y aviso "revisar".
- **Resultados**: jugados, programados y reprogramados, agrupados por fecha, filtrables.
- **Fixture** por fecha con estados (programado / jugado / reprogramado / suspendido).
- **Selección** y **Sedes** con datos de la asociación.
- **PWA instalable** con service worker (cache de assets, cola offline para planilleros).

### Panel (con login)
- Cargar y borrar resultados · inscribir equipos · reservas · cobros · usuarios.
- **Roles:** `admin` hace todo; `planillero` solo carga resultados.
- **Gestión de medios** con drag & drop y conversión a WebP en el navegador.
- **Auditoría**: registro de quién hizo qué.

### Reglas de negocio
- **Tablas**: parten de las posiciones publicadas del Clausura 2026 (`seed.json`, columnas `b_*`) y suman los partidos cargados.
- **Puntos 2-1-0**. Orden por puntos, diferencia de gol y goles a favor — *a confirmar con el reglamento oficial*.
- **Reservas**: la base impide dos reservas en la misma sede, cancha, fecha y hora.
- **Habilitado**: un equipo queda habilitado al tener inscripción pagada.
- **Torneos**: Clausura 2026 por defecto; se pueden crear Apertura/Clausura futuros con sus divisiones.

### Seguridad
- Claves con **scrypt** + salt por usuario.
- Sesión firmada en cookie **HttpOnly / SameSite=Strict** (+ `Secure` en producción), 12 h de validade.
- **Revocación real** de sesiones: `token_version` por usuario, se incrementa al cambiar o resetear la clave.
- `debe_cambiar` obliga a cambiar la clave inicial del admin en el primer ingreso.
- Límite de 8 intentos de login por minuto y IP.
- Validación de datos en el servidor (rangos, pertenencia a la división, duplicados).

---

## Tests

```bash
npm test              # todo
npm run test:api      # 36 tests de API
npm run test:static   # imports, bindings, escapeHtml
npm run test:browser  # Chrome headless: rutas + flujo de login
```

`test:browser` necesita **Google Chrome** instalado. Si no está, se saltea solo.

---

## Publicarlo en internet

Necesita un hosting que ejecute Node y tenga **disco persistente** (la base es un archivo).

| Plataforma | Disco en plan gratis |
|------------|----------------------|
| **Railway** | ✅ 500 MB |
| **Fly.io**   | ✅ 1 GB |
| **Render**   | ❌ solo plan pago (Starter) |

### Railway (recomendado, gratis con volumen)

1. `railway login` → `railway init` → `railway up`
2. En el dashboard: **Settings → Volumes → Add Volume** → mount path `/data`
3. Variables de entorno:
   - `NODE_ENV=production`
   - `ADMIN_PASSWORD=` (tu clave de admin, mínimo 8 caracteres)
   - `SESSION_SECRET=` (string largo aleatorio; si cambiás, se invalidan las sesiones)
   - `DATA_DIR=/data`

### Render (con `render.yaml` incluido)

Subí la carpeta a un repositorio de GitHub, creá un **Web Service** con:
- Start command: `node server.js`
- Build command: `npm install`
- Plan: `Starter` (el disco persistente es de pago)
- Variables: las mismas de arriba

El hosting aporta el **HTTPS** (necesario para la cookie `Secure` en producción).

### Copias de seguridad

Hacé copias periódicas de `data/futsal.db`:

```bash
cp data/futsal.db "copias/futsal-$(date +%F).db"
```

O desde el panel de administración: **Backup JSON** (descarga todos los datos sin hashes).

---

## Pendiente (no está hecho)

- **Reglamento oficial**: validar puntaje, desempates, sanciones y pases con el documento de la asociación.
- **Fixture real**: hoy se puede generar round-robin, pero falta el fixture y los resultados reales del Clausura 2026.
- **Fotos reales**: los SVG de `public/images/placeholders` son provisionales; la asociación debe subir las suyas.
- **Mapa interactivo** en Sedes (integración MapLibre pendiente).
- **Separar club de equipo** y normalizar nombres con aviso de duplicados (la detección ya existe en `/api/duplicados`).
- **Jugadores y cuerpo técnico** por equipo con carga rápida.
- **Pases, habilitaciones, tribunal de disciplina, árbitros y estadísticas históricas**.
- **Categorías femenino y formativas**.
- **Sección de selección administrable** y gestión de auspiciantes.
- **Pasarelas de pago online** (MercadoPago) — pospuestas por alcance.
- **Modo sin conexión completo** para planilleros (la cola existe, falta el endpoint de sincronización).
- **Accesibilidad**: auditoría WCAG formal pendiente (el código sigue las guías pero no está auditado con axe).
- **Pruebas en celulares reales**.
- **Fuentes alojadas localmente** (hoy se usan Google Fonts).
- **Migración a PostgreSQL** si el uso crece.
