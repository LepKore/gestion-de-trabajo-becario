# MiBeca — backend

API Node.js y PostgreSQL local de MiBeca. Actualmente existen endpoints de diagnóstico (`GET /health` y `GET /ready`), la conexión configurable y la infraestructura de migraciones. El esquema y las rutas del producto siguen pendientes: no se han creado tablas de usuarios, trabajos u horas sin cerrar antes el contrato del MVP. La propuesta de producto está en [docs/](docs/).

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

`npm run db:migrate` conecta con `DATABASE_URL`, comprueba que `MIGRATION_TARGET=local` apunte a localhost y aplica los archivos `migrations/*.sql` pendientes en orden. La migración `0001_init.sql` crea el esquema de la fase 2 (`usuarios`, `estudiantes`, `encargados`, `sesiones`, `auditoria`); los archivos ya aplicados no se editan. Antes de aplicar una migración, revisa el SQL y el host de `DATABASE_URL`. Nunca se ejecutan migraciones al iniciar la API.

`GET http://127.0.0.1:3000/health` confirma que el proceso responde. `GET http://127.0.0.1:3000/ready` ejecuta `SELECT 1` y devuelve 503 si PostgreSQL no está disponible. `CORS_ORIGIN` acepta orígenes separados por comas; en local se usa el origen de Vite.

El backend implementa la fase 2 (Auth y Usuarios) bajo `/api/v1`. El contrato canónico es [`openapi.yaml`](openapi.yaml); `docs/api-v1.md` es un resumen subordinado. Las rutas de trabajos, postulaciones y control (fases 3 y 4) todavía no existen.

## Primer administrador

No hay registro público: las cuentas las crea el administrador. El primer ADMIN se genera con un comando explícito, nunca al migrar ni al arrancar el servidor.

```bash
npm run db:create-admin
```

Pide nombre, correo y una confirmación, y muestra una contraseña temporal **una sola vez**. Con el mismo destino y destino ya existente se puede usar la variante sin interacción:

```bash
npm run db:bootstrap-admin
```

Lee `BOOTSTRAP_ADMIN_NOMBRE`, `BOOTSTRAP_ADMIN_CORREO` y `BOOTSTRAP_ADMIN_PASSWORD` (vacío = genera una temporal y la imprime una vez). Es idempotente: si ya existe un administrador activo no crea nada. Para entornos nuevos se define el administrador inicial con SQL, sin credenciales predeterminadas en Git ni en logs. Al crear una cuenta, la contraseña temporal se entrega en persona y el usuario debe cambiarla antes de entrar al negocio.

## Pruebas y verificación

```bash
npm run check
npm test
npx @redocly/cli@latest lint openapi.yaml
```

`npm run check` valida la sintaxis de los archivos `.js` de `src`, `scripts` y `test`. `npm test` ejecuta la suite de API contra la base `TEST_DATABASE_URL` (25 pruebas): **recrea el esquema public de esa base en cada ejecución**, por lo que nunca debe apuntar a producción; el helper rechaza hosts remotos salvo `TEST_ALLOW_REMOTE=true`. `npm run check`, `npm test` y el lint de `openapi.yaml` son los mismos pasos que ejecuta la CI.

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

La CI de este repositorio usa una base PostgreSQL efímera y credenciales de prueba, instala con `npm ci` desde `package-lock.json` y ejecuta `npm run check`, las migraciones, el lint de `openapi.yaml` y la suite de API (creando una base `mibeca_test` efímera y exponiéndola como `TEST_DATABASE_URL`). No tiene acceso a Render ni a Supabase. Las rutas de las fases 3 y 4 todavía no tienen pruebas porque todavía no existen.

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
