# MiBeca — Plan unificado de implementación del MVP

Fecha: 19 de octubre de 2026. Versión: 1.1.

## 1. Propósito y autoridad del documento

MiBeca es el nombre del proyecto y de la aplicación universitaria de gestión de trabajo becario. Integrantes: Erick Magueño, Sergio Ramos e Ivan Zabala.

Este plan consolida el alcance acordado en la conversación con las propuestas compatibles del plan del equipo. Es un objetivo de implementación, no evidencia de funciones terminadas. No requiere incorporar el documento anterior del compañero.

Al adoptarlo, actualizar `mvp-y-permisos.md`, `api-v1.md`, `plan-colaboracion.md`, `automation.md` y las instrucciones de los agentes para evitar reglas contradictorias. Este documento prevalece para alcance y reglas funcionales; el contrato técnico debe materializar estas reglas. Los hechos de instalación, versiones y pruebas se verifican contra cada repositorio.

Las decisiones de simplificación explícitas de este plan son: aceptación previa del encargado, una actividad por trabajo, cierre único con asistencia, sin reputación, sin retiro de postulaciones en el MVP y sin correcciones de horas desde la aplicación. No deben añadirse funciones aplazadas por aparecer en documentos históricos.

## 2. Alcance y flujo completo

1. Crear el administrador inicial mediante un comando explícito y seguro.
2. El administrador inicia sesión, crea encargados y estudiantes y asigna la meta de horas individual.
3. El encargado publica un trabajo con fecha, duración y cupos.
4. Un estudiante se postula; el encargado acepta o rechaza. Solo las aceptaciones ocupan cupos.
5. Al terminar la actividad, el encargado cierra el trabajo indicando cuáles de los aceptados asistieron.
6. En una única transacción se registra asistencia, se acreditan las horas correspondientes y se cierra el trabajo.
7. El estudiante consulta su progreso e historial; el encargado consulta sus trabajos y asistentes. El administrador puede consultar progreso global básico.

El MVP se ejecutará primero de punta a punta en local. Firebase puede mostrar una interfaz preliminar mientras no exista backend público; eso no acredita un sistema funcional desplegado.

### Incluido

- Auth: login, logout, cambio de contraseña y revocación de sesiones.
- Usuarios: alta, consulta, edición acotada, activación y desactivación por administrador.
- Trabajos: publicación, edición previa al inicio, consulta, postulación, aceptación y rechazo.
- Control: cierre con asistencia, acreditación única y progreso.
- Consulta administrativa básica de estudiantes y horas, sin módulo avanzado de reportes.
- Historial persistente, permisos reales en backend, Docker, CI, hooks y uso verificable de subagentes.

### Fuera del MVP

Calificaciones, reputación, penalizaciones por retiro o inasistencia, evaluaciones, registro público, notificaciones, correo, recuperación automática de contraseñas, archivos, exportaciones, reportes avanzados, calendario avanzado, múltiples instituciones, múltiples roles por cuenta, reasignación de encargados, retiro/cancelación de postulaciones, cancelación de trabajos y edición posterior de acreditaciones. No crear tablas, endpoints ni indicadores simulados para estas funciones.

Funcionalidades del plan del compañero aplazadas: las calificaciones de 1 a 5, la reputación del estudiante, las reglas de retiro y autorización del encargado, las penalizaciones asociadas al retiro y los reportes administrativos adicionales quedan pendientes para futuras etapas de MiBeca. No se implementarán en el MVP actual; sus reglas y prioridad se concretarán antes de desarrollarlas.
Esta previsión no obliga a adoptar Prisma ni JWT: son alternativas técnicas del documento original, no funcionalidades pendientes.

## 3. Roles y datos

Roles internos: `ADMIN`, `ENCARGADO`, `BECARIO`. Etiquetas visibles: Administrador, Encargado y Estudiante becario. Docente y encargado usan el mismo rol y permisos; se distinguen por contexto: materia, facultad o área. No duplicar roles por esa diferencia.

