/**
 * Guardia local de volumenes Docker para OpenCode.
 *
 * Port del control de `.codex/hooks/pre_tool_use.py` (Codex) a un plugin de
 * OpenCode. `.codex` permanece intacto: ambas copias aplican las mismas reglas.
 *
 * Reglas (tabla canonica, en orden):
 *   Bloqueado: docker compose|docker-compose down|rm con -v|--volumes cuando el
 *              destino es el compose del backend MiBeca (por -f/--file,
 *              --project-directory, cwd o nombre de proyecto).
 *   Bloqueado: docker volume rm <volumen> si el volumen es mibeca_pgdata o
 *              termina en _mibeca_pgdata.
 *   Bloqueado: docker volume prune sin filtro positivo de proyecto ajeno.
 *   Bloqueado: docker system prune --volumes sin filtro positivo de proyecto ajeno.
 *   Permitido: stop, restart, down sin -v, prune filtrado a otro proyecto.
 */

import { existsSync } from "node:fs";

const PROJECT = "gestion-de-trabajo-becario-backend";
const COMPOSE_NAMES = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
];

function isAbsolute(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/");
}

export function pathOf(value, cwd) {
  return isAbsolute(value) ? normalizePath(value) : normalizePath(`${cwd}/${value}`);
}

// --- utilidades de ruta (sin dependencias) ---

function normalizePath(value) {
  const isWin = /^[A-Za-z]:/.test(value) || value.startsWith("\\\\");
  const sep = isWin ? "\\" : "/";
  const parts = [];
  for (const chunk of value.split(/[\\/]+/)) {
    if (!chunk || chunk === ".") continue;
    if (chunk === ".." && parts.length && parts[parts.length - 1] !== "..") {
      parts.pop();
      continue;
    }
    parts.push(chunk);
  }
  const joined = parts.join(sep);
  if (isWin) return `${joined[0]}:${sep}${joined.slice(2)}`;
  return `/${joined}`;
}

function baseName(value) {
  const idx = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
  return idx === -1 ? value : value.slice(idx + 1);
}



function parentOf(value) {
  const idx = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
  if (idx <= 0) return value;
  return value.slice(0, idx);
}

function isInside(child, parent) {
  if (child === parent) return true;
  const sep = parent.includes("\\") ? "\\" : "/";
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}



// --- tokenizado tipo shlex (comillas y separadores) ---

export function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;

  const push = () => {
    if (started) tokens.push(current);
    current = "";
    started = false;
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === "\\") {
      const next = command[i + 1];
      if (next !== undefined && next !== "\n") {
        current += next;
        started = true;
        i += 1;
        continue;
      }
    }
    if (";&|".includes(ch)) {
      push();
      tokens.push(ch);
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      push();
      continue;
    }
    current += ch;
    started = true;
  }
  push();
  return tokens;
}

function isSeparator(token) {
  return [";", "&&", "||", "|", "&"].includes(token);
}

// --- resolucion del backend ---

export function backendRoot(workspaceRoot) {
  const root = normalizePath(workspaceRoot);
  const candidates = [root, `${root}/${PROJECT}`, `${parentOf(root)}/${PROJECT}`];
  for (const candidate of candidates) {
    if (baseName(candidate) !== PROJECT) continue;
    if (COMPOSE_NAMES.some((name) => exists(`${candidate}/${name}`))) return candidate;
  }
  return candidates[1];
}

function exists(candidate) {
  try {
    return existsSync(candidate);
  } catch {
    return false;
  }
}

function composeFileSet(backend) {
  return new Set(COMPOSE_NAMES.map((name) => `${backend}/${name}`));
}

/**
 * Un compose se considera del backend MiBeca si apunta a su archivo de compose,
 * a su directorio de proyecto, si el cwd esta dentro del backend o dentro del
 * workspace que lo contiene (repo hermano), o si el nombre de proyecto coincide.
 *
 * Nota de paridad: la version de Codex solo aplica el caso del cwd cuando este
 * esta dentro del backend. Aqui se amplia al workspace completo para que el
 * agente no pueda borrar el volumen ejecutandose desde el repo web. Es una
 * ampliacion deliberadamente mas estricta; nunca mas permisiva.
 */
