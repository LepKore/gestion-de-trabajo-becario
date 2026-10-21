import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { archivosDelParche } from "../.codex/hooks/audit_bridge.mjs";

const RAIZ = process.cwd();

/**
 * Une fragmentos para que este archivo no contenga literales que el propio
 * hook veta (o que disparen avisos); el texto peligroso solo existe al vuelo.
 */
const trozo = (...partes) => partes.join("");

const TOKEN_FALSO = trozo("gh", "p_", "0123456789abcdefghijklmnopqrstuv");
const SQL_INSEGURO = trozo("pool.query('SELECT * FROM usuarios WHERE id = ", "$", "{req.params.id}');");
const POST_SIN_CSRF = trozo("router.post('/algo', ", "handler);");

function parche(lineas) {
  return ["*** Begin Patch", ...lineas, "*** End Patch"].join("\n");
}

function ejecutar(evento) {
  return execFileSync("node", [".codex/hooks/audit_bridge.mjs"], {
    cwd: RAIZ,
    input: JSON.stringify(evento),
    encoding: "utf8",
  });
}

function preToolUse(texto) {
  return ejecutar({ hook_event_name: "PreToolUse", cwd: RAIZ, tool_input: { command: texto } });
}

function postToolUse(texto) {
  return ejecutar({ hook_event_name: "PostToolUse", cwd: RAIZ, tool_input: { command: texto } });
}

describe("archivosDelParche", () => {
  it("separa cada archivo y conserva solo las lineas anadidas", () => {
    const texto = parche([
      "*** Update File: src/routes/jobs.js",
      "@@ -1,2 +1,3 @@",
      " const a = 1;",
      "+const b = 2;",
      "*** Add File: src/lib/nuevo.js",
      "@@ -0,0 +1,1 @@",
      "+export const c = 3;",
    ]);
    const archivos = archivosDelParche(texto);
    assert.deepEqual(
      archivos.map((a) => a.path),
      ["src/routes/jobs.js", "src/lib/nuevo.js"],
    );
    assert.equal(archivos[0].text, "const b = 2;");
    assert.equal(archivos[1].text, "export const c = 3;");
  });

  it("numera las lineas anadidas segun la cabecera del hunk", () => {
    const texto = parche([
      "*** Update File: src/routes/jobs.js",
      "@@ -10,3 +10,4 @@",
      " const a = 1;",
      "+const b = 2;",
      " const c = 3;",
      "+const d = 4;",
    ]);
    const [archivo] = archivosDelParche(texto);
    assert.deepEqual(archivo.lineas, [11, 13]);
  });

  it("ignora secciones sin lineas anadidas", () => {
    const texto = parche(["*** Delete File: src/viejo.js"]);
    assert.deepEqual(archivosDelParche(texto), []);
  });
});

describe("hook PreToolUse", () => {
  it("deniega escribir un archivo .env", () => {
    const salida = preToolUse(parche(["*** Add File: .env", "@@ -0,0 +1,1 @@", "+FOO=bar"]));
    const cuerpo = JSON.parse(salida);
    assert.equal(cuerpo.hookSpecificOutput.permissionDecision, "deny");
    assert.match(cuerpo.hookSpecificOutput.permissionDecisionReason, /SEC-02/);
  });

  it("deniega SQL que interpola datos de la peticion", () => {
    const salida = preToolUse(
      parche(["*** Update File: src/services/algo.js", "@@ -1,1 +1,2 @@", `+${SQL_INSEGURO}`]),
    );
    const cuerpo = JSON.parse(salida);
    assert.equal(cuerpo.hookSpecificOutput.permissionDecision, "deny");
    assert.match(cuerpo.hookSpecificOutput.permissionDecisionReason, /DB-01/);
    assert.match(cuerpo.hookSpecificOutput.permissionDecisionReason, /src\/services\/algo\.js:1/);
  });

  it("deniega una ruta de escritura sin CSRF", () => {
    const salida = preToolUse(
      parche(["*** Update File: src/routes/algo.js", "@@ -1,1 +1,2 @@", `+${POST_SIN_CSRF}`]),
    );
    const cuerpo = JSON.parse(salida);
    assert.equal(cuerpo.hookSpecificOutput.permissionDecision, "deny");
    assert.match(cuerpo.hookSpecificOutput.permissionDecisionReason, /AUTH-01/);
  });

  it("deniega un token incrustado en el codigo", () => {
    const salida = preToolUse(
      parche(["*** Update File: src/lib/algo.js", "@@ -1,1 +1,2 @@", `+const t = "${TOKEN_FALSO}";`]),
    );
    const cuerpo = JSON.parse(salida);
    assert.equal(cuerpo.hookSpecificOutput.permissionDecision, "deny");
    assert.match(cuerpo.hookSpecificOutput.permissionDecisionReason, /SEC-01/);
  });

  it("deja pasar una escritura limpia sin salida", () => {
    const salida = preToolUse(
      parche(["*** Update File: src/routes/jobs.js", "@@ -1,1 +1,2 @@", "+const ruta = '/health';"]),
    );
    assert.equal(salida, "");
  });

  it("no bloquea por avisos: un console.log solo se informa despues", () => {
    const texto = parche(["*** Update File: src/lib/nuevo.js", "@@ -0,0 +1,1 @@", "+console.log('depuracion');"]);
    assert.equal(preToolUse(texto), "");
  });
});

describe("hook PostToolUse", () => {
  it("no devuelve nada cuando el evento no trae parche", () => {
    assert.equal(postToolUse(""), "");
  });

  it("devuelve additionalContext y no un rechazo", () => {
    const destino = join(process.cwd(), "src", "lib", "__tmp_codex_audit.js");
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, "console.log('depuracion');\n", "utf8");
    try {
      const salida = postToolUse(
        parche(["*** Update File: src/lib/__tmp_codex_audit.js", "@@ -0,0 +1,1 @@", "+console.log('depuracion');"]),
      );
      const cuerpo = JSON.parse(salida);
      assert.equal(cuerpo.hookSpecificOutput.hookEventName, "PostToolUse");
      assert.match(cuerpo.hookSpecificOutput.additionalContext, /HYG-01/);
      assert.equal(cuerpo.hookSpecificOutput.permissionDecision, undefined);
    } finally {
      rmSync(destino, { force: true });
    }
  });
});