| Entidad | Datos y reglas mínimas |
|---|---|
| Usuario | UUID, nombre, correo normalizado único, hash de contraseña, rol, activo, cambio de contraseña requerido, fechas. Nunca devolver hash. |
| Perfil de estudiante | Usuario, código académico único de exactamente cinco dígitos almacenado como texto para preservar ceros iniciales, carrera, semestre entero positivo y meta de horas. Sin catálogo académico complejo. |
| Perfil de encargado | Usuario, tipo de contexto (`MATERIA`, `FACULTAD`, `AREA`) y nombre del contexto. |
| Trabajo | UUID, encargado creador, título, descripción, contexto copiado al publicar, ubicación, inicio, fin previsto, duración acreditable, cupos enteros positivos, estado y fechas. |
| Postulación | UUID, estudiante, trabajo, estado y fechas; única por estudiante y trabajo. |
| Asistencia/acreditación | Postulación aceptada única, asistió sí/no, minutos otorgados, autor y fecha del cierre. Los ausentes reciben cero minutos y conservan su registro. |
| Sesión | Usuario, vencimiento y revocación; conservar solo la representación segura del secreto de sesión. |
| Auditoría | Actor, acción, recurso y fecha para altas, cambios sensibles, metas, desactivación y cierre; sin contraseñas ni tokens. Consulta global de auditoría aplazada. |

La meta corresponde a un único periodo de demostración del MVP; no se implementa gestión de periodos. El administrador la asigna individualmente. Cambiarla conserva y recalcula el progreso sobre el historial del MVP.

### Horas

- Entrada y visualización: horas positivas con un máximo de un decimal, por ejemplo 4, 4.5 o 4.6; rechazar 3.61. Documentar JSON con punto decimal y admitir la coma en el formulario convirtiéndola correctamente.
- Persistencia y sumas: minutos enteros múltiplos de seis. Ejemplo: 4.6 horas equivalen a 276 minutos. No confundir décimas con minutos: 4.6 no significa 4 horas y 60 minutos.
- Aplicar la misma precisión a duración y meta; validar en API y base cuando corresponda.
- La duración acreditable es explícita; inicio y fin previsto determinan cuándo se desarrolla la actividad. No inferir las horas desde el reloj ni inventar redondeos automáticos.
- Realizadas = suma de acreditaciones; faltantes = máximo(meta − realizadas, 0); excedentes = máximo(realizadas − meta, 0). Permitir exceder la meta.
- Cada asistente recibe exactamente la duración acreditable del trabajo; no existen horas parciales ni varias jornadas por trabajo. Una actividad adicional requiere otro trabajo.

## 4. Estados, cupos y cierre

### Trabajos

Estado persistido `PUBLICADO` o `CERRADO`. La fase temporal se deriva de inicio/fin: próximo, en curso o finalizado pendiente de cierre. Guardar instantes UTC y mostrar en la zona universitaria configurada; no depender de la zona del servidor.

- Publicar exige inicio futuro, fin posterior al inicio, duración positiva y cupos positivos.
- Solo el encargado propietario crea y administra el trabajo.
- Puede editarlo antes del inicio y antes de cualquier aceptación. Una vez que haya una aceptación, sus condiciones quedan fijas en el MVP.
- Consultar trabajos muestra estado, fechas, duración y cupos disponibles.

### Postulaciones

Estados: `PENDIENTE`, `ACEPTADA`, `RECHAZADA`. No hay retiro en esta entrega.

- Solo estudiantes activos pueden postular a trabajos publicados, no iniciados y con cupo disponible.
- Una postulación pendiente no reserva cupo; varias pueden competir por el último cupo. Mostrarlo claramente en la interfaz.
- La aceptación requiere cupo, cuenta activa y trabajo no iniciado; comprobarlo dentro de una transacción con bloqueo o actualización condicional que serialice aceptaciones sobre el mismo trabajo.
- Solo el propietario acepta o rechaza; no se revierten decisiones en el MVP.
- No borrar postulaciones ni asistencia al desactivar una cuenta.

### Cierre y asistencia

