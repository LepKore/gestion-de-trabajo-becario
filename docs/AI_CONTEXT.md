# Contexto de agentes: backend MiBeca

## 1. Propósito y alcance

Este repositorio contiene la API Node.js y PostgreSQL local. El frontend vive en el repositorio hermano `gestion-de-trabajo-becario-web`. El coordinador de la raíz asigna archivos y evita ediciones simultáneas.

## 2. Stack y estructura comprobados

Existen `compose.yaml` con PostgreSQL, `src/db.js`, `src/app.js`, `src/server.js`, `scripts/migrate.js`, `scripts/check-syntax.js`, `scripts/create-admin.js`, `scripts/bootstrap-admin.js`, `migrations/`, `test/`, `openapi.yaml`, `package-lock.json` y CI backend. Se dispone de `/health` y `/ready`, Auth/Usuarios bajo `/api/v1/auth` y `/api/v1/users`, y Trabajos/Postulaciones bajo `/api/v1/jobs`, `/api/v1/applications` y `/api/v1/me`. `0001_init.sql` crea usuarios y perfiles; `0002_trabajos_postulaciones.sql` crea trabajos y postulaciones; `0003_cierre_asistencia.sql` añade cierre y asistencia. Consultar `package.json` antes de afirmar versiones o scripts vigentes. `src/db.js` expone `databaseConfig`, `poolConfig` (`DB_POOL_MAX` por defecto 5, `DB_POOL_IDLE_TIMEOUT_MS` por defecto 30000) e `isSupabaseHost`; `createPool` usa `poolConfig`. No se pasa `name` en consultas porque Supavisor en modo transacción no admite sentencias preparadas con nombre.

La API se construye con `createApp({ pool, env })` sobre Express, con helmet, CORS de origen exacto y Allow-Credentials, cookieParser y un manejador de errores centralizado sin trazas en la respuesta. Sesiones opacas en tabla `sesiones` (token aleatorio en cookie HttpOnly, solo su hash SHA-256 se guarda), CSRF con cabecera `X-CSRF-Token`, argon2id para contraseñas y zod para validar entradas. Las contraseñas se derivan en `src/lib/passwords.js`; nunca se registran ni se devuelven hashes.

## 3. Instalación y comandos

Seguir `README.md` para `.env`, Docker, migraciones y servidor. Compose carga su configuración; el proceso Node carga `.env` por separado. La base de otro proyecto en Render queda fuera de alcance. Comandos de despliegue: `npm ci`, `npm run build` (que solo ejecuta `npm run check`, porque no hay compilación) y `npm start` (`node --env-file-if-exists=.env src/server.js`: carga `.env` solo si existe y las variables ya presentes en el entorno prevalecen sobre el archivo, de modo que en producción mandan las del proveedor). Las migraciones se aplican aparte con `npm run db:migrate:env` y nunca al arrancar.

## 4. Reglas y contrato

El destino remoto principal es Supabase mediante el pooler en modo transacción (puerto 6543), no la conexión directa. `scripts/migrate.js` acepta `MIGRATION_TARGET=local`, `supabase` y `render`. `supabase` exige host terminado en `supabase.com`, `MIGRATION_CONFIRM_HOST` igual al hostname y `DB_SSL_MODE` distinto de `disable`; imprime una línea de destino sin contraseña. No se usa el CLI de Supabase: el historial vive en `schema_migrations`. La CI sigue con PostgreSQL efímero, `MIGRATION_TARGET=local` y `DB_SSL_MODE=disable`, y nunca recibe credenciales de Supabase. La sección "Conectar con Supabase" del `README.md` es la referencia operativa.

El plan canónico es `docs/PLAN_MVP_MIBECA.md`; la numeración operativa de fases está en `docs/PLAN_DE_TRABAJO_MIBECA.md`. El contrato técnico canónico es `openapi.yaml` (OpenAPI 3.1, revisión 1.6.0 con endpoints de fase 5 y progreso de beca en postulantes); `docs/api-v1.md` es un resumen legible subordinado a él y no una fuente de verdad. El lint de Redocly no se pudo ejecutar en esta sesión porque npm no accedió al registry. El coordinador mantiene el contrato y asigna su edición a un único responsable.

