---
name: api-contract-validation
description: Valida cambios de la API MiBeca contra openapi.yaml, sus pruebas y la API local. Usar al añadir o modificar rutas, esquemas, respuestas o documentación del contrato.
---

# Validación del contrato API

1. Lee `openapi.yaml`, `AGENTS.md`, `docs/AI_CONTEXT.md` y el plan antes de editar.
2. Trata `openapi.yaml` como fuente canónica; `docs/api-v1.md` solo es un resumen.
3. Comprueba que rutas, parámetros, códigos de estado, errores y esquemas coincidan.
4. Añade o actualiza pruebas de API para el comportamiento nuevo, incluidos permisos y errores.
5. Ejecuta `npm run check`, `npm test` y el lint del contrato si el cambio lo afecta.
6. No inventes contratos paralelos ni pruebes contra servicios remotos sin autorización explícita.
7. Entrega la revisión del contrato usada y cualquier dependencia que el frontend deba consumir.
