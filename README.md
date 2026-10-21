# MiBeca — backend

API Node.js y PostgreSQL de MiBeca. Incluye Auth, Usuarios, Trabajos y Postulaciones bajo `/api/v1`, además de `GET /health` y `GET /ready`. La fase 4 añade cierre, asistencia, progreso e historiales; el alcance y estado se describen en [docs/PLAN_DE_TRABAJO_MIBECA.md](docs/PLAN_DE_TRABAJO_MIBECA.md).

## Requisitos

- Node.js 22 o superior y npm.
- Docker Desktop con el motor activo y `docker compose`.
- Un puerto local libre para PostgreSQL (5432 por defecto) y otro para la API (3000 por defecto).

La imagen es `postgres:17.11`; los datos persisten en el volumen nombrado `mibeca_pgdata` del proyecto Compose. Solo se publica PostgreSQL en `127.0.0.1`. El backend corre en el equipo anfitrión; por ello `DATABASE_URL` usa `127.0.0.1` y el puerto publicado. El nombre `postgres` solo resuelve dentro de la red de Compose.

## Primera configuración local

Desde esta carpeta:

```bash
cp .env.example .env
npm install
```

En PowerShell, el primer comando es `Copy-Item .env.example .env`. Ajusta `POSTGRES_PASSWORD` a una clave de desarrollo propia y sincroniza usuario, clave, base y puerto con `DATABASE_URL`. Si 5432 está ocupado, cambia `POSTGRES_PORT` y el puerto en `DATABASE_URL` (por ejemplo 5433). La configuración de Compose se lee del archivo `.env` en esta carpeta; Node.js lo carga por separado mediante `--env-file=.env` en los scripts `dev` y `db:migrate`. Para producción se usan variables de entorno del proveedor y `npm start`.

`.env` y otros archivos `.env.*` están excluidos de Git. `.env.example` contiene únicamente valores ficticios de desarrollo, incluidos los marcadores `<...>` de la plantilla de Supabase. No copies credenciales de bases ajenas al proyecto, en particular de la base Render mencionada en otro trabajo.

## Comandos cotidianos

```bash
docker compose up -d postgres
docker compose ps
docker compose logs -f postgres
npm run db:migrate
npm run dev
```

`npm run db:migrate` conecta con `DATABASE_URL`, comprueba que `MIGRATION_TARGET=local` apunte a localhost y aplica los archivos `migrations/*.sql` pendientes en orden. `0001_init.sql` crea Auth y Usuarios; `0002_trabajos_postulaciones.sql` crea el dominio de la fase 3; `0003_cierre_asistencia.sql` añade el control de la fase 4. Los archivos ya aplicados no se editan. Antes de aplicar una migración, revisa el SQL y el host de `DATABASE_URL`. Nunca se ejecutan migraciones al iniciar la API.

`GET http://127.0.0.1:3000/health` confirma que el proceso responde. `GET http://127.0.0.1:3000/ready` ejecuta `SELECT 1` y devuelve 503 si PostgreSQL no está disponible. `CORS_ORIGIN` acepta orígenes separados por comas; en local se usa el origen de Vite.

El contrato canónico es [`openapi.yaml`](openapi.yaml), revisión 1.3.0; `docs/api-v1.md` es un resumen subordinado. La API usa sesiones en cookies HttpOnly, CSRF en escrituras y comprobaciones de rol, actividad y propiedad.

## Endpoints existentes

Todas las rutas de negocio cuelgan de `/api/v1`; `/health`, `/health_db` y `/ready` quedan fuera de ese prefijo. El detalle de cuerpos, esquemas y ejemplos vive en [`openapi.yaml`](openapi.yaml); esta sección es un mapa de lo implementado.

Convenciones que aplican a toda la tabla:

- **Sesión:** cookie `mibeca_session` (HttpOnly, `Secure` en HTTPS) emitida por `POST /auth/login`. `GET /auth/me` recupera la sesión y devuelve el `csrfToken` vigente.
- **CSRF:** toda escritura (`POST`, `PATCH`) exige la cabecera `X-CSRF-Token` con el token de la sesión. Sin ella responde 403 `forbidden`.
- **Roles:** `ADMIN`, `ENCARGADO` y `BECARIO`. El rol es fijo tras el alta. «Autenticado» significa cualquier rol con sesión válida y sin cambio de contraseña pendiente; con `requiereCambioPassword` activo, las rutas de negocio responden 403 y solo quedan disponibles `GET /auth/me`, `POST /auth/logout` y `POST /auth/change-password`.
- **Propiedad:** «propietario» es el `ENCARGADO` dueño del trabajo o de la postulación; otro encargado recibe 403 (o 404 donde el contrato lo indica).
- **Respuestas:** éxitos con `data`; listas paginadas con `meta: { page, pageSize, total, totalPages }` y `pageSize` máximo 50. Errores con `{ error: { code, message, detalles? } }`, sin trazas ni secretos.
- **Idempotencia:** solo el cierre de trabajo usa `Idempotency-Key` (8-128 caracteres `[A-Za-z0-9._-]`).