Reglas de seguridad de la fase 2: no hay registro público (el administrador crea las cuentas), el rol es fijo tras el alta, la contraseña temporal se muestra una sola vez y su cambio es obligatorio, la baja es lógica y conserva el historial, reactivar no revive sesiones antiguas y está prohibido desactivar al último administrador activo (409 `ultimo_admin_activo`). `scripts/bootstrap-admin.js` crea el primer administrador solo si no hay ningún ADMIN activo y usa `BOOTSTRAP_ADMIN_*`; no hay credenciales por defecto en el repositorio.

## 5. Estado y verificaciones

El 18-10-2026 se comprobó Node 24.19.0 y Docker Engine 29.1.3. `docker compose config --quiet` y `npm run check` pasaron; PostgreSQL 17.11 quedó saludable en el puerto local 5433 porque 5432 estaba ocupado. `npm run db:migrate` creó solo `schema_migrations`. `/health` y `/ready` respondieron correctamente. Una fila de prueba sobrevivió a `docker compose down` y `up` con el mismo volumen y la tabla de prueba se eliminó después. `package-lock.json` se generó y CI cambió a `npm ci`. En frontend pasaron `npm run lint` y `npm run build`. El MVP funcional, las pruebas de permisos y la ejecución real de CI remoto siguen pendientes.

El 18-10-2026 se implementó la conexión a Supabase sobre la rama `Ivan`. Se modificaron `src/db.js`, `scripts/migrate.js`, `.env.example`, `README.md`, `docs/plan-colaboracion.md`, `docs/PLAN_DE_TRABAJO_MIBECA.md` y este archivo; no se cambió el contrato de la API. Verificado: `npm run check` pasa; `npm ci` instalado; las cinco guardas de `MIGRATION_TARGET` (supabase con localhost, host no Supabase, `MIGRATION_CONFIRM_HOST` distinto, `DB_SSL_MODE=disable` y target inválido) rechazan con el mensaje esperado; el camino válido imprime la línea de destino sin contraseña y solo falla al resolver el DNS; `docker compose config --quiet` acepta `.env.example`; con PostgreSQL 17.11 local en `127.0.0.1:5432`, `npm run db:migrate` y `GET /health` y `GET /ready` respondieron correctamente. **Pendiente**: no se ha ejecutado nada contra un proyecto real de Supabase, porque no se ha creado el proyecto; esa verificación requiere que el responsable lo cree y ejecute el paso.