- Se permite cerrar desde el fin previsto, con el reloj del servidor, y únicamente al propietario activo.
- El formulario presenta todos los aceptados y exige marcar explícitamente asistencia o ausencia. El backend verifica que no falten ni sobren estudiantes y que no existan duplicados.
- Las postulaciones pendientes pasan a rechazadas con motivo de cierre del trabajo.
- Una sola transacción bloquea el trabajo, verifica su estado, registra asistencia de los aceptados, acredita a asistentes, audita y marca cerrado.
- Un aceptado que luego fue desactivado conserva su relación y puede tener su asistencia registrada: no se pierde su historial.
- Restricciones únicas por postulación impiden acreditar dos veces. No hace falta `completionId` porque existe un único cierre por trabajo.
- Usar `Idempotency-Key` para repetir de forma segura la misma solicitud: misma clave y contenido devuelve el resultado original; misma clave con contenido distinto devuelve conflicto. Un segundo cierre nuevo devuelve conflicto sin modificar nada.
- El historial del estudiante y el encargado incluye trabajo, fechas, responsable, duración, estado de postulación y asistencia cuando esté cerrada, incluso si no asistió.
- No modificar horas, duración ni asistentes después del cierre. Una corrección futura será una operación separada y auditada; no se resuelve editando registros silenciosamente.

## 5. Matriz de permisos

| Acción | Estudiante | Encargado | Administrador |
|---|---|---|---|
| Login/logout y contraseña propia | Sí | Sí | Sí |
| Ver trabajos publicados/cerrados | Sí | Sí | Sí |
| Postular y ver postulaciones propias | Sí | No | No |
| Crear, editar y cerrar trabajos | No | Solo propios y según estado | No |
| Aceptar/rechazar y ver postulantes | No | Solo de trabajos propios | No |
| Ver asistencia y horas | Propias | Sus trabajos | Consulta global básica |
| Crear y gestionar cuentas | No | No | Sí |
| Asignar/cambiar meta | No | No | Sí |
| Alterar horas cerradas | No | No | No en el MVP |

El encargado ve solo nombre, código, carrera y estado de sus postulantes; no puede consultar datos globales, credenciales ni sesiones. El administrador puede consultar trabajos e historial para supervisar, sin editar trabajos ajenos.

Alcance de edición de usuario: nombre y correo; carrera/semestre y meta del estudiante; contexto del encargado. El rol queda fijo tras el alta en el MVP para evitar conversiones ambiguas con historial. No permitir desactivar al último administrador activo. El administrador inicial puede crear otros administradores.

## 6. Autenticación

Mantener sesiones opacas de servidor; JWT no es obligatorio y no se adopta por aparecer en otra propuesta.

- Hash resistente a contraseñas con biblioteca mantenida; nunca texto plano ni cifrado reversible.
- Cookies HttpOnly; Secure en HTTPS; CSRF en escrituras; CORS con orígenes exactos y credenciales. Validar rol, actividad y propiedad en cada solicitud.
- Definir vencimiento y política de sesión en configuración y documentación.
- Desactivación revoca inmediatamente sesiones; reactivación no revive sesiones viejas.
- Administrador inicial por comando interactivo explícito sobre destino MiBeca revisado, sin contraseña por defecto ni ejecución automática durante migraciones.
- Alta ordinaria: contraseña temporal aleatoria mostrada una vez al administrador y entregada personalmente; cambio obligatorio antes de usar funciones de negocio.
- Reset administrativo explícito genera otra temporal y revoca sesiones; no implementa correo ni recuperación pública.
- Aplicar limitación de intentos al login y errores sin enumerar cuentas.
- Antes del despliegue en Firebase/Render validar la viabilidad de cookies entre sitios y restricciones del navegador. `SameSite=None; Secure` y CORS no garantizan por sí solos que el navegador acepte cookies de terceros. Resolver dominio/ruta de publicación y probar login antes de declarar producción funcional.

## 7. Arquitectura y repositorios

