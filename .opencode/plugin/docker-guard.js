/**
 * Guardia local de volumenes Docker para OpenCode.
 *
 * Contrato V2 (OpenCode >= 2): `Plugin.define({ id, setup })`. La logica vive en
 * `.opencode/lib/docker-guard-rules.js` para que se pueda verificar con `node`
 * sin cargar el paquete `@opencode/plugin`.
 *
 * Port del control de `.codex/hooks/pre_tool_use.py` (Codex). `.codex` permanece
 * intacto: ambas copias aplican las mismas reglas.
 *
 * Verificacion: node .opencode/plugin/docker-guard.verify.mjs
 */

import { Plugin } from "@opencode/plugin";
import {
  backendRoot,
  blocked,
  blockedMigration,
  composeFileSet,
  normalizePath,
  pathOf,
  reasonText,
} from "../lib/docker-guard-rules.js";

export {
  backendRoot,
  blocked,
  blockedMigration,
  composeFileSet,
  normalizePath,
  pathOf,
  reasonText,
  tokenize,
} from "../lib/docker-guard-rules.js";

export default Plugin.define({
  id: "mibeca.docker-guard",
  async setup(ctx) {
    const root = ctx.location.directory || globalThis.process.cwd();
    const backend = backendRoot(root);
    const composeFiles = composeFileSet(backend);

    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool !== "bash") return;
      const args = event.input || {};
      const command = args.command;
      if (typeof command !== "string" || !command) return;

      const cwd = pathOf(args.workdir || root, normalizePath(root));
      const condition = blocked(command, cwd, backend, composeFiles);
      const migrationCondition = blockedMigration(command);
      if (condition === null && migrationCondition === null) return;

      throw new Error(reasonText(condition || migrationCondition));
    });
  },
});
