# MiBeca API v1 — resumen subordinado al contrato

**Estado (19-10-2026): Auth, Usuarios, Trabajos, Postulaciones, Control y Supervisión están implementados.** El contrato canónico es [`../openapi.yaml`](../openapi.yaml), revisión 1.4.0; este documento es un resumen legible y **no** es la fuente de verdad técnica: esquemas, validaciones, ejemplos y códigos de error se toman de `openapi.yaml`. [PLAN_MVP_MIBECA.md](PLAN_MVP_MIBECA.md) define el alcance. El frontend debe indicar la revisión del contrato backend que utilice y no debe mantener una copia alternativa del contrato.

## Convenciones acordadas

- Prefijo `/api/v1`, JSON UTF-8, UUID, fechas UTC y duración en minutos enteros.
- Éxitos con `data`; listas paginadas con máximo 50 elementos y orden estable. Errores con `error.code` y `error.message`, sin trazas ni secretos.
- Respuestas 400, 401, 403, 404 y 409 según el caso. Puede usarse 404 para ocultar recursos ajenos cuando el contrato lo indique.
- Sesiones opacas de servidor mediante cookie `HttpOnly`, `Secure` en HTTPS; CSRF en escrituras y CORS con origen exacto y credenciales.
- Roles `ADMIN`, `ENCARGADO` y `BECARIO`. Rol fijo tras el alta. Cada petición verifica actividad, rol y propiedad.
- `Idempotency-Key` en el cierre de un trabajo: misma clave y contenido devuelve el resultado original; misma clave con otro contenido devuelve 409. Un cierre nuevo posterior devuelve 409.

## Rutas

Todas reciben el prefijo `/api/v1`. La columna «Estado» distingue lo implementado de lo previsto.

| Grupo | Método y ruta | Alcance | Estado |
|---|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | Sesión propia; login público. | Implementado |
| Usuarios | `POST /users`, `GET /users`, `GET /users/{id}`, `PATCH /users/{id}` | Administración de cuentas; el rol no se edita. | Implementado (solo ADMIN) |
| Usuarios | `POST /users/{id}/deactivate`, `POST /users/{id}/reactivate`, `POST /users/{id}/reset-password` | Solo administrador; desactivación y reset revocan sesiones. | Implementado |
| Trabajos | `GET /jobs`, `POST /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}` | Lectura según rol; creación y edición solo por encargado propietario antes del inicio y de cualquier aceptación. | Implementado |
| Control | `POST /jobs/{id}/close`, `GET /jobs/{id}/attendance` | Propietario; cierre único desde fin previsto y consulta posterior de asistencia. | Implementado |
| Postulaciones | `POST /jobs/{id}/applications`, `GET /jobs/{id}/applications` | Postulación propia de becario; listado del encargado propietario con semestre y progreso de beca del estudiante. | Implementado |
| Postulaciones | `POST /applications/{id}/accept`, `POST /applications/{id}/reject` | Encargado propietario antes del inicio; aceptación con control transaccional de cupo. | Implementado |
| Consultas propias | `GET /me/applications`, `GET /me/jobs` | Según rol y propiedad. | Implementado |
| Control propio | `GET /me/progress`, `GET /me/history` | Según rol y propiedad; progreso solo de becario. | Implementado |
| Resumen encargado | `GET /me/dashboard` | Solo encargado; agrega únicamente sus trabajos. | Implementado |
| Supervisión | `GET /students/progress`, `GET /students/{id}/history` | Solo administrador. | Implementado |

El cierre recibe una lista exhaustiva de `{applicationId, attended}` para todos los aceptados y la cabecera `Idempotency-Key`. El servidor toma los minutos del trabajo; el cliente no decide horas acreditadas. Los ausentes reciben cero y permanecen en el historial. Las postulaciones pendientes se rechazan con `motivo_rechazo=CIERRE_TRABAJO`. La misma clave y contenido devuelve el resultado original, mientras una clave reutilizada con contenido distinto o un cierre nuevo devuelven 409. No hay retiro de postulaciones, jornadas parciales, `completionId`, ruta de acreditación individual ni edición posterior de horas en el MVP.

## Detalles de la fase 2 implementada

Estos resúmenes no sustituyen a `openapi.yaml`:

- `POST /auth/login` recibe `correo` y `password` y devuelve `data: { usuario, requiereCambioPassword, csrfToken }` más la cookie `mibeca_session`. El correo incorrecto y la contraseña incorrecta responden con el mismo 401; hay límite de intentos por `correo|ip` y un hash señuelo para no revelar diferencias de tiempo.
- `POST /auth/change-password` recibe `passwordActual`, `passwordNuevo` y `passwordNuevoConfirmacion`; la nueva debe tener al menos `MIN_PASSWORD_LENGTH` (10 por defecto), ser distinta de la actual y coincidir con la confirmación. Revoca todas las sesiones del usuario y renueva la cookie.
- Mientras `requiereCambioPassword` es cierto, el resto de rutas de negocio responde 403; `GET /auth/me`, `POST /auth/logout` y el propio cambio siguen disponibles.
- `POST /users` exige el perfil según el rol (BECARIO: `estudiante`; ENCARGADO: `encargado`) y devuelve la contraseña temporal **una sola vez**, junto al usuario creado (201). `passwordTemporal` nunca se vuelve a exponer: ni al listar, ni al consultar uno, ni al reiniciar, donde se emite una temporal nueva.
- `GET /users` admite `rol`, `activo`, `q`, `page` y `pageSize` (máximo 50) y responde `meta: { page, pageSize, total, totalPages }`.
- `PATCH /users/{id}` edita nombre, correo y campos del perfil; enviar `rol` devuelve 400.
- Desactivar y restablecer contraseña revocan las sesiones del usuario. Reactivar no revive sesiones anteriores. Desactivar al último administrador activo devuelve 409 `ultimo_admin_activo`.

## Fase 5 implementada

La supervisión administrativa y los dashboards por rol están implementados en OpenAPI 1.3.0. La evidencia y los límites de verificación se documentan en `VERIFICACION_FASE_5.md` y el contrato canónico `openapi.yaml`.
