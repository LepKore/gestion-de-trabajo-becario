/**
 * Verificacion de paridad del plugin docker-guard frente a la tabla canonica.
 * Uso: node .opencode/plugin/docker-guard.verify.mjs
 */
import { backendRoot, blocked, pathOf } from "./docker-guard.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const backend = backendRoot(repoRoot);
const composeFiles = new Set(
  ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].map((n) => pathOf(path.join(backend, n), backend)),
);
const cwd = pathOf(repoRoot, repoRoot);

const CASES = [
  ["docker compose down", null],
  ["docker compose stop", null],
  ["docker compose up -d", null],
  ["docker compose restart", null],
  ["docker compose down -v", "deny"],
  ["docker compose down --volumes", "deny"],
  ["docker compose rm -v backend", "deny"],
  [`docker compose -f "${path.join(backend, "compose.yaml")}" down -v`, "deny"],
  [`docker compose -f "${path.join(backend, "compose.yaml")}" down`, null],
  ["docker-compose down -v", "deny"],
  ["COMPOSE_PROJECT_NAME=gestion-de-trabajo-becario-backend docker compose down -v", "deny"],
  ["COMPOSE_PROJECT_NAME=otro docker compose down -v", null],
  ["docker compose -p otro down -v", null],
  ["docker volume ls", null],
  ["docker volume rm mibeca_pgdata", "deny"],
  ["docker volume rm otra_mibeca_pgdata", "deny"],
  ["docker volume rm otro_volumen", null],
  ["docker volume prune", "deny"],
  ["docker volume prune -f", "deny"],
  ["docker volume prune --filter label=com.docker.compose.project=otro", null],
  ["docker system prune --volumes", "deny"],
  ["docker system prune --volumes --filter label=com.docker.compose.project=otro", null],
  ["docker system prune", null],
  ["npm run lint && npm run build", null],
  ["echo hola; docker volume prune", "deny"],
  ["echo hola && npm run build", null],
  ["git commit -m \"docker volume prune\"", null],
];

let failures = 0;
for (const [command, expected] of CASES) {
  const condition = blocked(command, cwd, backend, composeFiles);
  const actual = condition ? "deny" : null;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "OK  " : "FALLA"} | ${expected ?? "permitido"} | ${command}${condition ? ` -> ${condition}` : ""}`);
}

console.log(`\n${CASES.length - failures}/${CASES.length} casos correctos`);
process.exit(failures === 0 ? 0 : 1);