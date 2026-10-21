---
name: mibeca-sdd-router
description: Enruta toda instrucción recibida en el backend MiBeca hacia el flujo spec-driven development y la skill adecuada. Usar SIEMPRE al iniciar cualquier tarea en este repositorio, antes de explorar o escribir código.
---

# Enrutador skill SDD del backend MiBeca

Ante cualquier instrucción, clasifica la tarea en una fase del ciclo
**especificar → implementar → probar → desplegar** y carga las skills de esa fase
ANTES de escribir o modificar código.

## Orden de resolución de skills (obligatorio)

1. **Skill de este proyecto primero** (`.agents/skills/`): `mibeca-sdd-router` (esta), `api-contract-validation`, `database-migration-safety`, `spec-driven-development`, `deploy-checklist`. Siempre tienen prioridad sobre cualquier equivalente global.
2. **Skill global** si no hay una del proyecto que aplique al tipo de trabajo.
3. **Sin skill** solo si ninguna encaja: implementa de forma normal.

Cierre obligatorio: si NO se usó ninguna skill, termina la respuesta con un
mensaje claro que lo indique, por ejemplo: «No se usaron skills para esta tarea:
ninguna skill aplicaba a [tipo de trabajo]».

## Clasificación por tipo de instrucción

| Instrucción típica | Skills a cargar |
|---|---|
| "implementa / añade la funcionalidad X" | Sin spec previa: `spec-driven-development` del proyecto (fase 1 Specify). Con spec o "tarea N": `spec-driven-development` fase Implement + `learn-through-sdd`. Siempre añadir `incremental-implementation` y `test-driven-development`. Si toca API: `api-contract-validation`. Si toca SQL/migraciones: `database-migration-safety`. |
| "cambia el contrato / openapi / el esquema" | Especificación primero: `spec-driven-development` + `api-and-interface-design`; luego `api-contract-validation`; las migraciones solo después, con `database-migration-safety`. El coordinador mantiene el contrato y su edición es de un único responsable. |
| "arregla este bug / fallan los tests" | `debugging-and-error-recovery` + `test-driven-development` (prueba de regresión primero). Si el bug toca contrato o migraciones, añadir las skills de proyecto correspondientes. |
| "despliega / sube a producción / revisa CI" | `shipping-and-launch` + `ci-cd-and-automation`. Despliegues y migraciones remotas son informativos: exigen confirmación humana explícita. Recordar rotar la contraseña de Supabase expuesta el 18-10-2026 antes de cualquier despliegue. |
| "despliega / sube a producción / revisa CI" | `deploy-checklist` del proyecto como plantilla de verificación + `shipping-and-launch` + `ci-cd-and-automation`. Despliegues y migraciones remotas son informativos: exigen confirmación humana explícita. Recordar rotar la contraseña de Supabase expuesta el 18-10-2026 antes de cualquier despliegue. |
| "revisa / audita / valida mi cambio" | `code-review-and-quality` + `doubt-driven-development`; ejecutar `audit_code` en scope `changed` y delegar revisión independiente al subagente `reviewer` cuando exista. |
| "explora / ¿cómo funciona X?" | Graph primero (codebase-memory), fallback a read/grep. No editar. |
| Documentación / registro de decisiones | `documentation-and-adrs`. |

## Skill no aplicable (no usar en este repositorio)

- `testing` (Grafana Cloud, instalada en `.agents/skills/testing/`): exige Grafana Cloud, tokens SM/k6/Faro y sondas remotas. **No la uses** para pruebas normales: aquí las pruebas son `node:test` en `mibeca_test` local. Queda solo como referencia futura si el equipo adopta Grafana Cloud; es una adaptación pendiente documentada, no respaldada.

## Fuera de alcance explícito
| Documentación / registro de decisiones | `documentation-and-adrs`. |

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