### Salud

| Método y ruta | Acceso | Respuesta |
| --- | --- | --- |
| `GET /health` | Público | 200 `{ status: "ok" }`. |
| `GET /health_db` | Público | 200 `{ status: "ok" }`; 503 `database_unavailable` si PostgreSQL no responde. |
| `GET /ready` | Público | 200 `{ status: "ready" }`; 503 `database_unavailable`. Ejecuta `SELECT 1`. |

### Autenticación (`/api/v1/auth`)

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `POST /auth/login` | Público | Recibe `correo` y `password`. Devuelve `data: { usuario, requiereCambioPassword, csrfToken }` y la cookie de sesión. Credenciales inválidas y cuentas inactivas comparten 401; hay límite de intentos por `correo` + IP (429 `too_many_attempts`). |
| `POST /auth/logout` | Sesión + CSRF | Revoca la sesión actual y borra la cookie. 204 sin cuerpo. |
| `GET /auth/me` | Sesión | Devuelve `data: { usuario, requiereCambioPassword, csrfToken }` de la sesión actual. |
| `POST /auth/change-password` | Sesión + CSRF | Recibe `passwordActual`, `passwordNuevo` y `passwordNuevoConfirmacion`. Exige la contraseña actual, mínimo `MIN_PASSWORD_LENGTH` (10 por defecto) y que la nueva sea distinta. Revoca todas las sesiones y emite una nueva cookie con `requiereCambioPassword: false`. |

### Usuarios (`/api/v1/users`, solo ADMIN)

| Método y ruta | Notas |
| --- | --- |
| `GET /users` | Filtros `rol`, `activo` (`true`/`false`), `q`, `page`, `pageSize`. Respuesta paginada. |
| `POST /users` | 201. Recibe `nombre`, `correo`, `rol` y el perfil correspondiente (`estudiante` para BECARIO, `encargado` para ENCARGADO). Devuelve `passwordTemporal` **una sola vez**. Correo duplicado → 409 `duplicate`. |
| `GET /users/{id}` | 404 si no existe. |
| `PATCH /users/{id}` | Edita `nombre`, `correo` y campos del perfil. Enviar `rol` → 400. Exige al menos un campo. |
| `POST /users/{id}/deactivate` | Baja lógica; revoca sesiones. Desactivar al último ADMIN activo → 409 `ultimo_admin_activo`. |
| `POST /users/{id}/reactivate` | Reactiva la cuenta sin revivir sesiones anteriores. |
| `POST /users/{id}/reset-password` | Genera y devuelve `passwordTemporal` nueva una sola vez; revoca sesiones. |

