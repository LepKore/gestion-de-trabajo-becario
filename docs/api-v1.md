# MiBeca API v1 — resumen subordinado al contrato

**Estado (19-10-2026): Auth y Usuarios están implementados.** El contrato canónico es [`../openapi.yaml`](../openapi.yaml); este documento es un resumen legible y **no** es la fuente de verdad técnica: esquemas, validaciones, ejemplos y códigos de error se toman de `openapi.yaml`. [PLAN_MVP_MIBECA.md](PLAN_MVP_MIBECA.md) define el alcance. Las rutas de trabajos, postulaciones y control (fases 3 y 4) siguen sin implementar. El frontend debe indicar el commit o tag del contrato backend que utilice y no debe mantener una copia alternativa del contrato.

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
| Trabajos | `GET /jobs`, `POST /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}` | Lectura según rol; creación y edición solo por encargado propietario antes del inicio y de cualquier aceptación. | Previsto |
| Trabajos | `POST /jobs/{id}/close` | Propietario; tras el fin previsto, cierre único con asistencia exhaustiva. | Previsto |
| Postulaciones | `POST /jobs/{id}/applications`, `GET /jobs/{id}/applications` | Postulación propia de becario; listado del encargado propietario. | Previsto |
| Postulaciones | `POST /applications/{id}/accept`, `POST /applications/{id}/reject` | Encargado propietario antes del inicio; aceptación con control transaccional de cupo. | Previsto |
| Consultas propias | `GET /me/applications`, `GET /me/progress`, `GET /me/history`, `GET /me/jobs` | Según rol y propiedad. | Previsto |
| Supervisión | `GET /students/progress`, `GET /students/{id}/history` | Solo administrador. | Previsto |

El cierre recibe una lista exhaustiva de `{applicationId, attended}` para todos los aceptados. El servidor toma los minutos del trabajo; el cliente no decide horas acreditadas. Los ausentes reciben cero y permanecen en el historial. Las postulaciones pendientes se rechazan por cierre. No hay retiro de postulaciones, jornadas parciales, `completionId`, ruta de acreditación individual ni edición posterior de horas en el MVP.

## Detalles de la fase 2 implementada

Estos resúmenes no sustituyen a `openapi.yaml`:

- `POST /auth/login` recibe `correo` y `password` y devuelve `data: { usuario, requiereCambioPassword, csrfToken }` más la cookie `mibeca_session`. El correo incorrecto y la contraseña incorrecta responden con el mismo 401; hay límite de intentos por `correo|ip` y un hash señuelo para no revelar diferencias de tiempo.
- `POST /auth/change-password` recibe `passwordActual`, `passwordNuevo` y `passwordNuevoConfirmacion`; la nueva debe tener al menos `MIN_PASSWORD_LENGTH` (10 por defecto), ser distinta de la actual y coincidir con la confirmación. Revoca todas las sesiones del usuario y renueva la cookie.
- Mientras `requiereCambioPassword` es cierto, el resto de rutas de negocio responde 403; `GET /auth/me`, `POST /auth/logout` y el propio cambio siguen disponibles.
- `POST /users` exige el perfil según el rol (BECARIO: `estudiante`; ENCARGADO: `encargado`) y devuelve la contraseña temporal **una sola vez**, junto al usuario creado (201). `passwordTemporal` nunca se vuelve a exponer: ni al listar, ni al consultar uno, ni al reiniciar, donde se emite una temporal nueva.
- `GET /users` admite `rol`, `activo`, `q`, `page` y `pageSize` (máximo 50) y responde `meta: { page, pageSize, total, totalPages }`.
- `PATCH /users/{id}` edita nombre, correo y campos del perfil; enviar `rol` devuelve 400.
- Desactivar y restablecer contraseña revocan las sesiones del usuario. Reactivar no revive sesiones anteriores. Desactivar al último administrador activo devuelve 409 `ultimo_admin_activo`.

## Pendiente de contrato

Para las fases 3 y 4 quedan por concretar en `openapi.yaml` el resultado del cierre, la política de 403/404 de trabajos y postulaciones, las consultas propias y la supervisión. Ningún formulario frontend debe suponer disponible una ruta marcada como prevista.