---
name: mibeca-sdd-router
description: Enruta toda instrucción recibida en el backend MiBeca hacia el flujo spec-driven development y la skill adecuada. Usar SIEMPRE al iniciar cualquier tarea en este repositorio, antes de explorar o escribir código.
---

# Enrutador skill SDD del backend MiBeca

Ante cualquier instrucción, clasifica la tarea en una fase del ciclo
**especificar → implementar → probar → desplegar** y carga las skills locales de
esa fase ANTES de escribir o modificar código.

## Reglas (obligatorias)

- **Solo skills locales**: esta skill solo nombra skills del proyecto (`mibeca-sdd-router`, `api-contract-validation`, `database-migration-safety`, `deploy-checklist`). Nunca menciones skills globales por nombre.
- **Si ninguna skill local encaja**: solo entonces analiza las skills globales disponibles en tu entorno, elige la que mejor coincida con la instrucción y úsala. Razona la elección en una línea.
- **Si tampoco hay global que encaje**: implementa de forma normal sin skills y termina la respuesta anunciando: «No se usaron skills para esta tarea: ninguna skill aplicaba a [tipo de trabajo]».

## Clasificación con skills locales

| Instrucción típica | Skills locales a cargar |
|---|---|
| "implementa / añade la funcionalidad X" | Sin spec previa: usar los comandos slash de Spec Kit (`/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`). Con spec o "tarea N": implementación. Siempre que toque API o SQL: `api-contract-validation` / `database-migration-safety`. Si no hay skill local para el resto del trabajo de implementación, aplica la regla de fallback global de arriba. |
| "cambia el contrato / openapi / el esquema" | Especificación primero: comandos slash Spec Kit (`/speckit.specify` → `/speckit.plan`). Luego `api-contract-validation`; las migraciones solo después, con `database-migration-safety`. El coordinador mantiene el contrato y su edición es de un único responsable. |
| "arregla este bug / fallan los tests" | Si el bug toca contrato o migraciones, añade las skills locales correspondientes. Para el resto del análisis, aplica la regla de fallback global. Las pruebas corren con `node:test` en `mibeca_test` local. |
| "despliega / sube a producción / revisa CI" | `deploy-checklist` como plantilla de verificación. Despliegues y migraciones remotas son informativos: exigen confirmación humana explícita. Recordar rotar la contraseña de Supabase expuesta el 18-10-2026 antes de cualquier despliegue. |
| "explora / ¿cómo funciona X?" | Graph primero (codebase-memory), fallback a read/grep. No editar. |

## Skill local no aplicable (no usar)

- `testing` (Grafana Cloud, `.agents/skills/testing/`): exige Grafana Cloud, tokens SM/k6/Faro y sondas remotas. No la uses para pruebas normales; queda como referencia futura si el equipo adopta Grafana Cloud (adaptación pendiente documentada, no respaldada).

## Fuera de alcance explícito

- `frontend-ui-engineering`, trabajo web y Firebase que no sea consumir la API:
  pertenecen al repositorio hermano `gestion-de-trabajo-becario-web`. No implementes
  UI desde este repo.

## Reglas no negociables del repositorio (recordatorio)

- Nunca ejecutes despliegues ni migraciones remotas por iniciativa propia.
- No borres volúmenes de datos (`docker compose down -v`, `docker volume rm`).
- Datos de prueba solo con comando explícito de desarrollo.
- El auditor de código no es negociable: corrige el código, no el control.
- El plan canónico es `docs/PLAN_MVP_MIBECA.md`; el contrato, `openapi.yaml`.
  El siguiente cambio de dominio se especifica (contrato + esquema + reglas)
  antes de migraciones y pruebas.