El 18-10-2026 se verificó además la conexión real a un proyecto de Supabase mediante el pooler en modo transacción (puerto 6543). El pooler firma con CA privada (`Supabase Root 2021 CA`), que no está en el almacén de confianza del sistema, por lo que sin `DB_SSL_CA_FILE` la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`. El certificado raíz público está versionado en `certs/prod-ca-2021.crt` y no contiene clave privada: es material público y su omisión rompe el despliegue. Con `DATABASE_URL` de Supabase, `DB_SSL_MODE=require` y `DB_SSL_CA_FILE` apuntado a ese archivo, `npm run db:migrate` y `GET /ready` respondieron correctamente. Observación: `pg_stat_ssl` informa `ssl: false` en el tramo pooler a Postgres, que es configuración del lado de Supabase (SSL Enforcement), no del backend. Desviación de nomenclatura conocida: `DB_SSL_MODE=require` activa `rejectUnauthorized: true` sin CA, es decir, se comporta como `verify-ca` del estándar, no como `sslmode=require`. **Pendiente por decisión del equipo:** renombrar esos modos para que el nombre coincida con el comportamiento, y restablecer la contraseña de Supabase usada en la prueba, que quedó expuesta en el chat y debe rotarse antes de usarse en serio.

El 19-10-2026 se cerró la fase 2 (auth y usuarios) del plan. Backend: migración `0001_init.sql` aplicada en la base local; `openapi.yaml` nuevo y validado; 25 pruebas de API en `test/api.test.js` que recrean el esquema de `TEST_DATABASE_URL` y rechazan hosts remotos. Verificado en local: `npm run check` (20 archivos), `npm test` 25/25, lint del contrato con un único aviso `info-license-strict`, y la CI ejecuta check, migraciones, lint del contrato y pruebas. El primer administrador se creó con `npm run db:bootstrap-admin` (`admin@mibeca.local`; la segunda ejecución no duplica). La verificación completa está en [VERIFICACION_FASE_2.md](VERIFICACION_FASE_2.md). Frontend (repo hermano): login, cambio obligatorio de contraseña, recuperación de sesión con `GET /auth/me`, rutas por rol y administración de usuarios; `npm run lint` y `npm run build` en verde y recorrido completo verificado en navegador. Esta fue la evidencia de fase 2; las fases 3 y 4 se implementaron posteriormente. CI remota y despliegues a Supabase o Firebase no se han verificado en esta tarea.

El 19-10-2026 se verificó la fase 4 (Control), sobre Trabajos/Postulaciones ya implementados: OpenAPI 1.2.0, migración `0003_cierre_asistencia.sql`, cierre transaccional con asistencia exhaustiva, auditoría y clave de idempotencia, progreso e historiales propios. Backend `npm run check` correcto y `npm test` 42/42 en `mibeca_test` local; migraciones desde cero y segunda ejecución correctas; 0003 aplicada en `127.0.0.1:5433/mibeca_dev`. Frontend lint/build y 14/14 pruebas correctos. Chromium confirmó cierre con 276/0 minutos para asistente/ausente, progreso e historial y móvil sin desbordamiento ni errores JS. Revisión independiente detectó UUID de ruta en mayúsculas en reintentos; se normalizó y agregó regresión. Ver `VERIFICACION_FASE_4.md`. Se usaron subagentes de backend, frontend y revisión con propiedad separada.

`core.hooksPath` está configurado en ambos clones. El PowerShell del usuario dispone de Python 3.11.9 (accesible mediante `py` en esta verificación); el sandbox no lo descubre sin permisos del usuario. El hook Git permitió un commit inocuo y bloqueó un `.env` en un repositorio temporal. En esta fase el hook Codex rechazó una migración sin destino visible; su formato permitido con `MIGRATION_TARGET=local` aplicó la migración local sin modificar controles. La protección efectiva de otras operaciones sigue limitada a las herramientas cubiertas por el cliente. Ver [automation.md](automation.md).

El 21-10-2026 se añadió el auditor de código local con motor puro en `.opencode/lib/code-audit-rules.js` (26 reglas, 5 duras: SEC-01/02/03, DB-01, AUTH-01), el plugin OpenCode `.opencode/plugin/code-audit.js` (contrato V2, herramienta `audit_code` y comando `/auditar`) y el puente Codex `.codex/hooks/audit_bridge.mjs` registrado en `.codex/hooks.json` sobre `apply_patch`. El plugin `.opencode/plugin/docker-guard.js` se migró al mismo contrato V2 y su lógica pura vive en `.opencode/lib/docker-guard-rules.js`. Verificado: `npm run check` incluye `.opencode` y `.codex`; `test/code-audit.test.js` 12/12 y `test/codex-audit.test.js` 11/11; verificaciones 40/40 (auditor) y 34/34 (docker-guard); calibración del árbol 0 bloqueos, 0 avisos, 4 informativos, sin rutas fuera de `openapi.yaml`. La desviación prevista (regla de `CREATE TABLE` sin `IF NOT EXISTS`) se descartó por ruido. Ver [automation.md](automation.md).

El 22-10-2026 se amplió `GET /jobs/{id}/applications` con el progreso de beca del estudiante: `estudiante` incluye `semester`, `targetMinutes`, `accreditedMinutes` y `remainingMinutes` (suma de `asistencias.minutos_acreditados` de todas sus postulaciones, misma semántica que `GET /students/progress`). Es aditivo: `/me/applications` conserva el shape anterior. Contrato a 1.4.0. Verificado: `test/jobs.test.js` 9/9 y el resto de la suite en verde.

## 5b. Spec Kit (Spec-Driven Development Toolkit)

Spec Kit (github.com/github/spec-kit, v1.2.4.dev0) es el marco de trabajo SDD del proyecto, instalado el 26-10-2026. Reemplaza la skill `spec-driven-development` (eliminada).

**¿Qué es?** Un CLI `specify` + directorio `.specify/` con plantillas y comandos slash. No es un agente: los agentes leen los archivos de `.specify/` y los siguen.

**Comandos slash disponibles en OpenCode:**
- `/speckit.constitution` — Principios gobernantes del proyecto
- `/speckit.specify` — Crear especificación (.specify/spec.md)
- `/speckit.clarify` — Aclarar áreas ambiguas (opcional, antes de /speckit.plan)
- `/speckit.plan` — Plan técnico (.specify/plan.md)
- `/speckit.tasks` — Lista de tareas (.specify/tasks.md)
- `/speckit.analyze` — Análisis de consistencia entre artifacts (opcional)
- `/speckit.checklist` — Checklist de calidad (opcional)
- `/speckit.implement` — Ejecutar implementación
- `/speckit.converge` — Evaluar codebase y añadir tareas pendientes

**Estructura:** `.specify/` contiene `templates/` (spec-template.md, plan-template.md, tasks-template.md, constitution-template.md, checklist-template.md), `scripts/powershell/`, `workflows/speckit/workflow.yml`, `memory/constitution.md` (plantilla sin completar), `integrations/opencode.manifest.json` y `integration.json`.

**Flujo:** constitution → specify → clarify → plan → tasks → analyze → implement. Cada fase se guarda en `.specify/` y requiere aprobación humana antes de pasar a la siguiente.

**Comandos CLI:** `specify --version`, `specify check`, `specify init . --here --integration opencode --force --non-interactive`.

**Relación con el flujo existente:** El plan canónico del proyecto es `docs/PLAN_MVP_MIBECA.md`. Spec Kit complementa el flujo de desarrollo (especificación → plan → tareas → implementación) pero no reemplaza los documentos del proyecto. Los artifacts de Spec Kit (.specify/spec.md, .specify/plan.md) son para trabajo nuevo no cubierto por el plan existente.

**Instalación:** `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`. Requiere `uv` (instalar con `Invoke-WebRequest -Uri https://astral.sh/uv/install.ps1 -OutFile $env:TEMP\uv.ps1; . $env:TEMP\uv.ps1`).