### Trabajos (`/api/v1`)

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /jobs` | Autenticado | Filtros `estado` (`PUBLICADO`/`CERRADO`), `q`, `page`, `pageSize`. Respuesta paginada. |
| `POST /jobs` | ENCARGADO + CSRF | 201. Recibe `titulo`, `descripcion`, `ubicacion`, `inicioPrevisto`, `finPrevisto`, `duracionMinutos` (entero, múltiplo de 6) y `cupos`. El inicio debe ser futuro y anterior al fin. |
| `GET /jobs/{id}` | Autenticado | Incluye `faseTemporal` (`PROXIMO`/`EN_CURSO`/`FINALIZADO`/`CERRADO`), `aceptados` y `cuposDisponibles`. |
| `PATCH /jobs/{id}` | ENCARGADO propietario + CSRF | Edita condiciones antes del inicio y de cualquier aceptación. Con aceptaciones → 409 `trabajo_fijo`. |
| `GET /me/jobs` | ENCARGADO | Trabajos propios, misma paginación y filtros que `GET /jobs`. |
| `POST /jobs/{id}/close` | ENCARGADO propietario + CSRF + `Idempotency-Key` | Recibe `attendance: [{ applicationId, attended }]` con **todas** las postulaciones aceptadas. Devuelve `data: { job, attendance: [{ applicationId, attended, awardedMinutes }], closedAt }`. Rechaza el cierre antes de `finPrevisto` (409 `cierre_temprano`), un segundo cierre (409 `trabajo_cerrado`) y la reutilización de la clave con otro contenido (409 `idempotency_key_conflict`). |
| `GET /jobs/{id}/attendance` | ENCARGADO propietario | Asistencia del trabajo cerrado, con `student: { name, code, career }`. 409 `trabajo_no_cerrado` si aún está publicado. |

### Postulaciones (`/api/v1`)

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `POST /jobs/{id}/applications` | BECARIO + CSRF | 201. Postulación propia, sin cuerpo. Trabajo iniciado o cerrado → 409 `trabajo_no_disponible`; sin cupos → 409 `sin_cupo`. |
| `GET /jobs/{id}/applications` | ENCARGADO propietario | Filtros `estado` (`PENDIENTE`/`ACEPTADA`/`RECHAZADA`), `page`, `pageSize`. Respuesta paginada. |
| `POST /applications/{id}/accept` | ENCARGADO propietario + CSRF | Acepta una postulación pendiente con control transaccional de cupo. |
| `POST /applications/{id}/reject` | ENCARGADO propietario + CSRF | Rechaza una postulación pendiente. |
| `GET /me/applications` | BECARIO | Postulaciones propias; filtros `estado`, `page`, `pageSize`. |

Ambas decisiones devuelven 409 `postulacion_resuelta` si la postulación ya tiene estado final, 404 si no existe y 403 si el trabajo no pertenece al encargado.

### Control y supervisión (`/api/v1`)

| Método y ruta | Acceso | Notas |
| --- | --- | --- |
| `GET /me/progress` | BECARIO | `{ targetMinutes, accreditedMinutes, remainingMinutes, excessMinutes }`. |
| `GET /me/dashboard` | ENCARGADO | Métricas de sus trabajos: `totalJobs`, `publishedJobs`, `closedJobs`, `pendingCloseJobs`, `pendingApplications`, `acceptedStudents`. |
| `GET /me/history` | BECARIO o ENCARGADO | Paginado (`page`, `pageSize`). BECARIO: sus postulaciones con asistencia y minutos (`applicationId`, `applicationStatus`, `attended`, `awardedMinutes`, `job`). ENCARGADO: sus cierres (`job`, `closedAt`, `attendance`). |
| `GET /students/progress` | ADMIN | Filtros `q`, `conHorasPendientes` (`true`/`false`), `page`, `pageSize`. Por estudiante: `name`, `email`, `code`, `career`, `semester`, `targetMinutes`, `accreditedMinutes`, `remainingMinutes`, `excessMinutes`. |
| `GET /students/{id}/history` | ADMIN | Historial de un estudiante; 404 si no existe el perfil de estudiante. Misma forma que el historial de becario. |

### Códigos de error de dominio

Además de `validation_error` (400), `unauthenticated` (401), `forbidden` (403), `not_found` (404), `too_many_attempts` (429) e `internal_error` (500), el contrato define estos 409: `duplicate`, `ultimo_admin_activo`, `usuario_inactivo`, `trabajo_fijo`, `trabajo_no_disponible`, `trabajo_cerrado`, `trabajo_no_cerrado`, `cierre_temprano`, `sin_cupo`, `postulacion_resuelta` e `idempotency_key_conflict`.

## Primer administrador

No hay registro público: las cuentas las crea el administrador. El primer ADMIN se genera con un comando explícito, nunca al migrar ni al arrancar el servidor.

```bash
npm run db:create-admin
```

Pide nombre, correo y una confirmación, y muestra una contraseña temporal **una sola vez**. Con el mismo destino y destino ya existente se puede usar la variante sin interacción:

```bash
npm run db:bootstrap-admin
```

Lee `BOOTSTRAP_ADMIN_NOMBRE`, `BOOTSTRAP_ADMIN_CORREO` y `BOOTSTRAP_ADMIN_PASSWORD` (vacío = genera una temporal y la imprime una vez). Es idempotente: si ya existe un administrador activo no crea nada. Al crear una cuenta, la contraseña temporal se entrega en persona y el usuario debe cambiarla antes de entrar al negocio.

## Pruebas y verificación

```bash
npm run check
npm test
npx @redocly/cli@latest lint openapi.yaml
```

`npm run check` valida la sintaxis de los archivos `.js` de `src`, `scripts` y `test`. `npm test` ejecuta la suite de API contra `TEST_DATABASE_URL`: **recrea el esquema public de esa base en cada ejecución**. El helper exige un host local y una base llamada `mibeca*_test*`; no acepta destinos remotos. `npm run check`, `npm test` y el lint de `openapi.yaml` son los mismos pasos que ejecuta la CI.

Para detener y volver a crear el contenedor conservando los datos:

```bash
docker compose down
docker compose up -d postgres
docker compose ps
```

**Atención:** `docker compose down -v` elimina el volumen y borra los datos. No lo ejecutes para una parada normal. El hook local de Codex está diseñado para rechazar operaciones que eliminan volúmenes, pero su activación depende del cliente y de Python; consulta [automation.md](docs/automation.md) para el estado verificado.

## Verificación de persistencia sin tocar registros del producto

Con Docker disponible, puedes comprobar el volumen usando una tabla de prueba aislada. Después de `docker compose up -d postgres`, abre `docker compose exec postgres psql -U mibeca_dev -d mibeca_dev` (sustituye usuario y base si los cambias). Dentro de `psql` ejecuta:

```sql
CREATE TABLE _mibeca_volume_probe (id integer PRIMARY KEY);
INSERT INTO _mibeca_volume_probe VALUES (1);
\q
```

Ejecuta `docker compose down` y `docker compose up -d postgres`, vuelve a entrar en `psql` y comprueba `SELECT * FROM _mibeca_volume_probe;`. Debe devolver la fila `1`. Limpia solo esa tabla con `DROP TABLE _mibeca_volume_probe;`. Este procedimiento es manual y no se ejecuta en producción.

## Migraciones y trabajo de los tres integrantes

Cada integrante tiene su propio contenedor y volumen local; los registros no se sincronizan entre equipos. Git comparte `compose.yaml`, `.env.example`, código, migraciones SQL y, si se necesitan, semillas de desarrollo explícitas. No hay semillas automáticas. Una migración nueva debe tener nombre ordenable (por ejemplo `0001_usuarios.sql`) y no se edita tras aplicarse; el ejecutor comprueba su SHA-256. El equipo acuerda el contrato antes de crear tablas. Las decisiones compartidas se versionan en `docs/`.

La CI de este repositorio usa una base PostgreSQL efímera y credenciales de prueba, instala con `npm ci` desde `package-lock.json` y ejecuta `npm run check`, las migraciones, el lint de `openapi.yaml` y la suite de API (creando una base `mibeca_test` efímera y exponiéndola como `TEST_DATABASE_URL`). No tiene acceso a Render ni a Supabase.

## Comandos de build y de arranque en despliegue

El backend es JavaScript sin compilación, así que `build` no transpila nada: ejecuta la verificación de sintaxis (`npm run check`, un `node --check` por archivo). Ese es el único paso que la plataforma debe ejecutar antes de arrancar.

| Comando | Qué hace |
| --- | --- |
| `npm ci` | Instala dependencias exactas desde `package-lock.json`. |
| `npm run build` | Verifica la sintaxis de `src/`, `scripts/` y `test/`. No genera artefactos. |
| `npm start` | Arranca la API con `node --env-file-if-exists=.env src/server.js`. Carga `.env` solo si existe, y cualquier variable ya definida en el entorno tiene prioridad sobre el archivo. |

En local, `npm start` y `npm run dev` leen el mismo `.env`, así que ambos funcionan sin configurar nada a mano. En el proveedor de despliegue no existe `.env`: mandan sus variables, que además prevalecen sobre el archivo si algún día apareciera uno.

Variables que el proveedor debe inyectar: `DATABASE_URL`, `HOST=0.0.0.0`, `PORT`, `CORS_ORIGIN` con el dominio real del frontend y, por defecto, `NODE_ENV=production` (activa `COOKIE_SECURE=true`). Las migraciones se aplican aparte con `npm run db:migrate:env`; ver "Conectar con Supabase (despliegue)". El primer administrador se crea con `npm run db:bootstrap-admin`, una sola vez.

## Conectar con Supabase (despliegue)

La misma API y las mismas migraciones funcionan contra Supabase sin cambios de código. Localmente se usa el PostgreSQL de `compose.yaml`; en despliegue, Supabase.

### 1. Obtener la cadena de conexión

En Supabase, **Project Settings → Database → Connection string**, elige el modo **URI** y el modo **transacción** (puerto **6543**). El modo transacción es el indicado para un backend desplegado porque el pooler reparte conexiones sin fijar una sesión por cliente.

La contraseña que aparece ahí debe ir **codificada en URL** antes de pegarla en `DATABASE_URL` (`@` → `%40`, `:` → `%3A`, `/` → `%2F`). Si no la codificas, la URL no representará el mismo valor y `new URL()` la leerá mal.

### 2. Configurar el despliegue

Define en el proveedor de despliegue, no en un `.env` de producción:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres.<project-ref>:<clave_codificada>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| `DB_SSL_MODE` | `require` (o `verify-full` si añades `DB_SSL_CA_FILE`) |
| `DB_SSL_CA_FILE` | `certs/prod-ca-2021.crt` |
| `DB_POOL_MAX` | `5` o menos para no agotar el plan |
| `HOST` | `0.0.0.0` |
| `PORT` | el que asigne el proveedor |
| `CORS_ORIGIN` | el dominio real del frontend |

`certs/prod-ca-2021.crt` es el certificado raíz público de Supabase, sin clave privada, y está versionado a propósito: sin él, la verificación del servidor falla y cada entorno tendría que descargarlo por su cuenta. Se descarga en **Project Settings → Database → SSL Configuration → Download CA certificate**.

`DB_SSL_MODE=disable` es solo para local. No se desactiva globalmente la verificación de certificados.

### 3. Aplicar las migraciones contra Supabase

Las migraciones **no** se ejecutan al iniciar la API. Aplícalas explícitamente, una sola vez por versión, desde una máquina con Node y acceso al proyecto:

```bash
MIGRATION_TARGET=supabase \
MIGRATION_CONFIRM_HOST=aws-0-<region>.pooler.supabase.com \
DB_SSL_MODE=require \
npm run db:migrate:env
```

`MIGRATION_TARGET=supabase` exige que el host termine en `supabase.com`, que `MIGRATION_CONFIRM_HOST` coincida exactamente con el host de `DATABASE_URL` y que TLS esté activo. Los tres controles deben pasar; si alguno falla, no se aplica nada.

### 4. Verificar

`GET /ready` ejecuta `SELECT 1` contra Supabase y devuelve 503 si la conexión falla. El historial aplicado se consulta con `SELECT filename, applied_at FROM schema_migrations ORDER BY filename` y debe coincidir con el de local.

### Notas importantes

- **Pooler en modo transacción.** `node-postgres` solo usa sentencias preparadas *con nombre* si se pasa `name` en la configuración de la consulta. El código de este repositorio no lo hace y `src/db.js` no habilita ninguna. No añadas `name` sin revisar este punto.
- **Límite de conexiones.** El pool es pequeño por defecto (`DB_POOL_MAX=5`). Subirlo es la forma más rápida de agotar el plan de Supabase.
- **No se usa el CLI de Supabase.** `supabase db push` y `supabase link` queda fuera: el historial vive en `schema_migrations` y lo administra `scripts/migrate.js`. Mezclar ambos ejecutores duplicaría el control de versiones.
- **No hay copia de datos.** Cambiar `DATABASE_URL` no transfiere los datos locales. La carga de datos de desarrollo, si algún día hace falta, se decide por separado.

## Alternativa: despliegue en Render

Cuando se cree una base PostgreSQL **nueva para MiBeca**, configura `DATABASE_URL` en el servicio backend, junto con `DB_SSL_MODE` y, si el proveedor entrega una CA, `DB_SSL_CA_FILE`. `DB_SSL_MODE=disable` es solo la opción local; `require` y `verify-full` activan TLS manteniendo `rejectUnauthorized: true`. No se desactiva globalmente la verificación de certificados. Evita `sslmode` dentro de la URL para que una sola variable gobierne TLS.

Revisa el SQL y ejecuta las migraciones explícitamente contra la nueva base con `MIGRATION_TARGET=render`, `MIGRATION_CONFIRM_HOST` igual al host de `DATABASE_URL` y `npm run db:migrate:env`. No hay copia automática de los datos locales ni creación automática de tablas al cambiar la URL. No uses ni modifiques la base Render de otro proyecto.

Para exponer la API, configura `HOST=0.0.0.0` y el `PORT` del servicio Render, establece `CORS_ORIGIN` al dominio real de Firebase, actualiza la URL pública de la API en el frontend y vuelve a compilar y publicar mediante un proceso aprobado. Verifica el flujo completo y ten un plan de recuperación antes de activar el despliegue.
