# Automatizaciones locales de MiBeca

**Estado comprobado el 18-10-2026:** `core.hooksPath` apunta a `.githooks` en este clon. Python 3.11.9 está disponible como `python` en el PowerShell del usuario; `python3` no resuelve ese intérprete en Windows, por lo que las invocaciones del hook se ajustaron a `python`. El hook Git permitió un commit inocuo y bloqueó un `.env` en un repositorio temporal; su archivo es idéntico al del frontend. El script Codex compiló y rechazó eventos simulados de borrado de volúmenes, mientras permitió comandos de parada e inicio sin borrado. La confianza/activación del hook Codex en el cliente sigue sin verificarse; su matcher `Bash` no cubre comandos lanzados desde PowerShell. Las pruebas de Node, Compose y PostgreSQL se documentan en [AI_CONTEXT.md](AI_CONTEXT.md).

**Auditor de código comprobado el 21-10-2026:** el motor puro `.opencode/lib/code-audit-rules.js` (26 reglas, 5 duras) pasa su verificación (40/40) y las pruebas `test/code-audit.test.js` (12/12) y `test/codex-audit.test.js` (11/11). El plugin `.opencode/plugin/code-audit.js` se carga en OpenCode v2.1.2 (contrato V2 `Plugin.define` + `ctx.tool.hook`) y expone la herramienta `audit_code`; el plugin `.opencode/plugin/docker-guard.js` se migró al mismo contrato V2 y su verificación sigue en 34/34. La calibración sobre el árbol actual (36 archivos de `src`, `scripts`, `test` y `migrations`) da 0 bloqueos, 0 avisos y 4 hallazgos informativos, sin rutas fuera de `openapi.yaml`. La confianza del hook Codex en el cliente sigue sin verificarse.

## Activación

Desde la raíz de cada repositorio, revisa `.codex/hooks.json` y confía en el proyecto/hook desde el cliente Codex (`/hooks` donde esté disponible). Requiere Python 3 disponible como `python` en `PATH` y Node 22 disponible como `node` para el puente de auditoría. Los cambios del archivo de hooks requieren volver a revisar la confianza. Instala el hook de Git en cada clon con:

```bash
git config core.hooksPath .githooks
```

El plugin de OpenCode se carga solo desde `.opencode/plugin` al abrir el proyecto; puede comprobarse con `opencode plugin list`. No requiere instalación ni dependencias: usa el paquete `@opencode/plugin` que provee el propio cliente.

Esta configuración es local del clon y no viaja por Git. Los perfiles `.codex/agents/backend-data.toml` y `.codex/agents/reviewer.toml` se cargan desde un cliente Codex compatible al trabajar en este repositorio. El agente principal coordina y asigna archivos; el agente de revisión empieza en modo lectura. Las skills de proyecto usan `.agents/skills` como fuente común para Codex y OpenCode, en lugar de duplicar archivos en `.codex` y `.opencode`.

## Comportamiento y límites

| Control | Evento | Resultado |
| --- | --- | --- |
| Codex `PreToolUse` sobre Bash | Antes de ejecutar un comando | Bloquea `down -v`/`rm -v` de Compose cuando el directorio, archivo Compose o nombre de proyecto identifica al backend MiBeca; permite Compose de otro proyecto identificado. Bloquea `docker volume rm` solo si el nombre termina en `_mibeca_pgdata` o es `mibeca_pgdata`. Bloquea `volume prune` y `system prune --volumes` sin filtro de proyecto ajeno porque su alcance es ambiguo. Permite `up`, `stop`, `start` y `down` sin `-v`. |
| Codex `PreToolUse`/`PostToolUse` sobre apply_patch | Antes y después de aplicar un parche | El puente `.codex/hooks/audit_bridge.mjs` audita el parche con el mismo motor que OpenCode: `PreToolUse` deniega solo las 5 reglas duras mostrando archivo, línea y regla; `PostToolUse` relee los archivos escritos y devuelve los avisos como `additionalContext`, sin bloquear. |
| OpenCode plugin `mibeca.code-audit` | Antes y después de `write`/`edit` y al construir el contexto | Rechaza la escritura con `throw` solo si hay una regla dura; acumula los avisos en el almacén de la sesión y los inyecta resumidos (máx. 20, sin repetir). Añade la herramienta `audit_code` y el comando `/auditar`. |
| Git `pre-commit` | Al confirmar cambios preparados | Rechaza nombres típicos de archivos secretos y marcadores de claves en blobs preparados. Solo muestra rutas, no valores. |
| Validaciones de proyecto | Antes de abrir PR | Ejecutar pruebas y lint pertinentes. No se ejecutan después de cada edición. |

El hook de Codex observa llamadas Bash cubiertas por el cliente, no todos los medios posibles de ejecutar comandos ni acciones en otros equipos, GitHub o paneles. El hook de Git se puede omitir en otros clones y no inspecciona secretos que no coincidan con sus patrones. GitHub y el proveedor deben aplicar sus propios controles. El agente no puede cambiar estos controles ni autoautorizarse para sortear un rechazo.

El auditor de código es una comprobación determinista sobre el texto: no ejecuta el código, no sigue imports y no entiende el flujo real, así que un aviso puede ser un falso positivo y código ofuscado o dinámico puede eludirlo. No cubre archivos fuera de las extensiones y carpetas declaradas, ni el contenido que llega por datos en tiempo de ejecución. Los controles reales de CI, permisos del proveedor y revisión humana siguen siendo la garantía; el hook solo adelanta la señal y bloquea las invariantes más caras de reparar después.

