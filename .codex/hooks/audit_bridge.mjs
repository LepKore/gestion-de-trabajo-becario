#!/usr/bin/env node
/**
 * Puente de auditoria para Codex sobre el mismo motor que OpenCode.
 *
 * No duplica el catalogo de reglas: importa `.opencode/lib/code-audit-rules.js`,
 * que es puro (sin fs, sin red, sin dependencias del cliente). Un cambio de
 * regla vale para los dos clientes a la vez.
 *
 * Uso como hook (Codex escribe un JSON por stdin):
 *   PreToolUse  apply_patch -> deniega las 5 reglas duras
 *   PostToolUse apply_patch -> devuelve avisos como additionalContext
 *
 * Uso manual:
 *   node .codex/hooks/audit_bridge.mjs --all [--info]
 *   node .codex/hooks/audit_bridge.mjs --changed [--info]
 *   node .codex/hooks/audit_bridge.mjs --paths src/routes/jobs.js ...
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  auditEntries,
  auditPath,
  auditText,
  esDenegado,
  mensajeRechazo,
  ordenar,
  resumenTexto,
  rutaRelativa,
  tablaTexto,
} from "../../.opencode/lib/code-audit-rules.js";

const CARPETAS = ["src", "scripts", "test", "migrations"];
const EXTENSIONES = /\.(?:js|mjs|sql)$/;

/** Lee el evento del hook. Devuelve `null` si no hay nada que auditar. */
function leerEvento(texto) {
  if (!texto.trim()) return null;
  let evento;
  try {
    evento = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!evento || typeof evento !== "object") return null;
  const entrada = evento.tool_input;
  if (!entrada || typeof entrada.command !== "string") return null;
  const cwd = typeof evento.cwd === "string" ? evento.cwd : globalThis.process.cwd();
  return { evento, cwd, parche: entrada.command };
}

/**
 * Extrae del parche de apply_patch cada archivo con sus lineas anadidas.
 * Devuelve `[{ path, text, lineas }]`; `text` solo contiene lo que el agente
 * escribe, que es justo lo que hay que auditar antes de aplicar.
 */
export function archivosDelParche(parche) {
  const salida = [];
  let actual = null;
  let destino = null;

  const cerrar = () => {
    if (actual) salida.push(actual);
    actual = null;
  };

  for (const linea of parche.split(/\r?\n/)) {
    const cabecera = /^\*\*\* (Update|Add|Delete) File: (.+)$/.exec(linea);
    if (cabecera) {
      cerrar();
      actual = { path: cabecera[2].trim(), text: [], lineas: [] };
      destino = null;
      continue;
    }
    if (/^\*\*\* (Begin Patch|End Patch|Move to: )/.test(linea)) {
      if (linea.startsWith("*** End Patch")) cerrar();
      continue;
    }
    if (/^@@/.test(linea)) {
      const rango = /^@@ [^+]*\+(\d+)/.exec(linea);
      destino = rango ? Number(rango[1]) : null;
      continue;
    }
    if (!actual) continue;
    if (linea.startsWith("+")) {
      actual.text.push(linea.slice(1));
      actual.lineas.push(destino ?? actual.text.length);
      if (destino !== null) destino += 1;
    } else if (linea.startsWith(" ")) {
      if (destino !== null) destino += 1;
    }
  }
  cerrar();

  return salida
    .filter((entrada) => entrada.text.length > 0)
    .map((entrada) => ({ ...entrada, text: entrada.text.join("\n") }));
}

/**
 * Reindexa los hallazgos del bloque anadido a la linea real del archivo.
 * El motor numera desde 1 sobre el texto recibido; aqui se traduce con el
 * mapa que construyo `archivosDelParche`.
 */
function reubicar(hallazgos, entrada) {
  return hallazgos.map((f) => {
    const indice = Math.max(0, Math.min(f.linea - 1, entrada.lineas.length - 1));
    return { ...f, linea: entrada.lineas[indice] ?? f.linea };
  });
}

