# Contexto de agentes: backend MiBeca

## 1. Propósito y alcance

Este repositorio contiene la API Node.js y PostgreSQL local. El frontend vive en el repositorio hermano `gestion-de-trabajo-becario-web`. El coordinador de la raíz asigna archivos y evita ediciones simultáneas.

## 2. Stack y estructura comprobados

Existen `compose.yaml` con PostgreSQL, `src/db.js`, `src/server.js`, `scripts/migrate.js`, `migrations/`, `package-lock.json` y CI backend. No hay todavía tablas ni endpoints de dominio. Se dispone de `/health` y `/ready`. Consultar `package.json` antes de afirmar versiones o scripts vigentes.

## 3. Instalación y comandos

Seguir `README.md` para `.env`, Docker, migraciones y servidor. Compose carga su configuración; el proceso Node carga `.env` por separado. La base de otro proyecto en Render queda fuera de alcance.

## 4. Reglas y contrato

El plan canónico es `docs/PLAN_MVP_MIBECA.md`. Hasta que exista `openapi.yaml` validado, `docs/api-v1.md` es un borrador alineado en alcance pero incompleto como contrato técnico. El coordinador mantiene el contrato y asigna su edición a un único responsable.

## 5. Estado y verificaciones

El 18-10-2026 se comprobó Node 24.19.0 y Docker Engine 29.1.3. `docker compose config --quiet` y `npm run check` pasaron; PostgreSQL 17.11 quedó saludable en el puerto local 5433 porque 5432 estaba ocupado. `npm run db:migrate` creó solo `schema_migrations`. `/health` y `/ready` respondieron correctamente. Una fila de prueba sobrevivió a `docker compose down` y `up` con el mismo volumen y la tabla de prueba se eliminó después. `package-lock.json` se generó y CI cambió a `npm ci`. En frontend pasaron `npm run lint` y `npm run build`. El MVP funcional, las pruebas de permisos y la ejecución real de CI remoto siguen pendientes.

`core.hooksPath` está configurado en ambos clones. El PowerShell del usuario dispone de Python 3.11.9 como `python`; `python3` no funciona en Windows, por lo que se corrigieron las invocaciones de los hooks. El hook Git, idéntico en ambos repositorios, permitió un commit inocuo y bloqueó un `.env` en un repositorio temporal. Los scripts del hook Codex compilaron y respondieron correctamente a eventos simulados; su confianza/activación real en el cliente aún está pendiente de verificar. Ver [automation.md](automation.md).

## 6. Límites y siguientes tareas

No inferir que documentos propuestos son funcionalidades implementadas. El siguiente cambio de dominio requiere cerrar contrato, esquema y reglas del plan, después migraciones y pruebas. Entregar al coordinador rutas, resultados, riesgos y cambios de contrato que necesite frontend. No ejecutar despliegues ni migraciones remotas por iniciativa del perfil.