El alcance Compose se determina con el directorio de trabajo del evento, `-f`/`COMPOSE_FILE`, `--project-directory` o `-p`/`COMPOSE_PROJECT_NAME`. Comandos de shell que cambian dinámicamente de directorio, envuelven Docker en otro programa o renombran el volumen pueden eludir esta detección local; por eso el hook no sustituye una revisión humana ni permisos administrados.

Si una operación es rechazada, registra la orden, el control, la condición y la alternativa. Para un borrado de datos autorizado, una persona revisa el nombre del volumen, el respaldo y el destino y ejecuta la operación manualmente fuera de Codex; no se concede una excepción permanente. Los permisos del entorno o del proveedor se resuelven en su propia capa.

El auditor de código inspecciona `.js`, `.mjs` y `.sql` bajo `src`, `scripts`, `test` y `migrations`; ignora `node_modules`, `dist`, `coverage`, `.git`, `.opencode` y `package-lock.json`. Es determinista y local: no usa red ni modelo, y una regla se prueba con `texto` sin depender del cliente. Solo las reglas `deny` bloquean; los `warn` e `info` informan. El contraste con `openapi.yaml` compara las rutas declaradas por los `router.<metodo>()` con los `paths` del contrato y solo se activa cuando la auditoría cubre los archivos de rutas.

## Reglas del auditor de código

Severidad: `deny` bloquea la escritura; `warn` e `info` solo informan. Área entre paréntesis.

| Regla | Severidad | Qué detecta |
| --- | --- | --- |
| SEC-01 | deny | Secreto incrustado (clave privada PEM, token `ghp_`/`github_pat_`/`AKIA`/`AIza`). |
| SEC-02 | deny | Ruta de credenciales: `.env` (no `.env.example`), `firebase-adminsdk`, `*service-account*`/`credenciales`/`credentials` `.json`, `.pem`, `.p12`, `.pfx`, `.key`. |
| SEC-03 | deny | Cadena `postgres://usuario:contrasena@` con contraseña literal en `src/`. |
| DB-01 | deny | SQL que interpola `${req.}`/`${request.}`/`${body.}`/`${params.}`/`${headers.}`. |
| AUTH-01 | deny | Ruta `router.post/patch/put/delete` sin `requireCsrf`/`write` ni `/login` en `src/routes/`. |
| SEC-04 | warn | Log de datos de sesión o credenciales en `src/`. |
| SEC-05 | warn | Cookie con `httpOnly` o `secure` en `false`. |
| SEC-06 | warn | CORS con origen comodín (`'*'` o `true`). |
| SEC-07 | warn | Hash débil (`createHash` sobre `md5`/`sha1`). |
| API-01 | warn | `throw new Error` en `src/routes`/`src/services` en vez de los helpers de `src/lib/errors.js`. |
| API-02 | warn | Archivo con `request.body` sin pasar por `parse(`. |
| API-03 | warn | `response.send` en vez de `response.json`. |
| API-05 | warn | `error.stack` o `String(error)` en la respuesta. |
| DB-02 | warn | `query('BEGIN'` sin `ROLLBACK` en el mismo archivo. |
| DB-03 | warn | `UPDATE ... SET` o `DELETE FROM` sin `WHERE` en una ventana de 400 caracteres. |
| DB-04 | warn | `process.env.DATABASE_URL` fuera del borde de entorno (scripts y `test/helpers.js`). |
| DB-05 | info | `SELECT *`. |
| AUTH-02 | warn | `router.<metodo>` sin middleware de sesión o rol reconocible. |
| AUTH-03 | warn | Comparación de `token`/`csrf`/`password`/`hash` con `===` en vez de `safeEqual`. |
| AUTH-04 | warn | Mensaje de login que revela si la cuenta existe (`src/routes/auth.js`). |
| MIG-01 | warn | `DROP TABLE`/`COLUMN` o `TRUNCATE` en `migrations/` sin justificación en la línea o la anterior. |
| MIG-02 | warn | Migración con nombre distinto de `NNNN_descripcion.sql`. |
| HYG-01 | warn | `console.log`/`debug`/`debugger` en `src/` (excepto el arranque de `src/server.js`). |
| HYG-02 | info | `TODO`/`FIXME`. |
| HYG-03 | warn | `test.only`/`describe.only`/`it.only`. |
| SUP-01 | warn | `eslint-disable`/`@ts-ignore` sin justificación. |

## Pruebas rápidas

```bash
python -m py_compile .codex/hooks/pre_tool_use.py .githooks/pre-commit
printf '%s\n' '{"tool_input":{"command":"docker compose down"}}' | python .codex/hooks/pre_tool_use.py
printf '%s\n' '{"tool_input":{"command":"docker compose down -v"}}' | python .codex/hooks/pre_tool_use.py

node .opencode/plugin/docker-guard.verify.mjs
node .opencode/plugin/code-audit.verify.mjs
node --test test/code-audit.test.js test/codex-audit.test.js
node .codex/hooks/audit_bridge.mjs --changed
node .codex/hooks/audit_bridge.mjs --all --info
```

El primer evento no produce salida. El segundo devuelve JSON con `permissionDecision: deny`. Para probar el hook de Git sin modificar el índice del proyecto, crea un repositorio temporal con una copia de `.githooks/pre-commit` y prepara un archivo `.env`; debe rechazarlo mostrando solo su ruta. Los dos `.verify.mjs` imprimen `OK` por caso y terminan en `0` si todo pasa (`34/34` y `40/40`). Las pruebas de `node:test` cubren el catálogo y el puente Codex; `audit_bridge.mjs --all --info` resume el árbol completo y `--changed` solo el árbol de trabajo. En Windows, sustituye `printf` por `Write-Output` o usa WSL.
