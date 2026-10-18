# MiBeca API v1 — borrador subordinado al plan

Este documento enumera las rutas previstas; **ninguna ruta de negocio está implementada todavía**. [PLAN_MVP_MIBECA.md](PLAN_MVP_MIBECA.md) define el alcance. Antes de desarrollar rutas de negocio se creará `../openapi.yaml` como contrato canónico, con esquemas, permisos, respuestas y errores completos. El frontend deberá indicar el commit o tag del contrato backend que utilice.

## Convenciones acordadas

- Prefijo `/api/v1`, JSON UTF-8, UUID, fechas UTC y duración en minutos enteros.
- Éxitos con `data`; listas paginadas con máximo 50 elementos y orden estable. Errores con `error.code` y `error.message`, sin trazas ni secretos.
- Respuestas 400, 401, 403, 404 y 409 según el caso. Puede usarse 404 para ocultar recursos ajenos cuando el contrato lo indique.
- Sesiones opacas de servidor mediante cookie `HttpOnly`, `Secure` en HTTPS; CSRF en escrituras y CORS con origen exacto y credenciales.
- Roles `ADMIN`, `ENCARGADO` y `BECARIO`. Rol fijo tras el alta. Cada petición verifica actividad, rol y propiedad.
- `Idempotency-Key` en el cierre de un trabajo: misma clave y contenido devuelve el resultado original; misma clave con otro contenido devuelve 409. Un cierre nuevo posterior devuelve 409.

## Rutas previstas

Todas reciben el prefijo `/api/v1`.

| Grupo | Método y ruta | Alcance |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | Sesión propia; login público. |
| Usuarios | `POST /users`, `GET /users`, `GET /users/{id}`, `PATCH /users/{id}` | Administración de cuentas; consulta propia según contrato. El rol no se edita. |
| Usuarios | `POST /users/{id}/deactivate`, `POST /users/{id}/reactivate`, `POST /users/{id}/reset-password` | Solo administrador; desactivación y reset revocan sesiones. |
| Trabajos | `GET /jobs`, `POST /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}` | Lectura según rol; creación y edición solo por encargado propietario antes del inicio y de cualquier aceptación. |
| Trabajos | `POST /jobs/{id}/close` | Propietario; tras el fin previsto, cierre único con asistencia exhaustiva. |
| Postulaciones | `POST /jobs/{id}/applications`, `GET /jobs/{id}/applications` | Postulación propia de becario; listado del encargado propietario. |
| Postulaciones | `POST /applications/{id}/accept`, `POST /applications/{id}/reject` | Encargado propietario antes del inicio; aceptación con control transaccional de cupo. |
| Consultas propias | `GET /me/applications`, `GET /me/progress`, `GET /me/history`, `GET /me/jobs` | Según rol y propiedad. |
| Supervisión | `GET /students/progress`, `GET /students/{id}/history` | Solo administrador. |

El cierre recibe una lista exhaustiva de `{applicationId, attended}` para todos los aceptados. El servidor toma los minutos del trabajo; el cliente no decide horas acreditadas. Los ausentes reciben cero y permanecen en el historial. Las postulaciones pendientes se rechazan por cierre. No hay retiro de postulaciones, jornadas parciales, `completionId`, ruta de acreditación individual ni edición posterior de horas en el MVP.

## Pendiente para OpenAPI

Concretar campos obligatorios, validaciones, ejemplos, paginación, política de 403/404, errores por estado y la forma exacta del resultado del cierre. Ningún formulario frontend debe suponer que este borrador es una API disponible.