## 6. Límites y siguientes tareas

No inferir que documentos propuestos son funcionalidades implementadas. El siguiente cambio de dominio requiere cerrar contrato, esquema y reglas del plan, después migraciones y pruebas. Entregar al coordinador rutas, resultados, riesgos y cambios de contrato que necesite frontend. No ejecutar despliegues ni migraciones remotas por iniciativa del perfil.

La supervisión administrativa (`GET /students/progress`, `GET /students/{id}/history`) y los dashboards reales por rol se implementaron en fase 5; evidencia y validaciones pendientes en `VERIFICACION_FASE_5.md`. Antes de cualquier despliegue hay que rotar la contraseña de Supabase expuesta en la prueba del 18-10-2026 y resolver el nombre de los modos SSL (`require` se comporta como `verify-ca`).

### 2026-10-29: modulo de evaluaciones y calificacion

El backend implementa evaluaciones inmutables para el encargado propietario, la calificacion del becario sobre sus ultimos diez trabajos realizados y el cumplimiento institucional de horas para ADMIN. La asistencia persistida sigue siendo la unica fuente de minutos acreditados; progreso, historiales y cumplimiento no exponen puntajes. El contrato canonico es OpenAPI 1.6.0 e incluye GET /me/rating, POST /applications/{id}/evaluation y las evaluaciones persistidas en las respuestas autorizadas del encargado.

La suite de integracion paso 86/86, incluyendo trazabilidad, matriz de roles y cuentas activas, aislamiento de respuestas y cumplimiento sin puntajes. Tambien pasaron npm run lint, npm run build, npm run audit:all, los 2 tests de contrato y la comprobacion de sintaxis de 47 archivos. La medicion en PostgreSQL 17.11 local con 100 trabajos, 1.000 postulaciones y 20 solicitudes por endpoint obtuvo p95 de 15.12 ms para GET /jobs, 5.74 ms para GET /me/progress y 19.97 ms para crear evaluacion; ver specs/001-becas-upb-management/quickstart.md.

Docker Desktop Engine 29.7.2 estaba activo y confirmo el contenedor postgres:17.11 healthy en 127.0.0.1:5434. El CLI no estaba en PATH. Se creo la base local mibeca_test porque faltaba; las pruebas se ejecutaron solo ahi y no alteraron mibeca_dev.

### 2026-10-30: lectura autorizada de evaluacion guardada

OpenAPI v1.6.0 incluye la evaluacion persistida en asistencia e historial del encargado propietario. Becarios y ADMIN conservan respuestas sin evaluaciones. No se requiere migracion de base de datos. Se incorporaron y ejecutaron pruebas de regresion y contrato; la integracion frontend consume las rutas y shapes publicados en el commit `eb73b00`.