| Repositorio | Responsabilidades |
|---|---|
| `gestion-de-trabajo-becario-web` | React/Vite/JavaScript, pantallas, estilos, adaptador API, pruebas frontend y Firebase Hosting. |
| `gestion-de-trabajo-becario-backend` | Node.js, API, validación, reglas, PostgreSQL, Docker, migraciones, pruebas, contrato y futuro Render. |

Backend: adoptar Express con separación ligera de rutas/controladores, servicios de negocio y acceso a datos. Evitar capas vacías y abstracciones sin uso.

No es obligatorio introducir Prisma: conservar inicialmente el acceso PostgreSQL y las migraciones SQL explícitas reportadas en la infraestructura existente, tras verificarlas. Usar un único sistema de migraciones. No combinar historiales SQL propios con Prisma sin un plan independiente de adopción.

PostgreSQL en Docker Compose con versión explícita comprobada, volumen nombrado, healthcheck y puerto solo en 127.0.0.1. El backend corre en el host y usa localhost; el nombre del servicio se reserva para otros contenedores de esa red.

Cada integrante usa una base local y volumen propios. Git comparte configuración, migraciones y ejemplos, no registros ni secretos. Conservar `/health` y `/ready` sin exponer información sensible.

## 8. Contrato API único

Fuente canónica: `openapi.yaml` en backend. Actualizar `docs/api-v1.md` para que sea coherente. El frontend referencia un commit/tag del contrato; no mantiene una versión alternativa sin sincronización.

Convenciones: prefijo `/api/v1`, JSON, UUID, UTC, minutos enteros en API, objeto `data`, errores con `code/message`, paginación de listas con límite máximo 50. Validar códigos 400/401/403/404/409 y no devolver trazas. Una política documentada puede ocultar recursos ajenos con 404.

| Grupo | Rutas mínimas |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Usuarios, admin | `POST/GET /users`, `GET/PATCH /users/{id}`, `POST /users/{id}/deactivate`, `/reactivate`, `/reset-password` |
| Trabajos | `GET/POST /jobs`, `GET/PATCH /jobs/{id}`, `POST /jobs/{id}/close` |
| Postulaciones | `POST/GET /jobs/{id}/applications`, `POST /applications/{id}/accept`, `/reject` |
| Consultas propias | `GET /me/applications`, `/me/progress`, `/me/history`, `/me/jobs` según rol |
| Supervisión admin | `GET /students/progress`, `GET /students/{id}/history` |

Todas las rutas de la tabla reciben el prefijo común. OpenAPI debe concretar cada método, permisos, campos requeridos, respuestas y errores, no dejar abreviaciones ambiguas.

Cierre: lista exhaustiva de `{applicationId, attended}` y cabecera de idempotencia; el cliente no decide las horas otorgadas. La duración proviene del trabajo en backend.

Frontend puede usar mocks temporales explícitamente identificados. El cierre del MVP requiere API real y datos PostgreSQL.

## 9. Frontend e identidad visual

Conservar el logo original y el tema reportado: azul extraído `#06175D`, blanco visual `#FFFFFF`. No presentarlos como colores oficiales certificados. Verificar los recursos existentes.

- Centralizar colores, estados, tipografía, espaciado, radios y sombras en `src/styles/theme.css` con variables semánticas.
- Mantener archivos de componente para estructura sin duplicar códigos de color.
- Diseño adaptable, foco visible, etiquetas, contraste AA y estados de carga/error/vacío.
- Login y cambio obligatorio de contraseña; navegación por rol obtenida de `/auth/me`, no de un selector de demostración.
- Admin: cuentas y progreso básico. Encargado: trabajos, postulantes, cierre e historial. Estudiante: trabajos, postulaciones, progreso e historial.
- No mostrar reputación ni indicadores inventados. Formularios de horas convierten a minutos antes de enviar y reflejan errores de API.
- Ocultar botones no sustituye autorización del servidor.

## 10. Hooks y autorizaciones

Revisar los scripts reales y su compatibilidad con la versión instalada antes de declarar un control activo. No basta con que exista un JSON o una prueba directa del script.

