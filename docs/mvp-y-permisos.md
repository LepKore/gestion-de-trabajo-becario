# MiBeca: alcance del MVP y permisos

Este resumen se subordina a [PLAN_MVP_MIBECA.md](PLAN_MVP_MIBECA.md). Describe el objetivo acordado, no funciones ya implementadas. El contrato técnico futuro será `../openapi.yaml`; [api-v1.md](api-v1.md) sigue siendo un borrador.

## Flujo mínimo

El administrador inicial se crea mediante un comando explícito. Luego crea cuentas de estudiantes y encargados y fija la meta individual de minutos. El encargado publica un trabajo con inicio, fin, duración acreditable y cupos. El estudiante se postula; el encargado acepta o rechaza antes del inicio. Solo una aceptación reserva cupo. Tras el fin previsto, el encargado cierra el trabajo una sola vez y registra la asistencia de **todos** los aceptados. En una transacción, el sistema registra asistencia, acredita la duración completa a quienes asistieron, acredita cero a quienes faltaron y cierra el trabajo. El estudiante consulta progreso e historial.

## Reglas de datos

- Roles fijos tras el alta: `ADMIN`, `ENCARGADO` y `BECARIO`. No hay registro público.
- Código académico de exactamente cinco dígitos, almacenado como texto para conservar ceros iniciales.
- Meta individual y duración en minutos enteros. Las horas de entrada son positivas y admiten como máximo un decimal; por ello los minutos deben ser múltiplos de seis.
- Una postulación por pareja estudiante/trabajo, con estado `PENDIENTE`, `ACEPTADA` o `RECHAZADA`. No hay retiro ni cancelación de postulaciones en este MVP.
- Cada trabajo representa una actividad y tiene un cierre único. La asistencia y los minutos acreditados quedan inmutables tras el cierre. No se usa `completionId`.
- La desactivación es lógica, revoca sesiones y conserva relaciones e historial. No se puede desactivar al último administrador activo.

## Permisos

| Acción | Becario | Encargado | Administrador |
|---|---|---|---|
| Login, logout y cambio de contraseña propia | Sí | Sí | Sí |
| Consultar trabajos publicados o cerrados | Sí | Sí | Sí |
| Postularse y consultar postulaciones | Solo propias | Postulantes de trabajos propios | Supervisión |
| Crear, editar y cerrar trabajos | No | Solo propios, según estado | No |
| Aceptar o rechazar postulaciones | No | Solo de trabajos propios | No |
| Consultar asistencia y horas | Propias | De sus trabajos | Progreso global básico |
| Crear y gestionar cuentas y metas | No | No | Sí |
| Alterar horas ya cerradas | No | No | No |

El encargado ve únicamente nombre, código, carrera y estado de los postulantes de sus trabajos. La API comprueba rol, cuenta activa y propiedad en cada operación; ocultar controles en el frontend no concede seguridad.

## Seguridad y aceptación

La autenticación prevista utiliza contraseñas con hash resistente, sesiones opacas en servidor, cookies `HttpOnly`, CSRF en escrituras, CORS con orígenes exactos y límite de intentos de login. El alta ordinaria entrega una contraseña temporal aleatoria una sola vez y exige cambiarla antes de usar el negocio. El reset administrativo revoca sesiones.

El MVP estará completo cuando el flujo funcione de punta a punta contra PostgreSQL, sobreviva a recrear el contenedor sin borrar el volumen y supere las pruebas de permisos, cupos concurrentes, cierre atómico e idempotencia descritas en el plan general. La infraestructura y las pantallas preliminares no acreditan ese resultado.
