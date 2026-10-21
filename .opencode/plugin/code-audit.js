import { Plugin } from "@opencode/plugin"
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  AREAS,
  WRITE_TOOLS,
  auditEntries,
  auditPath,
  claveDe,
  esDenegado,
  mensajeRechazo,
  ordenar,
  pathsDeOpenapi,
  resumenTexto,
  rutaRelativa,
  rutasSinContrato,
  tablaTexto,
} from "../lib/code-audit-rules.js"

// Plugin V2 de auditoria de codigo del backend MiBeca. Tres capas:
//   1. execute.before -> bloquea solo las reglas `deny` (secretos, credenciales,
//      cadena de conexion con contrasena literal, SQL con datos de la peticion,
//      ruta de escritura sin CSRF).
//   2. execute.after  -> guarda los avisos de lo escrito en el almacenamiento.
//   3. session context + tool `audit_code` + comando `/auditar` -> divulgan.
//
// No edita archivos, no hace red y no llama a un modelo: es deterministico.
// Catalogo de reglas en `../lib/code-audit-rules.js`.

const CLAVE_ESTADO = "mibeca.code-audit.estado"
const MAX_HALLAZGOS = 300
const MAX_INYECTADOS = 20

// Montaje real en src/app.js: se usa para contrastar con openapi.yaml (API-04).
const PREFIJOS_RUTAS = {
  "src/routes/auth.js": "/auth",
  "src/routes/users.js": "/users",
  "src/routes/jobs.js": "",
  "src/routes/control.js": "",
}

function raizDe(ctx) {
  const directorio = (ctx.location && ctx.location.directory) || globalThis.process.cwd()
  return String(directorio).replace(/\\/g, "/")
}

function camposDeEntrada(event) {
  const input = (event && event.input) || {}
  const archivo = input.filePath || input.path || input.file || null
  if (!archivo) return null
  const textos = []
  if (typeof input.content === "string") textos.push(input.content)
  if (typeof input.newString === "string") textos.push(input.newString)
  if (Array.isArray(input.edits)) {
    for (const edicion of input.edits) {
      if (edicion && typeof edicion.newString === "string") textos.push(edicion.newString)
    }
  }
  if (!textos.length) return null
  return { archivo: String(archivo), textos }
}

function hallazgosDeEscritura(entrada, root) {
  const rel = rutaRelativa(root, entrada.archivo)
  const entradas = entrada.textos.map((text) => ({ path: rel, text }))
  return [...auditPath(rel), ...auditEntries(entradas)]
}

async function leerEstado(ctx) {
  try {
    const valor = await ctx.storage.get(CLAVE_ESTADO)
    return valor && typeof valor === "object" ? valor : {}
  } catch {
    return {}
  }
}

async function guardarEstado(ctx, estado) {
  const claves = Object.keys(estado)
  if (claves.length > MAX_HALLAZGOS) {
    const recortado = {}
    const recientes = claves
      .map((clave) => estado[clave])
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, MAX_HALLAZGOS)
    for (const f of recientes) recortado[f.clave] = f
    return ctx.storage.set(CLAVE_ESTADO, recortado)
  }
  return ctx.storage.set(CLAVE_ESTADO, estado)
}

function extensionAuditable(ruta) {
  return /\.(?:js|mjs|sql)$/.test(ruta)
}

function listarArchivos(root, carpetas = ["src", "scripts", "test", "migrations"]) {
  const salida = []
  const visitar = (relativo) => {
    let entradas
    try {
      entradas = readdirSync(join(root, relativo), { withFileTypes: true })
    } catch {
      return
    }
    for (const entrada of entradas) {
      const siguiente = `${relativo}/${entrada.name}`
      if (entrada.isDirectory()) {
        if (["node_modules", "dist", "coverage"].includes(entrada.name)) continue
        visitar(siguiente)
      } else if (extensionAuditable(siguiente)) {
        salida.push(siguiente)
      }
    }
  }
  for (const carpeta of carpetas) visitar(carpeta)
  return salida
}

function cambiosGit(root) {
  try {
    const rastreo = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" })
    const nuevos = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    return [...rastreo.split("\n"), ...nuevos.split("\n")]
      .map((linea) => linea.trim().replace(/\\/g, "/"))
      .filter((linea) => linea && extensionAuditable(linea))
  } catch {
    return listarArchivos(root)
  }
}

function leerTexto(root, relativo) {
  try {
    return readFileSync(join(root, relativo), "utf8")
  } catch {
    return ""
  }
}

// API-04 no es una regla por linea: contrasta las rutas declaradas con el
// contrato. Se evalua solo cuando el alcance incluye archivos de src/routes/.
function rutasContrato(root, relativos) {
  const archivos = relativos.filter((rel) => rel in PREFIJOS_RUTAS)
  if (!archivos.length) return []
  const openapi = leerTexto(root, "openapi.yaml")
  if (!openapi) return []
  const paths = pathsDeOpenapi(openapi)
  const porArchivo = archivos.map((archivo) => ({
    archivo,
    prefijo: PREFIJOS_RUTAS[archivo],
    texto: leerTexto(root, archivo),
  }))
  return rutasSinContrato(porArchivo, paths).map((r) => ({
    id: r.id,
    area: "contrato",
    sev: "info",
    path: r.path,
    linea: 1,
    msg: `${r.metodo} ${r.ruta} no aparece en openapi.yaml`,
  }))
}