| Control | Política |
|---|---|
| Hook de Codex | Proteger borrado de volúmenes MiBeca y operaciones de destino ambiguo. Permitir iniciar, detener y recrear conservando datos. No bloquear por palabras aisladas. |
| Hook Git | Revisar archivos preparados y posibles secretos sin imprimir valores; activar por clon con `git config core.hooksPath .githooks`. |
| CI | Lint, pruebas, contrato y migraciones pertinentes; no depender del hook local. |
| CD | Publicar solo tras verificaciones del workflow y hacia el destino configurado. |

Editar/borrar archivos acotados, ejecutar pruebas y migraciones locales revisadas son trabajo ordinario dentro de la tarea autorizada. Push, merge y despliegues se realizan si están incluidos en la instrucción vigente. Integrar a main bajo el flujo acordado autoriza su despliegue automático, sin una segunda aprobación de chat.

Una autorización de chat no altera la lógica de un hook. Si se desea permitir una operación destructiva legítima, diseñar previamente un mecanismo compatible de aprobación humana de una sola operación, ligado a destino y alcance, sin permitir autoaprobación del agente. Mientras no exista, informar la limitación y aplicar el procedimiento manual documentado. No modificar controles para esquivar una denegación.

La base Render de otro proyecto queda fuera de alcance incluso después del plazo mencionado. No leer sus credenciales ni ejecutar migraciones contra ella.

Ante rechazo: indicar acción, control, condición y procedimiento permitido. Los hooks locales no garantizan control sobre otros equipos, paneles o todas las herramientas. Probar casos permitidos y bloqueados sin ejecutar borrados reales.

## 11. Subagentes y colaboración

| Rol de agente | Alcance y entregable |
|---|---|
| Coordinador | Contrato, tareas y propiedad de archivos; integra resultados y verifica flujo completo. |
| Frontend | Solo web: pantallas, tema, adaptador y verificaciones frontend. |
| Backend-datos | Solo backend: API, esquema, migraciones y pruebas de negocio. |
| Revisor | Primero lectura; informa defectos reproducibles de permisos, cupos, cierre y persistencia. |

Usar subagentes donde exista trabajo independiente real; no mantenerlos activos por obligación. Cada tarea incluye entradas, archivos asignados, criterios y salida con pruebas/limitaciones. No editar los mismos archivos simultáneamente. Usar ramas o worktrees aislados cuando corresponda. Los perfiles son instrucciones, no límites efectivos de permisos.

Registrar evidencia de uso real de subagentes y de activación de hooks. No afirmar que se usaron solo porque sus archivos existen.

Erick, Sergio e Ivan trabajan con ramas por tarea y revisión cruzada. Reparto inicial sugerido: Erick Auth/Usuarios backend, Sergio interfaz con mocks del contrato e Ivan Trabajos/Control backend; ejecutar las tareas backend en paralelo solo después de fijar contrato y esquema compartidos, asignando un único propietario de las migraciones. El reparto puede rotar sin cambiar responsabilidades técnicas.

Mantener `AGENTS.md` y `AI_CONTEXT.md` por repositorio. Para este último definir seis secciones: propósito y alcance; stack/estructura comprobados; instalación/comandos; reglas y contrato; estado/verificaciones; límites y siguientes tareas. Diferenciar existente, planificado y no verificado. No incluir secretos. Ningún agente presume memoria compartida.

## 12. CI/CD y despliegue futuro

Frontend: conservar Firebase Hosting (`dist`, SPA) y workflows existentes. Revisar que compilen, ejecuten lint/pruebas pertinentes y publiquen solo después de pasar controles. PR genera preview y main live según configuración. Verificar ejecuciones reales. No regenerar secretos sin motivo.

Backend: CI con instalación reproducible y lockfile versionado, lint/tests y PostgreSQL efímero. Aplicar migraciones desde cero y probar reglas de negocio. Nunca usar la base persistente de otro proyecto para CI.

Render se configura posteriormente con una base MiBeca, variables privadas, puerto de entorno, CORS y TLS correctos. Configurar despliegue condicionado a CI. Migraciones mediante un paso controlado compatible con el servicio y plan disponibles, evitando ejecuciones concurrentes por cada instancia. No asumir que el cambio de URL crea tablas o copia datos.

