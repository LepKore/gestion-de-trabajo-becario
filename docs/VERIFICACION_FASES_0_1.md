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

El backend conserva `/health` y `/ready`, pero no tiene tablas ni rutas de dominio. La interfaz no usa una API real. Los workflows Firebase y backend existen; no se comprobaron ejecuciones remotas ni despliegues. La fase siguiente es contrato OpenAPI y esquema del dominio.
