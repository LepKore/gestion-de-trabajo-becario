# MiBeca — Plan de trabajo por fases

**Versión 1.0 — 18 de octubre de 2026.** Guía de ejecución por fases para la primera entrega.

Este archivo se conserva por separado del plan general `PLAN_MVP_MIBECA.md`: organiza las tareas y sus criterios de aceptación sin reemplazar ese documento. Si surge una diferencia de alcance, resolverla y sincronizar ambos antes de implementar.

## Decisiones confirmadas y criterios de esta entrega

- El proyecto y la aplicación se llaman **MiBeca**.
- Integrantes: Erick Magueño, Sergio Ramos e Ivan Zabala.
- Dos repositorios independientes: `gestion-de-trabajo-becario-web` y `gestion-de-trabajo-becario-backend`.
- Frontend: React con Vite, JavaScript y ESLint; identidad visual y Firebase Hosting ya configurados según el reporte. Comprobar su funcionamiento real.
- Backend: Node.js con Express y API REST por capas ligeras. Conservar el acceso PostgreSQL y las migraciones SQL explícitas existentes tras verificarlos; Prisma no es un requisito.
- Persistencia inicial: PostgreSQL en Docker Compose, con volumen persistente. El backend se ejecuta localmente fuera del contenedor.
- Despliegue futuro: frontend en Firebase Hosting y backend/base MiBeca en Render. La base Render de otro proyecto no se toca.
- Roles: `ADMIN`, `ENCARGADO` y `BECARIO`; etiquetas visibles Administrador, Encargado y Estudiante becario.
- Docente y encargado son el mismo rol; su contexto puede ser materia, facultad o área.
- El administrador crea las cuentas; no hay registro público.
- Código académico de exactamente cinco dígitos, conservado como texto; meta de horas individual para un único periodo de demostración.
- El estudiante se postula y el encargado acepta o rechaza. Solo las aceptaciones reservan cupo.
- Cada trabajo representa una actividad y se cierra una sola vez. El encargado registra la asistencia de todos los aceptados; únicamente los asistentes reciben la duración completa.
- Horas positivas con un máximo de un decimal; almacenamiento y operaciones en minutos enteros múltiplos de seis.
- Sesiones opacas de servidor con cookies, revocación y protección CSRF; JWT no es un requisito.

Este documento define el objetivo, no acredita funciones implementadas. Las simplificaciones adoptadas son decisiones del plan para acotar el MVP; no deben presentarse como reglas oficiales de la universidad.

## Objetivo y alcance del primer MVP

Entregar un flujo completo: administrador crea usuarios → encargado publica un trabajo → estudiante se postula → encargado acepta dentro del cupo → encargado cierra y registra asistencia → el sistema acredita horas una sola vez → estudiante consulta progreso e historial.

Incluye Auth, Usuarios, Trabajos y Control, más una consulta administrativa básica de progreso. No exige construir cinco módulos completos.

**Fuera de esta entrega:** calificaciones, reputación, penalizaciones, evaluaciones, retiro de postulaciones, solicitudes de retiro, cancelación de trabajos, reasignación de encargados, corrección de horas cerradas, reportes avanzados, exportaciones, correo, notificaciones, archivos, calendario avanzado, registro público, recuperación automática de contraseña, múltiples roles e instituciones.

**Funciones del plan del compañero aplazadas para futuras etapas:** evaluaciones de 1 a 5 y reputación; retiro previo al inicio con solicitud/autorización y penalización; y reportes administrativos adicionales a la consulta básica incluida aquí. Sus reglas y prioridad se concretarán antes de implementarlas. No generar sus tablas, rutas o pantallas en este MVP. Prisma y JWT son alternativas técnicas, no funciones comprometidas para el futuro.

## Fase 0 — Contexto, configuración y coordinación

