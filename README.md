# Futsal Tucumán · plataforma real

Servidor Node.js sin dependencias externas + base de datos SQLite + frontend web.
Requiere **Node 22.13 o superior**.

## Probar en tu computadora
```
ADMIN_PASSWORD="una-clave-de-8-o-mas" node server.js
```
Abrí http://localhost:3000 y entrá por "Ingresar" con usuario `admin`.
Si no definís ADMIN_PASSWORD, la primera vez se genera una y se imprime en la consola.

## Qué hace
- **Público:** tablas por división y zona, resultados, selección y sedes.
- **Panel (con login):** cargar y borrar resultados, inscribir equipos, reservas, cobros y usuarios.
- **Roles:** `admin` hace todo; `planillero` solo carga resultados.
- **Tablas:** parten de las posiciones publicadas del Clausura 2026 (seed.json) y suman los partidos cargados. Puntos 2-1-0, orden por puntos, diferencia de gol y goles a favor (confirmar con el reglamento).
- **Reservas:** la base impide dos reservas en la misma sede, cancha, fecha y hora.
- **Seguridad:** claves con scrypt, sesión firmada (cookie HttpOnly), límite de intentos de login, validación en el servidor.

## Publicarlo en internet
Necesita un hosting que ejecute Node y tenga **disco persistente** (la base es un archivo).
Opciones: Render (Web Service + Disk), Railway (Volume) o Fly.io (Volume).

1. Subí esta carpeta a un repositorio de GitHub.
2. Creá el servicio con comando de inicio `node server.js`.
3. Variables de entorno:
   - `NODE_ENV=production`
   - `ADMIN_PASSWORD=` (tu clave de admin, mínimo 8 caracteres)
   - `DATA_DIR=` la ruta del disco persistente (por ejemplo `/data`)
4. Montá el disco en esa ruta. Sin disco, los datos se pierden en cada reinicio.
5. Hacé copias del archivo `futsal.db` con regularidad.

El hosting aporta el HTTPS (necesario para la cookie de sesión en producción).

## Pendiente (no está hecho)
- Fixture automático y calendario de partidos por fecha.
- Importar fixtures y resultados históricos (hay que conseguirlos con la asociación).
- Jugadores, cuerpo técnico, pases y sanciones.
- Escudos, fotos y sponsors reales.
- Recuperación de clave y cambio de clave desde la web.
- Reglamento oficial para validar desempates.
