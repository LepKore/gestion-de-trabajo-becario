# Verificación de fase 4 — 19 de octubre de 2026

La fase 4 de `PLAN_DE_TRABAJO_MIBECA.md` está implementada en backend y frontend y verificada en local. Contrato canónico: `openapi.yaml` 1.2.0, cambios de trabajo todavía sin commit/tag.

## Funcionalidad entregada

- `POST /jobs/{id}/close`: propietario activo, CSRF e `Idempotency-Key`, solo desde el fin previsto según PostgreSQL. Bloquea el trabajo y valida todos los aceptados exactamente una vez. Registra asistencia y minutos, rechaza pendientes por cierre, audita y cierra en una transacción.
- Asistentes reciben la duración completa y ausentes cero. Un estudiante aceptado luego desactivado conserva su relación. No hay edición posterior de asistencia ni horas desde la API.
- Reintentos de la misma clave/contenido devuelven el resultado original, incluso con orden distinto de la lista o UUID de ruta en mayúsculas. Otra clave tras el cierre o contenido distinto devuelve conflicto. Restricciones únicas impiden doble acreditación.
- `GET /me/progress` calcula meta, acreditadas, faltantes y excedentes del becario. `GET /me/history` devuelve historial propio según rol, incluidas ausencias; `GET /jobs/{id}/attendance` limita el detalle al encargado propietario.
- Frontend: cierre con asistencia/ausencia explícita, clave estable en reintentos, historial y progreso reales del becario e historial/asistencias del encargado. Mantiene el tema, estados de carga/error/vacío y adaptación móvil.

## Evidencia ejecutada

| Comprobación | Resultado |
|---|---|
| Backend `npm run check` | Sintaxis correcta en 30 archivos |
| Backend `npm test` | 42/42, sin fallos ni omisiones, exclusivamente `127.0.0.1:5433/mibeca_test` |
| Migraciones 0001–0003 desde cero en prueba | Aplicadas; segunda ejecución «Migraciones al día» |
| Migración en desarrollo | 0003 aplicada en `127.0.0.1:5433/mibeca_dev`, con `MIGRATION_TARGET=local`; conserva registros existentes |
| Redocly CLI 1.34.2 | OpenAPI válido; único aviso previo `info-license-strict` |
| Frontend lint/build/test | Correctos; 14/14 pruebas |
| Chromium real contra API/PostgreSQL de prueba | Cierre deshabilitado hasta marcar ambos aceptados; asistencia 276 minutos y ausencia cero; detalle del encargado y progreso/historial de ambos becarios correctos |
| Móvil, 390 × 844 | Historial sin desbordamiento horizontal; cero errores JavaScript en el recorrido |
| Revisión independiente | Hallazgo de UUID mayúsculo corregido y cubierto; sin bloqueantes restantes |

Para el recorrido de navegador se levantaron API y Vite temporales sobre la base local de prueba. Los servidores se detuvieron y los scripts temporales se retiraron. No se cargaron datos de demostración en la base de desarrollo.

## Coordinación y límites

Se usaron subagentes independientes para backend, frontend y revisión, con propiedad separada de archivos; el coordinador mantuvo contrato/documentación e hizo verificaciones finales y navegador.

El hook local rechazó la orden de migración sin destino visible. Se revisó su regla y se usó su formato permitido, fijando efectivamente `MIGRATION_TARGET=local`; el migrador comprobó el host local. No se modificaron controles.

No se ejecutaron despliegues ni migraciones remotas ni se verificó CI en GitHub. La fase 5 (dashboards y supervisión administrativa) sigue pendiente. Cada clon debe aplicar sus migraciones locales antes de usar las rutas nuevas.

## Corrección de entrada de fechas — 19 de octubre de 2026

Una captura del usuario mostró que ingresar una hora local futura se rechazaba porque el formulario la interpretaba como UTC. Se corrigió el frontend para introducir y editar fechas en `VITE_TIME_ZONE` (por defecto `America/La_Paz`) y convertirlas automáticamente a UTC para la API. No se cambió el contrato ni la regla de inicio futuro.

La regresión reproduce el caso: 19/10/2026 a las 12:41 en Bolivia corresponde a las 16:41 UTC. La edición convierte en sentido inverso y conserva el instante original. También se validan fechas imposibles y horas inexistentes por cambio horario.

Un recorrido real de Chromium contra la API y `mibeca_test` publicó correctamente para el día actual, diez minutos después del reloj real: respuesta 201, instante UTC correcto y valores locales conservados al abrir edición. Los servidores y scripts temporales se retiraron. No se alteraron datos de desarrollo.