1. Leer el estado real de ambos repositorios y conservar la infraestructura y el diseño útiles. No reconstruir lo existente.
2. Mantener este archivo en `docs/PLAN_DE_TRABAJO_MIBECA.md` en ambos repositorios con la misma versión. Backend mantiene la fuente funcional principal; sincronizar cambios mediante PR enlazados.
3. Actualizar los documentos anteriores —MVP/permisos, contrato, colaboración y automatizaciones— para eliminar contradicciones. Mantener el alcance acordado en el plan general y reflejar cualquier cambio aprobado en ambos documentos.
4. Mantener `AGENTS.md` y un `AI_CONTEXT.md` específico por repositorio con seis secciones: propósito/alcance; stack/estructura comprobados; instalación/comandos; reglas/contrato; estado/verificaciones; límites/siguientes tareas.
5. Separar hechos comprobados de propuestas y pruebas no ejecutadas. No incluir secretos ni declarar activa una herramienta solo porque exista su configuración.
6. Variables: frontend solo URL pública API y configuración pública; backend DATABASE_URL, puerto, entorno, orígenes permitidos y configuración de sesión. Ejemplos ficticios en `.env.example`; archivos reales fuera de Git.
7. Verificar Docker Compose: versión explícita de PostgreSQL, healthcheck, volumen nombrado y puerto configurable solo en 127.0.0.1. No cambiar arbitrariamente la imagen existente.
8. Comprobar carga de `.env` tanto en Compose como en Node: son procesos separados. Node usa localhost y el puerto publicado; el nombre del servicio sirve entre contenedores.
9. Definir scripts de instalación, desarrollo, arranque, migraciones, lint y pruebas. No agregar un build backend vacío si JavaScript no necesita compilación. Versionar lockfile y usar instalación reproducible en CI.
10. Verificar persistencia tras detener/recrear conservando volumen. No usar `down -v` para detener la base. Cada integrante mantiene su propia base; Git no sincroniza sus registros.

### Hooks y subagentes

- Comprobar versión de Codex y formato soportado. Para una sesión desde la carpeta padre, preparar configuración coordinadora que descubra los agentes/hooks sin asumir búsqueda recursiva de los repositorios hijos. Conservar configuración por repositorio para los compañeros y evitar ejecuciones duplicadas.
- Principal coordina contrato e integración; subagente frontend trabaja en web; backend-datos trabaja en API/DB; revisor verifica inicialmente en lectura. Asignar archivos y entregables claros, usando ramas/worktrees cuando corresponda. Los perfiles no son permisos de sandbox ni memoria compartida.
- Registrar uso real de subagentes. No activarlos sin trabajo independiente suficiente.
- Hook Codex: proteger borrado de volúmenes y destinos ambiguos; permitir iniciar/detener/recrear sin borrar datos. Hook Git: revisar secretos staged sin imprimirlos; activar por clon con `git config core.hooksPath .githooks`.
- Revisar y confiar en los hooks según el cliente. Probar su invocación real con operaciones inocuas, además de probar el script.
- Autorizaciones de chat no cambian automáticamente una regla ejecutable. Una excepción destructiva requiere procedimiento humano concreto, de una sola operación y destino; el agente no se autoautoriza ni desactiva controles. Si no existe mecanismo compatible, documentar la vía manual.
- No bloquear por palabras aisladas. Informar acción, capa y causa ante un rechazo. Los hooks locales no protegen todos los equipos ni paneles externos.

**Aceptación:** entorno reproducible, datos persistentes, documentación coherente y controles cuya activación esté demostrada o marcada como pendiente.

## Fase 1 — Contrato, modelo de datos y seguridad

1. Crear `openapi.yaml` canónico en backend antes de implementar rutas de negocio y validarlo en CI. Frontend referencia commit/tag y usa mocks compatibles mientras se implementa la API.
2. Convenciones: `/api/v1`, JSON, UUID, UTC, duraciones en minutos, respuesta `data`, errores `code/message`, paginación con máximo 50 y respuestas 400/401/403/404/409 según caso. No devolver secretos ni trazas.
3. Definir una única migración inicial del dominio y un único sistema de migraciones; no superponer Prisma e historial SQL propio.
4. Crear las entidades mínimas:

| Entidad | Campos y restricciones |
|---|---|
| Usuario | UUID, nombre, correo normalizado único, hash, rol fijo, activo, cambio de contraseña requerido y fechas. |
| Estudiante | Usuario, código único de cinco dígitos como texto, carrera, semestre entero positivo y meta en minutos. |
| Encargado | Usuario, tipo de contexto materia/facultad/área y nombre del contexto. |
| Trabajo | Propietario, título, descripción, contexto copiado al publicar, ubicación, inicio/fin previsto, duración acreditable, cupos, estado y fechas. |
| Postulación | Trabajo, estudiante, estado y fechas; única por pareja trabajo/estudiante. |
| Asistencia/acreditación | Postulación aceptada única, asistió, minutos otorgados, responsable y fecha de cierre. |
| Sesión | Usuario, representación segura del secreto opaco, vencimiento y revocación. |
| Auditoría | Actor, acción, recurso y fecha para altas, cambios sensibles, metas, desactivaciones y cierre; sin secretos. |