function auditarParche(parche) {
  const archivos = archivosDelParche(parche);
  const propios = archivos.flatMap((entrada) =>
    reubicar(auditText({ path: entrada.path, text: entrada.text }), entrada),
  );
  const rutas = archivos.flatMap((entrada) => auditPath(entrada.path));
  return { archivos, hallazgos: ordenar([...rutas, ...propios]) };
}

/** Archivos que toco el parche, leidos del disco ya con el cambio aplicado. */
function auditarArchivosEnDisco(cwd, archivos) {
  const salida = [];
  for (const entrada of archivos) {
    const ruta = resolve(cwd, entrada.path);
    salida.push(...auditPath(entrada.path));
    if (!existsSync(ruta)) continue;
    try {
      salida.push(...auditText({ path: entrada.path, text: readFileSync(ruta, "utf8") }));
    } catch {
      // Un archivo ilegible no justifica romper el turno del agente.
    }
  }
  return ordenar(salida);
}

function recogerRaiz(directorio, acumulado) {
  if (!existsSync(directorio)) return acumulado;
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === "dist") continue;
      recogerRaiz(ruta, acumulado);
    } else if (EXTENSIONES.test(entrada.name)) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

function auditarTodo(root, rutas) {
  const absolutas = rutas.length
    ? rutas.map((ruta) => resolve(root, ruta))
    : CARPETAS.flatMap((carpeta) => recogerRaiz(resolve(root, carpeta), []));
  const entradas = [];
  const porRuta = [];
  for (const absoluta of absolutas) {
    if (!existsSync(absoluta) || !statSync(absoluta).isFile()) continue;
    const relativa = rutaRelativa(root, absoluta);
    porRuta.push(...auditPath(relativa));
    entradas.push({ path: relativa, text: readFileSync(absoluta, "utf8") });
  }
  return ordenar([...porRuta, ...auditEntries(entradas)]);
}

function auditarCambiados(root) {
  const listar = (args) => {
    try {
      return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(/\r?\n/)
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  const rutas = [
    ...listar(["diff", "--name-only", "HEAD"]),
    ...listar(["ls-files", "--others", "--exclude-standard"]),
  ].filter((ruta) => EXTENSIONES.test(ruta));
  return auditarTodo(root, [...new Set(rutas)]);
}

// --- hooks ---------------------------------------------------------------

function responder(payload) {
  globalThis.process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function hookPreToolUse(entrada) {
  const { hallazgos } = auditarParche(entrada.parche);
  const veto = hallazgos.find(esDenegado);
  if (!veto) return;
  responder({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: mensajeRechazo(veto),
    },
  });
}

function hookPostToolUse(entrada) {
  const { archivos } = auditarParche(entrada.parche);
  const hallazgos = auditarArchivosEnDisco(entrada.cwd, archivos).filter((f) => f.sev !== "info");
  if (!hallazgos.length) return;
  responder({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: resumenTexto(hallazgos),
    },
  });
}

function main() {
  const argumentos = globalThis.process.argv.slice(2);
  if (argumentos.length === 0) {
    const entrada = leerEvento(readFileSync(0, "utf8"));
    if (!entrada) return;
    if (entrada.evento.hook_event_name === "PreToolUse") hookPreToolUse(entrada);
    else if (entrada.evento.hook_event_name === "PostToolUse") hookPostToolUse(entrada);
    return;
  }

  const root = globalThis.process.cwd();
  const info = argumentos.includes("--info");
  let hallazgos;
  if (argumentos.includes("--all")) {
    hallazgos = auditarTodo(root, []);
  } else if (argumentos.includes("--changed")) {
    hallazgos = auditarCambiados(root);
  } else {
    const indice = argumentos.indexOf("--paths");
    hallazgos = auditarTodo(root, indice >= 0 ? argumentos.slice(indice + 1) : []);
  }
  const visibles = info ? hallazgos : hallazgos.filter((f) => f.sev !== "info");
  globalThis.process.stdout.write(`${tablaTexto(visibles)}\n`);
}

/** Solo se ejecuta como programa: al importarlo (tests) no hace nada. */
function esEjecucionDirecta() {
  const entrada = globalThis.process.argv[1];
  if (!entrada) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entrada)).href;
  } catch {
    return false;
  }
}

if (esEjecucionDirecta()) main();