function composeTargetsBackend(args, cwd, assignments, composeFiles, backend) {
  const files = [];
  let projectDir = null;
  let projectName = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "-f" || arg === "--file") && i + 1 < args.length) files.push(args[i + 1]);
    else if (arg.startsWith("--file=")) files.push(arg.split("=")[1]);
    else if ((arg === "-p" || arg === "--project-name") && i + 1 < args.length) projectName = args[i + 1];
    else if (arg.startsWith("--project-name=")) projectName = arg.split("=")[1];
    else if (arg === "--project-directory" && i + 1 < args.length) projectDir = args[i + 1];
    else if (arg.startsWith("--project-directory=")) projectDir = arg.split("=")[1];
  }

  if (!files.length && assignments.COMPOSE_FILE) files.push(...assignments.COMPOSE_FILE.split(/[;:]/));
  if (files.length) return files.some((name) => composeFiles.has(pathOf(name, cwd)));
  if (projectDir) return pathOf(projectDir, cwd) === backend;

  const explicitName = projectName || assignments.COMPOSE_PROJECT_NAME;
  if (explicitName) return explicitName === PROJECT;

  return isInside(cwd, backend) || isInside(cwd, parentOf(backend));
}

function volumeIsMibeca(name) {
  return name === "mibeca_pgdata" || name.endsWith("_mibeca_pgdata");
}

/** Solo un filtro positivo de proyecto explicitamente ajeno acota prune. */
function filteredToOtherProject(args) {
  const filters = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter" && i + 1 < args.length) filters.push(args[i + 1]);
    else if (args[i].startsWith("--filter=")) filters.push(args[i].split("=")[1]);
  }
  const projects = filters
    .filter((f) => f.startsWith("label=com.docker.compose.project="))
    .map((f) => f.split("=")[2]);
  return projects.length > 0 && projects.every((p) => p !== PROJECT);
}

/** Devuelve el motivo del rechazo o null si el comando es permitido. */
export function blocked(command, cwd, backend, composeFiles) {
  const tokens = tokenize(command);

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token !== "docker" && token !== "docker-compose") continue;

    const args = [];
    for (const item of tokens.slice(index + 1)) {
      if (isSeparator(item)) break;
      args.push(item);
    }

    const assignments = {};
    for (const item of tokens.slice(0, index)) {
      const eq = item.indexOf("=");
      if (eq === -1) continue;
      const key = item.slice(0, eq);
      if (key === "COMPOSE_FILE" || key === "COMPOSE_PROJECT_NAME") {
        assignments[key] = item.slice(eq + 1);
      }
    }

    const isCompose = token === "docker-compose" || args.includes("compose");
    if (isCompose) {
      const options = token === "docker-compose" ? args : args.slice(args.indexOf("compose") + 1);
      const removes = (options.includes("down") || options.includes("rm")) &&
        options.some((item) => item === "-v" || item === "--volumes");
      if (removes && composeTargetsBackend(options, cwd, assignments, composeFiles, backend)) {
        return "Compose del backend MiBeca con eliminacion de volumenes";
      }
      continue;
    }

    if (args.includes("volume")) {
      const options = args.slice(args.indexOf("volume") + 1);
      if (options.includes("rm")) {
        const rmAt = options.indexOf("rm");
        if (options.slice(rmAt + 1).some(volumeIsMibeca)) return "volumen PostgreSQL de MiBeca";
      }
      if (options.includes("prune") && !filteredToOtherProject(options)) {
        return "prune de volumenes con alcance ambiguo";
      }
      continue;
    }

    if (args.includes("system")) {
      const options = args.slice(args.indexOf("system") + 1);
      if (options.includes("prune") && options.includes("--volumes") && !filteredToOtherProject(options)) {
        return "prune del sistema con alcance ambiguo sobre volumenes";
      }
    }
  }
  return null;
}

export function reasonText(condition) {
  return (
    `Hook local MiBeca: operacion rechazada por ${condition}. ` +
    "Detener o recrear sin -v esta permitido. Si una persona autoriza borrar " +
    "datos, debe revisar destino y respaldo y ejecutar la orden manualmente " +
    "fuera del agente; el agente no puede cambiar este control para pasar."
  );
}

export const DockerGuard = async ({ directory, worktree }) => {
  const root = (worktree && worktree.directory) || directory || globalThis.process.cwd();
  const backend = backendRoot(root);
  const composeFiles = composeFileSet(backend);

  return {
    "tool.execute.before": async (input) => {
      if (!input || input.tool !== "bash") return;
      const args = input.args || {};
      const command = args.command;
      if (typeof command !== "string" || !command) return;

      const cwd = pathOf(args.workdir || root, normalizePath(root));
      const condition = blocked(command, cwd, backend, composeFiles);
      if (condition === null) return;

      throw new Error(reasonText(condition));
    },
  };
};

export default DockerGuard;