function auditarProyecto({ root, scope, paths, areas, includeInfo }) {
  const relativos = paths && paths.length
    ? paths.map((p) => rutaRelativa(root, p)).filter(Boolean)
    : scope === "all"
      ? listarArchivos(root)
      : cambiosGit(root)

  const entradas = relativos
    .filter(extensionAuditable)
    .map((rel) => ({ path: rel, text: leerTexto(root, rel) }))
    .filter((entrada) => entrada.text)

  let hallazgos = [...auditEntries(entradas), ...rutasContrato(root, relativos)]
  if (areas && areas.length) hallazgos = hallazgos.filter((f) => areas.includes(f.area))
  if (!includeInfo) hallazgos = hallazgos.filter((f) => f.sev !== "info")
  return ordenar(hallazgos)
}

function describirHallazgo(f) {
  return { id: f.id, area: f.area, sev: f.sev, path: f.path, linea: f.linea, mensaje: f.msg }
}

export default Plugin.define({
  id: "mibeca.code-audit",
  async setup(ctx) {
    const root = raizDe(ctx)
    const pendientes = new Map()

    // Capa 1: rechazo determinista de las reglas `deny`.
    await ctx.tool.hook("execute.before", (event) => {
      if (!WRITE_TOOLS.has(event.tool)) return
      const entrada = camposDeEntrada(event)
      if (!entrada) return
      const hallazgos = hallazgosDeEscritura(entrada, root)
      pendientes.set(rutaRelativa(root, entrada.archivo), hallazgos)
      const veto = hallazgos.find(esDenegado)
      if (veto) throw new Error(mensajeRechazo(veto))
    })

    // Capa 2: registro pasivo de avisos de la escritura completada.
    await ctx.tool.hook("execute.after", async (event) => {
      if (!WRITE_TOOLS.has(event.tool)) return
      const entrada = camposDeEntrada(event)
      if (!entrada) return
      const rel = rutaRelativa(root, entrada.archivo)
      const hallazgos = pendientes.get(rel) || hallazgosDeEscritura(entrada, root)
      pendientes.delete(rel)
      if (event.status !== "completed" || !hallazgos.length) return
      if (!ctx.storage) return
      const estado = await leerEstado(ctx)
      for (const f of hallazgos) {
        estado[claveDe(f)] = { ...f, clave: claveDe(f), visto: false, ts: Date.now() }
      }
      await guardarEstado(ctx, estado)
    })

    // Capa 3a: divulgacion en el siguiente turno, una sola vez por hallazgo.
    await ctx.session.hook("context", async (event) => {
      if (!ctx.storage || !Array.isArray(event.system)) return
      const estado = await leerEstado(ctx)
      const nuevos = Object.values(estado).filter((f) => f && !f.visto)
      if (!nuevos.length) return
      const mostrados = ordenar(nuevos).slice(0, MAX_INYECTADOS)
      event.system.push({ type: "text", text: resumenTexto(mostrados, { maximo: MAX_INYECTADOS }) })
      for (const f of mostrados) {
        if (estado[f.clave]) estado[f.clave].visto = true
      }
      await guardarEstado(ctx, estado)
    })

    // Capa 3b: tool invocable por el agente (incluido el subagente reviewer).
    try {
      await ctx.tool.transform((editor) => {
        editor.add({
          name: "audit_code",
          description:
            "Audita el codigo del backend MiBeca contra las reglas deterministas del repo " +
            "(seguridad, contrato de API, datos/SQL, auth, migraciones, higiene). No modifica archivos.",
          input: {
            type: "object",
            properties: {
              scope: { type: "string", enum: ["changed", "all"], description: "changed: solo el arbol de trabajo; all: src, scripts, test y migrations" },
              paths: { type: "array", items: { type: "string" }, description: "Rutas concretas a auditar; tiene prioridad sobre scope" },
              areas: { type: "array", items: { type: "string", enum: AREAS }, description: "Filtra por area" },
              includeInfo: { type: "boolean", description: "Incluye hallazgos informativos (incluye el contraste con openapi.yaml)" },
            },
            additionalProperties: false,
          },
          execute: async (input) => {
            const hallazgos = auditarProyecto({
              root,
              scope: input.scope || "changed",
              paths: input.paths,
              areas: input.areas,
              includeInfo: input.includeInfo === true,
            })
            return {
              content: JSON.stringify(
                { total: hallazgos.length, hallazgos: hallazgos.map(describirHallazgo) },
                null,
                2,
              ),
            }
          },
        })
      })
    } catch (error) {
      console.error(`[mibeca.code-audit] no se pudo registrar audit_code: ${error && error.message}`)
    }

    // Capa 3c: comando /auditar con tabla legible.
    try {
      await ctx.command.transform((editor) => {
        editor.add({
          name: "auditar",
          description: "Auditoria determinista del backend MiBeca (areas: seguridad, contrato, datos, auth, migraciones, higiene)",
          execute: async ({ sessionID, prompt, delivery }) => {
            const texto = String((prompt && prompt.text) || "")
            const scope = /\ball\b/.test(texto) ? "all" : "changed"
            const area = AREAS.find((nombre) => texto.includes(nombre))
            const hallazgos = auditarProyecto({
              root,
              scope,
              areas: area ? [area] : undefined,
              includeInfo: /--info/.test(texto),
            })
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: tablaTexto(hallazgos),
              delivery,
            })
          },
        })
      })
    } catch (error) {
      console.error(`[mibeca.code-audit] no se pudo registrar /auditar: ${error && error.message}`)
    }
  },
})
