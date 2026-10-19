# Verificación local de fases 0 y 1

Fecha: 18 de octubre de 2026. Se usa la numeración del [plan general](PLAN_MVP_MIBECA.md#13-fases-de-ejecución-y-criterios). Los repositorios frontend y backend se revisaron como carpetas hermanas. Esta evidencia local no acredita ejecuciones de GitHub Actions ni despliegues.

## Fase 0 — Unificación

- `PLAN_MVP_MIBECA.md` y `PLAN_DE_TRABAJO_MIBECA.md` tienen el mismo SHA-256 en ambos repositorios.
- Se revisaron `AGENTS.md`, `AI_CONTEXT.md`, README, borrador API, permisos, colaboración y automatizaciones. Se corrigieron en backend los documentos históricos que aún proponían cambio de rol, retiro de postulaciones y acreditaciones individuales; el borrador API sigue subordinado al plan hasta crear `openapi.yaml`.
- Se actualizó el contexto frontend con la revisión utilizada: plan general versión 1.0 y borrador backend `docs/api-v1.md` sin commit/tag fijado. La interfaz continúa siendo preliminar y no consume la API.
- `core.hooksPath` apunta a `.githooks` en los dos clones. Python 3.11.9 está disponible como `python` en el PowerShell del usuario; `python3` no funciona allí. Se ajustaron las invocaciones. El hook Git es idéntico en ambos repositorios: en un repositorio temporal permitió un commit inocuo y bloqueó uno que incluía `.env`. Los scripts del hook Codex compilaron y respondieron como se esperaba a eventos simulados permitidos y bloqueados. Su confianza/activación real en el cliente queda pendiente de verificar; no se declara ese control activo.

## Fase 1 — Entorno verificable

| Comprobación | Resultado local |
|---|---|
| Node y npm | Node 24.19.0 y npm 11.17.0 disponibles. En PowerShell se usó `npm.cmd` por la política de ejecución de scripts. |
| Docker y Compose | Docker Engine 29.1.3 disponible; `docker compose --env-file .env.example config --quiet` finalizó correctamente. |
| PostgreSQL local | Imagen `postgres:17.11`, contenedor saludable, puerto `127.0.0.1:5433` porque 5432 estaba ocupado. `.env` local ignorado por Git con clave aleatoria; `DATABASE_URL` apunta al puerto publicado de localhost. |
| Migración de infraestructura | `npm run db:migrate` finalizó correctamente sobre MiBeca local. No hay archivos SQL de dominio; se creó `schema_migrations`. |
| API de diagnóstico | `GET /health` devolvió `{"status":"ok"}` y `GET /ready` devolvió `{"status":"ready"}`. |
| Persistencia | Se creó `_mibeca_volume_probe` con una fila, se ejecutó `docker compose down` y luego `up -d postgres`; la fila `1` persistió. La tabla de prueba se eliminó después. No se borró el volumen. |
| Instalación reproducible backend | Se generó `package-lock.json`; `npm ci` y `npm run check` finalizaron correctamente. CI backend cambió de `npm install` a `npm ci`. |
| Frontend | `npm run lint` y `npm run build` finalizaron correctamente con Vite 8.3.4. |

## Conexión a Supabase (18 de octubre de 2026)

Rama `Ivan`. Se añadió el destino `MIGRATION_TARGET=supabase` conservando `local` y `render`, `DB_POOL_MAX`/`DB_POOL_IDLE_TIMEOUT_MS` en `src/db.js` y la plantilla comentada de Supabase en `.env.example`.

| Comprobación | Resultado local |
|---|---|
| Sintaxis | `npm run check` finalizó correctamente. |
| Guardas de destino | Rechazan con el mensaje esperado: `supabase` con `DATABASE_URL` en localhost, `supabase` con host que no termina en `supabase.com`, `MIGRATION_CONFIRM_HOST` distinto, `DB_SSL_MODE=disable` y un target inexistente. El camino `render` conserva su comportamiento previo. |
| Aviso de destino | El camino válido imprime `Destino: Supabase en <host>/postgres (TLS require)` sin contraseña y solo falla después, al resolver el DNS de un host inexistente. |
| Compose | `docker compose config --quiet` acepta `.env.example` con los nuevos comentarios comentados. |
| Camino local intacto | PostgreSQL 17.11 en `127.0.0.1:5432`; `npm run db:migrate` finalizó correctamente y `GET /health` y `GET /ready` respondieron correctamente. |

| Conexión real a Supabase | Verificada contra un proyecto de prueba con el pooler en modo transacción (puerto 6543). Las credenciales son válidas y `schema_migrations` se creó en la base, que estaba vacía. Exige `DB_SSL_CA_FILE` apuntando a `certs/prod-ca-2021.crt`: sin él la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN` porque la CA del pooler no está en el almacén de confianza del sistema. |

**Pendiente**: restablecer la contraseña de Supabase usada en esta prueba, que quedó expuesta en el chat, antes de usarla en serio. La CI no se modificó y sigue usando PostgreSQL efímero local; nunca recibe credenciales de Supabase.

El backend conserva `/health` y `/ready`, pero no tiene tablas ni rutas de dominio. La interfaz no usa una API real. Los workflows Firebase y backend existen; no se comprobaron ejecuciones remotas ni despliegues. La fase siguiente es contrato OpenAPI y esquema del dominio.
