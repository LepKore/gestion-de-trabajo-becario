# MiBeca: instrucciones para agentes del backend

- El coordinador asigna archivos y evita ediciones simultáneas sobre ellos. Un subagente recibe una tarea acotada y entrega resultados verificables; las decisiones persistentes se registran en documentación versionada.
- Lee `docs/PLAN_MVP_MIBECA.md` y `docs/AI_CONTEXT.md` al comenzar. El contrato futuro será `openapi.yaml`; hasta que exista, `docs/api-v1.md` es borrador y se subordina al plan. Si trabajas con frontend, indica la revisión del contrato usada.
- Este repositorio contiene la API y PostgreSQL local. El frontend y su configuración Firebase pertenecen al otro repositorio.
- Carga la conexión Node.js desde `DATABASE_URL`; Docker Compose tiene su propia lectura de variables. La API local conecta por `localhost` y el puerto publicado.
- No uses la base Render de otro proyecto ni sus credenciales. Un cambio en el chat no altera permisos ejecutables. Nunca te autoautorices ni edites controles para evitar un rechazo.
- Antes de aplicar migraciones, revisa el destino de `DATABASE_URL` y el SQL. Los datos de prueba se cargan solo con comando explícito de desarrollo.
- `docker compose down` conserva el volumen. `docker compose down -v`, `docker volume rm` y equivalentes pueden borrar datos y el hook local los rechaza. Si se necesita borrar, el responsable revisa y ejecuta manualmente fuera de Codex.
- El hook de Git se instala localmente con `git config core.hooksPath .githooks`. Antes de un PR, ejecuta las pruebas y validaciones pertinentes. Los hooks locales no sustituyen revisiones ni controles en GitHub.
