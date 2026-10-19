# Automatizaciones locales de MiBeca

**Estado comprobado el 18-10-2026:** `core.hooksPath` apunta a `.githooks` en este clon. Python 3.11.9 está disponible como `python` en el PowerShell del usuario; `python3` no resuelve ese intérprete en Windows, por lo que las invocaciones del hook se ajustaron a `python`. El hook Git permitió un commit inocuo y bloqueó un `.env` en un repositorio temporal; su archivo es idéntico al del frontend. El script Codex compiló y rechazó eventos simulados de borrado de volúmenes, mientras permitió comandos de parada e inicio sin borrado. La confianza/activación del hook Codex en el cliente sigue sin verificarse; su matcher `Bash` no cubre comandos lanzados desde PowerShell. Las pruebas de Node, Compose y PostgreSQL se documentan en [AI_CONTEXT.md](AI_CONTEXT.md).

## Activación

Desde la raíz de cada repositorio, revisa `.codex/hooks.json` y confía en el proyecto/hook desde el cliente Codex (`/hooks` donde esté disponible). Requiere Python 3 disponible como `python` en `PATH`. Los cambios del archivo de hooks requieren volver a revisar la confianza. Instala el hook de Git en cada clon con:

```bash
git config core.hooksPath .githooks
```

Esta configuración es local del clon y no viaja por Git. Los perfiles `.codex/agents/backend-data.toml` y `.codex/agents/reviewer.toml` se cargan desde un cliente Codex compatible al trabajar en este repositorio. El agente principal coordina y asigna archivos; el agente de revisión empieza en modo lectura.

## Comportamiento y límites

| Control | Evento | Resultado |
| --- | --- | --- |
| Codex `PreToolUse` sobre Bash | Antes de ejecutar un comando | Bloquea `down -v`/`rm -v` de Compose cuando el directorio, archivo Compose o nombre de proyecto identifica al backend MiBeca; permite Compose de otro proyecto identificado. Bloquea `docker volume rm` solo si el nombre termina en `_mibeca_pgdata` o es `mibeca_pgdata`. Bloquea `volume prune` y `system prune --volumes` sin filtro de proyecto ajeno porque su alcance es ambiguo. Permite `up`, `stop`, `start` y `down` sin `-v`. |
| Git `pre-commit` | Al confirmar cambios preparados | Rechaza nombres típicos de archivos secretos y marcadores de claves en blobs preparados. Solo muestra rutas, no valores. |
| Validaciones de proyecto | Antes de abrir PR | Ejecutar pruebas y lint pertinentes. No se ejecutan después de cada edición. |

El hook de Codex observa llamadas Bash cubiertas por el cliente, no todos los medios posibles de ejecutar comandos ni acciones en otros equipos, GitHub o paneles. El hook de Git se puede omitir en otros clones y no inspecciona secretos que no coincidan con sus patrones. GitHub y el proveedor deben aplicar sus propios controles. El agente no puede cambiar estos controles ni autoautorizarse para sortear un rechazo.

El alcance Compose se determina con el directorio de trabajo del evento, `-f`/`COMPOSE_FILE`, `--project-directory` o `-p`/`COMPOSE_PROJECT_NAME`. Comandos de shell que cambian dinámicamente de directorio, envuelven Docker en otro programa o renombran el volumen pueden eludir esta detección local; por eso el hook no sustituye una revisión humana ni permisos administrados.

Si una operación es rechazada, registra la orden, el control, la condición y la alternativa. Para un borrado de datos autorizado, una persona revisa el nombre del volumen, el respaldo y el destino y ejecuta la operación manualmente fuera de Codex; no se concede una excepción permanente. Los permisos del entorno o del proveedor se resuelven en su propia capa.

## Pruebas rápidas

```bash
python -m py_compile .codex/hooks/pre_tool_use.py .githooks/pre-commit
printf '%s\n' '{"tool_input":{"command":"docker compose down"}}' | python .codex/hooks/pre_tool_use.py
printf '%s\n' '{"tool_input":{"command":"docker compose down -v"}}' | python .codex/hooks/pre_tool_use.py
```

El primer evento no produce salida. El segundo devuelve JSON con `permissionDecision: deny`. Para probar el hook de Git sin modificar el índice del proyecto, crea un repositorio temporal con una copia de `.githooks/pre-commit` y prepara un archivo `.env`; debe rechazarlo mostrando solo su ruta.
