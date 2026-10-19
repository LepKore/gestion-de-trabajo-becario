# Plan de implementación y colaboración de MiBeca

**Vigencia:** [PLAN_MVP_MIBECA.md](PLAN_MVP_MIBECA.md) y [PLAN_DE_TRABAJO_MIBECA.md](PLAN_DE_TRABAJO_MIBECA.md) gobiernan alcance y fases. Este archivo conserva el procedimiento de colaboración y la inspección histórica; sus números de fase y propuestas antiguas no sustituyen los planes vigentes. El borrador [api-v1.md](api-v1.md) ya refleja cierre único con asistencia.

**Comprobado en la inspección inicial:** el frontend es React 19 + Vite 8 + JavaScript con ESLint, Firebase Hosting configurado para `mibeca` y publicación de `dist`. Sus workflows existentes hacen `npm ci && npm run build`: preview en PR del mismo repositorio y canal live al hacer push a `main`. Esto no acredita ejecuciones remotas exitosas. El backend inicialmente no tenía framework, ORM, migraciones ni esquema de producto; después se añadieron Compose, conexión PostgreSQL y ejecutor de migraciones SQL, pero aún no hay migraciones del dominio ni rutas de negocio. No hay despliegue Render de MiBeca configurado. Ninguna base de otro proyecto en Render forma parte de MiBeca.

**Propuesto:** MVP, roles y API en [mvp-y-permisos.md](mvp-y-permisos.md) y [api-v1.md](api-v1.md). **Pendiente de comprobar:** ejecuciones de GitHub Actions, permisos/protección de ramas en GitHub, versión de Codex en cada equipo y acceso real de los integrantes a servicios. La existencia de un workflow o secreto configurado no prueba un despliegue exitoso. No se han consultado servicios externos para este plan.

## Fases y criterios

| Fase | Dependencia | Resultado verificable |
|---|---|---|
| 0. Guardas locales y reparto | Ninguna | `.codex/hooks.json`, agentes en `.codex/agents/`, `AGENTS.md` y `.githooks/pre-commit` revisados; cada integrante instala `core.hooksPath` localmente. |
| 1. Base local | Docker Desktop/Engine disponible | PostgreSQL local saludable, volumen persistente, `DATABASE_URL` del proceso Node independiente del `.env` de Compose, migración explícita y prueba de reconexión tras recrear sin `-v`. Si Docker falta, queda procedimiento reproducible sin declarar prueba pasada. |
| 2. Contrato y esquema | Acuerdo de roles y campos pendientes | OpenAPI v1 y migraciones de dominio revisadas, sin tablas inventadas antes de acordar reglas. |
| 3. API mínima | Fase 2 | Login/logout, usuarios, trabajos, postulación, aceptación, cierre único con asistencia y progreso con pruebas de permisos, cupos, idempotencia y desactivación. |
| 4. Interfaz MVP | Contrato estable; mocks permitidos mientras tanto | Identidad visual compartida y flujo por rol conectado a la API; estados accesibles y móvil. Las vistas mock se indican como demostración. |
| 5. Integración y CI | Fases 3 y 4 | PR cruzados y tests; backend CI con PostgreSQL efímero; frontend lint y build antes del merge y despliegue. |
| 6. Render futuro | Nueva base MiBeca y autorización de publicación | API pública con TLS/CORS, migraciones controladas en la nueva base, frontend recompilado con URL pública y prueba completa. |

## Hooks y autorizaciones

