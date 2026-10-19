# Contexto de agentes: backend MiBeca

## 1. Propósito y alcance

Este repositorio contiene la API Node.js y PostgreSQL local. El frontend vive en el repositorio hermano `gestion-de-trabajo-becario-web`. El coordinador de la raíz asigna archivos y evita ediciones simultáneas.

## 2. Stack y estructura comprobados

Existen `compose.yaml` con PostgreSQL, `src/db.js`, `src/server.js`, `scripts/migrate.js`, `migrations/`, `package-lock.json` y CI backend. No hay todavía tablas ni endpoints de dominio. Se dispone de `/health` y `/ready`. Consultar `package.json` antes de afirmar versiones o scripts vigentes. `src/db.js` expone `databaseConfig`, `poolConfig` (`DB_POOL_MAX` por defecto 5, `DB_POOL_IDLE_TIMEOUT_MS` por defecto 30000) e `isSupabaseHost`; `createPool` usa `poolConfig`. No se pasa `name` en consultas porque Supavisor en modo transacción no admite sentencias preparadas con nombre.

## 3. Instalación y comandos

Seguir `README.md` para `.env`, Docker, migraciones y servidor. Compose carga su configuración; el proceso Node carga `.env` por separado. La base de otro proyecto en Render queda fuera de alcance.

## 4. Reglas y contrato

El destino remoto principal es Supabase mediante el pooler en modo transacción (puerto 6543), no la conexión directa. `scripts/migrate.js` acepta `MIGRATION_TARGET=local`, `supabase` y `render`. `supabase` exige host terminado en `supabase.com`, `MIGRATION_CONFIRM_HOST` igual al hostname y `DB_SSL_MODE` distinto de `disable`; imprime una línea de destino sin contraseña. No se usa el CLI de Supabase: el historial vive en `schema_migrations`. La CI sigue con PostgreSQL efímero, `MIGRATION_TARGET=local` y `DB_SSL_MODE=disable`, y nunca recibe credenciales de Supabase. La sección "Conectar con Supabase" del `README.md` es la referencia operativa.

El plan canónico es `docs/PLAN_MVP_MIBECA.md`. Hasta que exista `openapi.yaml` validado, `docs/api-v1.md` es un borrador alineado en alcance pero incompleto como contrato técnico. El coordinador mantiene el contrato y asigna su edición a un único responsable.

## 5. Estado y verificaciones

El 18-10-2026 se comprobó Node 24.19.0 y Docker Engine 29.1.3. `docker compose config --quiet` y `npm run check` pasaron; PostgreSQL 17.11 quedó saludable en el puerto local 5433 porque 5432 estaba ocupado. `npm run db:migrate` creó solo `schema_migrations`. `/health` y `/ready` respondieron correctamente. Una fila de prueba sobrevivió a `docker compose down` y `up` con el mismo volumen y la tabla de prueba se eliminó después. `package-lock.json` se generó y CI cambió a `npm ci`. En frontend pasaron `npm run lint` y `npm run build`. El MVP funcional, las pruebas de permisos y la ejecución real de CI remoto siguen pendientes.

El 18-10-2026 se implementó la conexión a Supabase sobre la rama `Ivan`. Se modificaron `src/db.js`, `scripts/migrate.js`, `.env.example`, `README.md`, `docs/plan-colaboracion.md`, `docs/PLAN_DE_TRABAJO_MIBECA.md` y este archivo; no se cambió el contrato de la API. Verificado: `npm run check` pasa; `npm ci` instalado; las cinco guardas de `MIGRATION_TARGET` (supabase con localhost, host no Supabase, `MIGRATION_CONFIRM_HOST` distinto, `DB_SSL_MODE=disable` y target inválido) rechazan con el mensaje esperado; el camino válido imprime la línea de destino sin contraseña y solo falla al resolver el DNS; `docker compose config --quiet` acepta `.env.example`; con PostgreSQL 17.11 local en `127.0.0.1:5432`, `npm run db:migrate` y `GET /health` y `GET /ready` respondieron correctamente. **Pendiente**: no se ha ejecutado nada contra un proyecto real de Supabase, porque no se ha creado el proyecto; esa verificación requiere que el responsable lo cree y ejecute el paso.

El 18-10-2026 se verificó además la conexión real a un proyecto de Supabase mediante el pooler en modo transacción (puerto 6543). El pooler firma con CA privada (`Supabase Root 2021 CA`), que no está en el almacén de confianza del sistema, por lo que sin `DB_SSL_CA_FILE` la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`. El certificado raíz público está versionado en `certs/prod-ca-2021.crt` y no contiene clave privada: es material público y su omisión rompe el despliegue. Con `DATABASE_URL` de Supabase, `DB_SSL_MODE=require` y `DB_SSL_CA_FILE` apuntado a ese archivo, `npm run db:migrate` y `GET /ready` respondieron correctamente. Observación: `pg_stat_ssl` informa `ssl: false` en el tramo pooler a Postgres, que es configuración del lado de Supabase (SSL Enforcement), no del backend. Desviación de nomenclatura conocida: `DB_SSL_MODE=require` activa `rejectUnauthorized: true` sin CA, es decir, se comporta como `verify-ca` del estándar, no como `sslmode=require`. **Pendiente por decisión del equipo:** renombrar esos modos para que el nombre coincida con el comportamiento, y restablecer la contraseña de Supabase usada en la prueba, que quedó expuesta en el chat y debe rotarse antes de usarse en serio.

`core.hooksPath` está configurado en ambos clones. El PowerShell del usuario dispone de Python 3.11.9 como `python`; `python3` no funciona en Windows, por lo que se corrigieron las invocaciones de los hooks. El hook Git, idéntico en ambos repositorios, permitió un commit inocuo y bloqueó un `.env` en un repositorio temporal. Los scripts del hook Codex compilaron y respondieron correctamente a eventos simulados; su confianza/activación real en el cliente aún está pendiente de verificar. Ver [automation.md](automation.md).

## 6. Límites y siguientes tareas

No inferir que documentos propuestos son funcionalidades implementadas. El siguiente cambio de dominio requiere cerrar contrato, esquema y reglas del plan, después migraciones y pruebas. Entregar al coordinador rutas, resultados, riesgos y cambios de contrato que necesite frontend. No ejecutar despliegues ni migraciones remotas por iniciativa del perfil.