Configurar la URL pública de API en el build frontend y recompilar. Ninguna variable pública frontend lleva DATABASE_URL ni secretos. Antes de publicar, comprobar sesiones en navegador, permisos y flujo completo. Código y datos requieren estrategias de recuperación distintas; no prometer rollback automático de migraciones destructivas.

## 13. Fases de ejecución y criterios

Numeración alineada con `PLAN_DE_TRABAJO_MIBECA.md`: la fase 4 es Control.

| Fase | Entregable y aceptación |
|---|---|
| 0. Contexto y entorno | Planes e instrucciones coherentes, Node/Docker operativos, DB saludable y persistencia tras recrear sin borrar volumen; frontend lint/build. Registrar fallos sin declarar éxito. |
| 1. Contrato/esquema | OpenAPI validado, estados y respuestas definidos, historial único de migraciones revisado. |
| 2. Auth/Usuarios | Admin inicial, creación de roles, contraseña temporal, login/logout, revocación y formularios conectados. |
| 3. Trabajos/Postulaciones | Publicar, editar bajo reglas, listar, postular y aceptar/rechazar con cupos seguros. |
| 4. Control/Progreso | Cierre transaccional, asistencia, horas únicas e historiales reales. |
| 5. Dashboards y supervisión | Paneles con datos reales y consulta administrativa de progreso e historial según permisos. |
| 6. Calidad y operación | Integración de los tres roles, permisos, errores, persistencia y CI; publicación y validación en navegador cuando estén autorizadas. |

### Pruebas obligatorias del flujo

- Login válido/inválido, cambio obligatorio y sesión revocada tras logout/desactivación/reset.
- Estudiante no puede crear cuentas, cambiar meta ni otorgar horas; encargado no administra trabajos ajenos.
- Código conserva ceros y rechaza longitudes inválidas; correo duplicado y horas con más de un decimal fallan.
- Postulación duplicada no crea registros extra; pendientes no reservan cupos.
- Aceptaciones concurrentes del último cupo: solo una tiene éxito.
- Rechazar postulación/aceptación tardía y edición de condiciones ya fijadas.
- Cierre con asistente no aceptado, lista incompleta o antes de fin: rechazo sin escrituras parciales.
- Cierre concurrente o repetido: una sola acreditación por aceptado; idempotencia coherente.
- Asistente recibe duración completa y ausente cero; ambos aparecen en historial.
- Meta menor que realizadas muestra faltantes cero y excedente correcto; sin errores de precisión.
- Desactivación conserva relaciones e historial; no se desactiva al último admin.
- Datos sobreviven recreación del contenedor con el mismo volumen.
- Frontend usa API real, maneja sesión expirada y funciona en móvil y teclado.

## 14. Archivos y fuente compartida

Colocar este archivo como `docs/PLAN_MVP_MIBECA.md` en ambos repositorios con la misma versión. Backend mantiene la fuente funcional principal; cada cambio requiere PR enlazado de sincronización en web. No editar copias independientemente.

Backend: actualizar documentos anteriores; contrato OpenAPI; migraciones; módulos auth/users/jobs/applications; cierre/asistencia/progreso; pruebas y CI. Frontend: páginas y componentes por rol, adaptador API, tema y pruebas. Rutas físicas se ajustan a la estructura real.

Antes de continuar, Codex debe leer ambos repositorios y el plan, indicar incompatibilidades reales y actualizar documentación obsoleta. Después implementar por fases, con pruebas y subagentes cuando aporten paralelismo. Conservar cambios del equipo y la infraestructura útil. No realizar push, merge, despliegues ni acciones externas por el solo hecho de recibir este archivo: requieren que la tarea vigente los incluya.

El MVP termina cuando el flujo completo funciona contra PostgreSQL, persiste y supera las pruebas críticas. Mocks, documentación, perfiles de agentes y archivos de workflow por sí solos no cumplen ese criterio.