| Capa/control | Evento y alcance | Comportamiento y prueba |
|---|---|---|
| Codex `PreToolUse` | Comando Bash del agente; protege destrucción local evidente de volúmenes Docker | Bloquea operaciones de borrado de volumen con mensaje de causa; permite `docker compose down` y `up --force-recreate` sin `-v`. Revisar el script con ejemplos positivos/negativos. Es guardia local, no impide acciones de otro equipo ni panel. |
| Git `pre-commit` | Commit local, solo blobs staged | Rechaza archivos de secretos y marcadores conocidos, informando rutas pero nunca valores. Instalar con `git config core.hooksPath .githooks` en cada clon y probar con un archivo temporal preparado, sin cometerlo. |
| Lint/tests locales | Antes de PR o por cambio relevante | `npm run lint` y `npm run build` en web; scripts equivalentes de backend cuando estén definidos. No correr suite completa después de cada edición. |
| CI GitHub | PR y rama protegida, pendiente de configurar | Repite controles compartidos, valida contrato y migraciones, y usa PostgreSQL efímero para tests que lo requieran. El hook local no sustituye CI. |
| CD Firebase | Workflows actuales: preview PR, live `main` | Mantenerlos; incorporar verificación necesaria antes de publicar en una tarea posterior. Preview no equivale a live. No regenerar cuenta de servicio ni secreto sin necesidad demostrada. |
| CD Render | Aún no existe | Configurar solo en fase 6. Auto deploy activado no garantiza que las pruebas hayan finalizado antes; exigir gate de CI o promoción controlada. |

Editar código, crear/eliminar archivos acotados del repo y ejecutar pruebas son operaciones ordinarias. Iniciar, detener o recrear Compose **sin** eliminar volumen también. Aplicar migraciones locales exige verificar SQL y destino MiBeca local antes de ejecutarlas; una migración de producción necesita revisión y procedimiento explícito. Borrar volúmenes/reiniciar datos, usar bases externas, integrar `main` y publicar requieren aprobación humana específica al alcance/destino. Un push a rama de trabajo sigue las reglas de GitHub y la instrucción vigente del equipo; no debe bloquearse por aparecer la palabra `push`.

La autorización del chat no cambia por sí sola un hook. Para una excepción legítima, el responsable revisa la operación concreta, destino y efectos, y la ejecuta manualmente por un procedimiento de una sola operación fuera de la guardia del agente; el agente no desactiva ni modifica controles para saltarse un rechazo. Al bloquear, informar operación, capa (hook Codex, Git, permisos del entorno, GitHub o proveedor), condición y vía permitida. Ningún hook local protege el panel de Firebase/Render ni otra máquina.

## Subagentes y tres integrantes

El coordinador asigna tareas, congela decisiones de contrato, evita archivos compartidos en paralelo e integra PR. El subagente `frontend` trabaja solo en web (componentes, estilos, adaptador API); `backend-data` solo en backend (API, Docker, migraciones); `reviewer` inspecciona primero en lectura y comunica defectos reproducibles. Sus archivos TOML son instrucciones de alcance, no permisos de sandbox. Entradas: issue, contrato y criterios; salida: archivos cambiados, validaciones y dependencias. Terminan cuando el trabajo asignado se verificó o queda una limitación explícita. No hay obligación de mantener los tres activos.

Erick Magueño, Sergio Ramos e Ivan Zabala trabajan cada uno en su clon y en una rama por tarea (`feat/...`, `fix/...`). Los roles humanos pueden rotar: un integrante implementa, otro revisa PR, el tercero valida integración. No equivalen automáticamente a tres subagentes. Para tareas paralelas se usan ramas o worktrees aislados y propiedad temporal de archivos; los cambios de contrato se revisan en ambos repos. Decisiones duraderas se escriben en `docs/`, PR/issues enlazados y `AGENTS.md`, nunca se presupone memoria compartida entre sesiones.

Cada integrante mantiene su PostgreSQL local y su propio volumen; Git comparte Compose, configuración de ejemplo, migraciones y seeds explícitos de desarrollo, no datos ni secretos. Al integrar, los tres ejecutan nuevas migraciones sobre sus bases locales. Un seed no debe borrar datos ni correr automáticamente en producción.

## CI/CD y despliegue (Supabase)

Frontend: los workflows existentes compilan y publican, pero no ejecutan lint. Una mejora posterior añade un job de validación antes del job de publicación y protege `main` con PR/revisión y checks requeridos si el plan y permisos de GitHub lo permiten. El sitio Firebase actual puede ser plantilla o mock y no puede llamar a `localhost` de cada desarrollador desde el navegador de otros usuarios.