5. Usar hash resistente a contraseñas mediante biblioteca mantenida. Cookies HttpOnly, Secure en HTTPS, CSRF para escrituras y CORS con orígenes exactos y credenciales. Definir vencimiento y limitar intentos de login.
6. Verificar en backend rol, estado activo y propiedad en cada operación. Desactivar, restablecer contraseña o cerrar sesión revoca las sesiones correspondientes.
7. Horas de entrada: positivas, máximo un decimal. Convertir 4.6 a 276 minutos; exigir múltiplos de seis. El formulario puede convertir coma decimal; JSON usa formato numérico estándar. Rechazar precisión extra sin redondear silenciosamente.
8. Guardar inicio/fin en UTC y mostrar zona universitaria configurada. Duración acreditable explícita: no deducirla del reloj ni aplicar redondeos implícitos.

**Aceptación:** contrato coherente, migraciones aplicables desde cero y restricciones probadas contra PostgreSQL efímero o local de prueba.

## Fase 2 — Auth y Usuarios

1. Implementar bajo `/api/v1`:
   - `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
   - `POST /auth/change-password`.
   - `POST /users`, `GET /users`, `GET /users/{id}`, `PATCH /users/{id}` para administrador.
   - `POST /users/{id}/deactivate`, `/reactivate`, `/reset-password` para administrador.
2. Crear primer administrador mediante comando interactivo explícito sobre destino MiBeca revisado; nunca credenciales predeterminadas, en logs/Git o ejecución automática al migrar.
3. Administrador puede crear usuarios de los tres roles. Becario exige código/carrera/semestre/meta; encargado exige contexto.
4. Generar contraseña temporal aleatoria, mostrarla una vez al administrador y entregarla personalmente. Exigir cambio antes de acceder al negocio. Restablecimiento administrativo revoca sesiones y genera otra temporal; sin correo.
5. Editar nombre/correo y campos del perfil. Rol fijo tras alta; no conversiones de rol con historial en esta entrega.
6. Baja lógica conserva historial; reactivar no revive sesiones viejas. Impedir desactivar al último administrador activo.
7. Frontend: login, cambio obligatorio, sesión recuperada con `/auth/me`, navegación y rutas por rol. Eliminar el selector de rol de demostración del flujo real.

**Aceptación:** administrador crea estudiante y encargado, ambos acceden y cambian contraseña; permisos y revocación funcionan en API y UI.

## Fase 3 — Trabajos y postulaciones

1. Implementar:
   - `GET /jobs`, `POST /jobs`, `GET /jobs/{id}`, `PATCH /jobs/{id}`.
   - `POST /jobs/{id}/applications` y `GET /jobs/{id}/applications`.
   - `POST /applications/{id}/accept` y `/reject`.
   - `GET /me/applications` y `GET /me/jobs`, con alcance según rol.
2. Trabajo: estados persistidos PUBLICADO y CERRADO. Derivar próximo/en curso/finalizado pendiente de cierre a partir de fechas.
3. Publicar exige inicio futuro, fin posterior, duración positiva y cupos enteros positivos. Solo propietario crea y administra.
4. Editar únicamente antes del inicio y antes de cualquier aceptación. Una vez aceptado alguien, condiciones fijas.
5. Postulación: PENDIENTE, ACEPTADA o RECHAZADA. Solo becarios activos pueden postular antes del inicio y con cupo disponible. No hay retiro ni reversión de decisiones en el MVP.
6. Pendientes no reservan cupo; explicarlo en UI. Aceptar exige cuenta activa, trabajo no iniciado y cupo disponible, todo verificado en transacción con bloqueo/actualización condicional.
7. Única postulación por becario/trabajo. Rechazar duplicados y operaciones fuera de estado; no eliminar historial.
8. Encargado ve solo datos básicos necesarios de postulantes de sus trabajos: nombre, código, carrera y estado. Sin consulta global ni credenciales.
9. Frontend: publicar/gestionar para encargado y explorar/postular/consultar estado para estudiante. Listados con estados vacíos, carga y errores.

**Aceptación:** flujo real de postulación/aceptación; dos aceptaciones concurrentes sobre el último cupo no generan sobrecupo.

## Fase 4 — Control: cierre, asistencia y horas

1. `POST /jobs/{id}/close` solo para propietario activo, desde el fin previsto según reloj del servidor.
2. Recibir lista exhaustiva de `{applicationId, attended}` de todos los aceptados. Backend rechaza faltantes, extras y duplicados; cliente no decide horas otorgadas.
3. En una transacción: bloquear trabajo, verificar estado, registrar asistencia, acreditar duración completa a asistentes y cero a ausentes, rechazar pendientes con motivo de cierre, auditar y marcar CERRADO.
4. Aceptados luego desactivados conservan relación y pueden tener su asistencia registrada.
5. Restricción única por postulación y cierre único evitan duplicados. Usar Idempotency-Key: misma clave/contenido devuelve resultado anterior; misma clave con otro contenido devuelve conflicto; nuevo segundo cierre devuelve conflicto.
6. No usar completionId ni jornadas parciales: cada trabajo es una actividad. Más jornadas requieren trabajos separados.
7. Inmutabilidad posterior: no editar duración, asistentes u horas desde la aplicación en este MVP.
8. Exponer `GET /me/progress` y `GET /me/history`: meta, realizadas, faltantes y excedentes, con historial de trabajo, responsable, fechas, estado y asistencia. Incluir ausencias sin acreditarlas.
9. Realizadas = suma acreditada; faltantes = max(meta − realizadas, 0); excedentes = max(realizadas − meta, 0). No contar postulaciones ni horas previstas como realizadas.
10. Encargado consulta historial y asistencia solo de sus trabajos; frontend exige marcar explícitamente asistencia o ausencia antes del cierre.

**Aceptación:** cierre atómico e irrepetible; ambos historiales conservan asistencia y las horas coinciden con los asistentes.

## Fase 5 — Dashboards y consulta administrativa básica

1. Estudiante: meta, realizadas, faltantes, excedentes, postulaciones e historial.
2. Encargado: trabajos propios, postulantes y trabajos pendientes de cierre, con asistentes en historial.
3. Administrador: gestión de cuentas y consulta de progreso de estudiantes, con filtro de horas pendientes y detalle de historial.
4. Implementar `GET /students/progress` y `GET /students/{id}/history` solo para administrador. Sin exportaciones, gráficos avanzados ni módulo independiente de reportes.
5. Administrador puede supervisar trabajos, pero no aceptar postulantes, cerrar trabajos ajenos ni modificar horas. Encargado no consulta historial global.
6. Conservar tema en `src/styles/theme.css`, azul extraído reportado #06175D y blanco visual #FFFFFF; no afirmar que son colores institucionales oficiales. Verificar logo existente, sin deformarlo.
7. Variables semánticas compartidas para colores/estados, tipografía, espaciado, radios y sombras. Componentes reutilizan el tema sin HEX dispersos.
8. Aplicar diseño adaptable, contraste AA, foco visible, teclado, etiquetas y estados de carga/error/vacío. No mostrar reputación ni métricas ficticias.

**Aceptación:** dashboards consumen datos reales y respetan alcance por rol, móvil y teclado.

## Fase 6 — Calidad, CI/CD y operación

1. Pruebas backend prioritarias:
   - Login válido/inválido, contraseña obligatoria y rutas protegidas.
   - Logout/desactivación/reset revocan sesiones; último admin protegido.
   - Roles y propiedad; encargado no altera trabajos ajenos y estudiante no crea usuarios ni acredita horas.
   - Código con ceros iniciales, duplicados, semestre inválido y precisión de horas.
   - Postulación duplicada, pendientes sin reserva y último cupo concurrente.
   - Aceptación tardía y edición de condiciones fijadas rechazadas.
   - Cierre temprano, incompleto o con no aceptados rechazado sin cambios parciales.
   - Cierre concurrente/repetido e idempotencia sin doble acreditación.
   - Ausencia cero, asistencia duración exacta, progreso/exceso y conservación del historial.
   - Persistencia tras recrear contenedor con mismo volumen.
2. Frontend: verificar flujos críticos contra API real, sesión expirada, validaciones, errores, accesibilidad y compilación/lint. No declarar completo un flujo con mocks.
3. CI backend con lockfile, instalación reproducible, contrato y pruebas pertinentes con PostgreSQL efímero; nunca base de otro proyecto. CI frontend con lint/build y pruebas disponibles antes de publicar.
4. Conservar workflows Firebase existentes: preview en PR y live desde main según configuración comprobada. No regenerar cuenta de servicio o secretos sin necesidad.
5. Supabase (destino principal): crear proyecto exclusivo MiBeca, servicio backend, `DATABASE_URL` del pooler en modo transacción (puerto 6543), `DB_SSL_MODE=require`, `DB_POOL_MAX` bajo, puerto de entorno y migraciones con `MIGRATION_TARGET=supabase` y `MIGRATION_CONFIRM_HOST` en paso controlado sin carreras entre instancias. Render queda como alternativa. Despliegue condicionado a CI.
6. Firebase y el backend en dominios distintos: comprobar sesiones en navegador. SameSite=None; Secure y CORS no garantizan aceptación de cookies de terceros; resolver dominio/ruta antes de declarar producción funcional. No desactivar globalmente verificación TLS.
7. Cambiar DATABASE_URL no copia registros ni crea tablas: ejecutar migraciones explícitas y decidir transferencia de datos por separado. Actualizar URL pública API del frontend y recompilar/publicar.
8. Documentar instalación, comandos, admin inicial, variables, pruebas, límites, respaldo y recuperación. No prometer rollback automático de migraciones destructivas.
9. Desarrollo autorizado no implica push/merge/despliegue. Cuando el equipo autorice integración a main bajo el flujo establecido, eso autoriza su despliegue automático sin otra confirmación de chat.

**Aceptación:** controles pasan, resultados reales documentados y, si se publica en esta etapa, flujo completo verificado en navegador.

## Orden de entrega y trabajo en equipo

1. Contexto, coordinación, hooks y Docker verificables.
2. Contrato y migración del dominio.
3. Auth y Usuarios conectados al frontend.
4. Trabajos, postulaciones y aceptación.
5. Cierre, asistencia, horas e historial.
6. Dashboards y consulta básica administrativa.
7. Integración, CI y publicación cuando corresponda.

Reparto inicial sugerido: Erick Auth/Usuarios backend; Sergio frontend contra contrato; Ivan Trabajos/Control backend. Un responsable único del esquema y migraciones evita colisiones. Los dos frentes backend se paralelizan tras acordar contrato/esquema. Rotar revisión e integración entre los tres.

Cada tarea indica entradas, archivos propios, criterios, comprobaciones y limitaciones. Registrar decisiones duraderas en docs/PR/issues y no suponer memoria entre sesiones. Cada clon ejecuta las nuevas migraciones; datos y secretos no se comparten por Git.

## Criterios finales de aceptación del MVP

- Admin entra y crea cuentas de los tres roles sin credenciales predeterminadas en Git.
- Estudiante y encargado completan cambio de contraseña y acceden con permisos reales.
- Encargado publica con fechas, contexto, duración y cupos válidos.
- Estudiante se postula; encargado acepta sin sobrecupo incluso con concurrencia.
- Encargado cierra una sola vez, registrando asistencia de todos los aceptados.
- Solo asistentes reciben horas y cada acreditación ocurre una vez.
- Estudiante consulta progreso, exceso e historial; encargado ve sus trabajos/asistencias.
- Administrador consulta progreso básico y gestiona cuentas conservando historial.
- PostgreSQL conserva datos tras reiniciar/recrear; contrato, API y UI coinciden.
- Lint/build y pruebas críticas pasan o sus limitaciones están explícitamente informadas; para declarar terminado no quedan verificaciones críticas sin ejecutar.
- Hooks y subagentes tienen evidencia de activación/uso cuando se declaran utilizados.
- Documentación refleja esta entrega; no quedan funcionalidades futuras exigidas por documentos obsoletos.

**Primera tarea para Codex:** contrastar el estado real con la fase 0, sincronizar documentación y ejecutar las verificaciones de entorno. Después avanzar por fases sin rehacer lo existente. No accedas a la base Render anterior ni publiques por el solo hecho de recibir este plan.