Backend: crear CI de PR con instalación reproducible, lint/tests y un servicio PostgreSQL efímero sin credenciales de producción cuando existan pruebas de datos. No configurar despliegue mientras no exista servicio MiBeca. Los cambios de migración se revisan como SQL y se prueban contra base efímera antes de aplicar a una base persistente. La CI no recibe credenciales de Supabase.

Despliegue en Supabase, **sin ejecutarlo ahora**: la conexión de producción usa el pooler **Supavisor en modo transacción (puerto 6543)**, no la conexión directa, con `DB_SSL_MODE=require` y `DB_POOL_MAX` bajo para no agotar el plan. Aplicar migraciones con `MIGRATION_TARGET=supabase` y `MIGRATION_CONFIRM_HOST` igual al host de `DATABASE_URL`; el ejecutor rechaza hosts que no terminen en `supabase.com` y rechaza TLS desactivado. Render queda como destino alternativo con `MIGRATION_TARGET=render`. No se usa el CLI de Supabase: el historial vive en `schema_migrations`. Cambiar `DATABASE_URL` no copia datos ni crea tablas por sí mismo. Después, publicar la URL pública de API como variable de build del frontend, recompilar y publicar, probar flujo completo y preparar respaldo/rollback de código y migraciones. La base Render de otro proyecto sigue fuera de alcance incluso después del plazo mencionado.

## Archivos de las siguientes fases

| Repositorio | Archivos concretos propuestos (sujetos al contrato aprobado) |
|---|---|
| Backend | `docs/api-v1.md` → `openapi.yaml`; `migrations/*` para tablas de dominio; `src/auth/*`, `src/users/*`, `src/jobs/*`, `src/applications/*` y cierre/asistencia; pruebas de permisos y flujo; `.github/workflows/ci.yml`. Se aprovechan `compose.yaml`, `.env.example`, `src/db.js` y `scripts/migrate.js`. |
| Frontend | `src/styles/theme.css` para tokens; `src/components/*` para controles reutilizables; `src/pages/*` para login, trabajos, postulaciones y progreso; `src/api/*` para adaptador mock/real; `src/App.jsx` para navegación por rol y `README.md` para configuración. `firebase.json`, `.firebaserc` y los dos workflows actuales quedan sujetos a una tarea separada de CI/CD. |

## Ejemplos de decisión

| Operación concreta | Capa y resultado esperado |
|---|---|
| Editar `src/App.jsx`, borrar un componente obsoleto dentro del repositorio, ejecutar `npm run lint` | Permitido como trabajo ordinario; revisar diff y pruebas pertinentes. |
| `docker compose stop` y `docker compose up --force-recreate -d` con el mismo volumen MiBeca | Permitido; comprobar salud y persistencia si Docker está disponible. |
| `docker compose down -v` o `docker volume rm` | Hook local Codex rechaza destrucción de volúmenes; responsable identifica volumen, respaldo y destino antes de ejecutar manualmente una única operación autorizada. |
| Migración SQL con `DATABASE_URL` apuntando a una base externa o a la base Render ajena | Fuera de alcance; no ejecutar. Para Supabase o la futura base MiBeca, revisión de destino, `MIGRATION_CONFIRM_HOST` y migración en un proceso separado. |
| `git push` a rama de tarea propia | Permitido por flujo de equipo si el usuario autorizó el push y GitHub lo acepta; `main` requiere PR, revisión y checks. |
| Publicación live de Firebase o Render | Requiere autorización concreta y gates del proveedor/CI; no se deduce de que el código compile. |

## Decisiones funcionales posteriores a la inspección inicial

El plan vigente ya resolvió las preguntas de alcance anteriores: código académico de cinco dígitos como texto, meta individual de demostración, contraseña temporal aleatoria entregada una sola vez por el administrador y reset administrativo, una actividad y un cierre por trabajo, vista limitada de postulantes, sin correcciones de horas en la aplicación y exceso de meta informado por separado. El siguiente paso funcional es formalizar estas reglas en OpenAPI y crear la primera migración del dominio con pruebas de permisos.
