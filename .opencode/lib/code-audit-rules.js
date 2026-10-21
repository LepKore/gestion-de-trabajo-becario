// Reglas puras de auditoria de codigo del backend MiBeca; no depende de OpenCode.
//
// Motor determinista: recibe ruta y texto y devuelve hallazgos. Sin red, sin
// modelo, sin escritura. El plugin `.opencode/plugin/code-audit.js` lo conecta a
// OpenCode, `test/code-audit.test.js` lo verifica y (mas adelante) el puente de
// Codex lo reutiliza.
//
// Tipos de regla:
//   linea -> se evalua por linea (salta comentarios si `saltarComentarios`)
//   archivo -> se evalua sobre el texto completo y reporta la linea del match
//   ruta  -> se evalua sobre la ruta, sin leer contenido
//
// Campos opcionales:
//   soloEn / soloFueraDe : prefijos de ruta (relativa al repo, con `/`)
//   extensiones          : regex sobre la ruta
//   requiere / unless    : regex que debe / no debe aparecer en la misma linea
//   contextoPrevio       : si aparece en las 3 lineas previas, se omite
//   justificacion        : exige `--` o un comentario previo
//   invertida            : en tipo archivo, reporta solo si NO hay coincidencias
//   requiereAusente      : en tipo archivo, omite si el patron aparece

export const AREAS = ["seguridad", "contrato", "datos", "auth", "migraciones", "higiene"];

export const SEVERIDADES = ["deny", "warn", "info"];

export const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "patch", "apply_patch"]);

const PESO = { deny: 0, warn: 1, info: 2 };

const RUTAS_IGNORADAS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)\.git\//,
  /(^|\/)\.opencode\//,
  /package-lock\.json$/,
];

const JS = /\.(?:js|mjs)$/;
const SQL = /\.sql$/;

// Los patrones de credenciales se arman en runtime para que este archivo no
// contenga los prefijos literales de los proveedores.
const PREFIJOS = ["gh" + "p_", "github" + "_pat_", "AK" + "IA", "AI" + "za"];

const TEST_SECRETO = new RegExp(
  [
    "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    `\\b${PREFIJOS[0]}[A-Za-z0-9]{20,}`,
    `\\b${PREFIJOS[1]}[A-Za-z0-9_]{20,}`,
    `\\b${PREFIJOS[2]}[0-9A-Z]{16}\\b`,
    `\\b${PREFIJOS[3]}[0-9A-Za-z_-]{30,}`,
  ].join("|"),
);

const TEST_URI = /(?:postgres|postgresql):\/\/[^\s:@/]+:(?!<)[^\s@/]{8,}@/;

export const REGLAS = [
  // --- Seguridad ---------------------------------------------------------
  {
    id: "SEC-01",
    area: "seguridad",
    sev: "deny",
    tipo: "linea",
    test: TEST_SECRETO,
    msg: "secreto incrustado: retiralo y usa una variable de entorno fuera del repositorio",
  },
  {
    id: "SEC-02",
    area: "seguridad",
    sev: "deny",
    tipo: "ruta",
    test: /(^|\/)\.env(?!\.example$)(\.[^/]*)?$|(^|\/)[^/]*firebase-adminsdk[^/]*\.json$|(^|\/)[^/]*(?:service[-_]?account|credenciales|credentials)[^/]*\.json$|\.(?:pem|p12|pfx|key)$/i,
    msg: "archivo de credenciales: no se versiona ni se escribe desde el agente",
  },
  {
    id: "SEC-03",
    area: "seguridad",
    sev: "deny",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: TEST_URI,
    unless: /<|missing/,
    msg: "cadena de conexion con contrasena literal: usa DATABASE_URL del entorno",
  },
  {
    id: "SEC-04",
    area: "seguridad",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /\bconsole\.\w+\s*\(/,
    requiere: /(password|contrasen|contrase|token|authorization|credencial|csrf)/i,
    msg: "no registres datos de sesion o credenciales en consola",
  },
  {
    id: "SEC-05",
    area: "seguridad",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /(?:httpOnly|secure)\s*:\s*false\b/,
    msg: "cookie con httpOnly o secure desactivados",
  },
  {
    id: "SEC-06",
    area: "seguridad",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /\borigin\s*:\s*(?:['"]\*['"]|true\b)/,
    msg: "CORS con origen comodin: usa la allowlist de config.allowedOrigins",
  },
  {
    id: "SEC-07",
    area: "seguridad",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /createHash\s*\(\s*['"](?:md5|sha1)['"]/,
    msg: "hash debil: argon2 es el algoritmo del proyecto para contrasenas",
  },

  // --- Contrato API ------------------------------------------------------
  {
    id: "API-01",
    area: "contrato",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/", "src/services/"],
    extensiones: JS,
    test: /throw new Error\s*\(/,
    msg: "usa los helpers de src/lib/errors.js para que la respuesta respete el sobre de error",
  },
  {
    id: "API-02",
    area: "contrato",
    sev: "warn",
    tipo: "archivo",
    soloEn: ["src/routes/"],
    extensiones: JS,
    test: /(?:request|req)\.body/g,
    requiereAusente: /\bparse\s*\(/,
    msg: "cuerpo de peticion sin validar: pasa los datos por parse(esquema, request.body)",
  },
  {
    id: "API-03",
    area: "contrato",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/"],
    extensiones: JS,
    test: /\b(?:res|response)\.send\s*\(/,
    msg: "response.send rompe el contrato JSON: usa response.json con data o error",
  },
  {
    id: "API-05",
    area: "contrato",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/"],
    extensiones: JS,
    test: /error\.stack|String\s*\(\s*error\s*\)/,
    requiere: /\b(?:res|response)\./,
    msg: "no expongas detalles internos del error en la respuesta",
  },

  // --- Datos / SQL -------------------------------------------------------
  {
    id: "DB-01",
    area: "datos",
    sev: "deny",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /\$\{\s*(?:req|request|body|params|headers)\./,
    requiere: /(?:SELECT|INSERT|UPDATE|DELETE|query\s*\()/i,
    msg: "SQL construido con datos de la peticion: usa parametros ($1, $2) en su lugar",
  },
  {
    id: "DB-02",
    area: "datos",
    sev: "warn",
    tipo: "archivo",
    soloEn: ["src/"],
    extensiones: JS,
    test: /(?:query|sql)\s*\(\s*['"`]\s*BEGIN\b/gi,
    requiereAusente: /\bROLLBACK\b/,
    msg: "transaccion abierta sin ROLLBACK en el mismo archivo",
  },
  {
    id: "DB-03",
    area: "datos",
    sev: "warn",
    tipo: "archivo",
    soloEn: ["src/"],
    extensiones: JS,
    test: /\b(?:UPDATE\s+["\w.]+\s+SET|DELETE\s+FROM\s+["\w.]+)/gi,
    unless: /\bWHERE\b/i,
    ventana: 400,
    msg: "UPDATE o DELETE sin WHERE: confirma que es intencional",
  },
  {
    id: "DB-04",
    area: "datos",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    extensiones: JS,
    soloFueraDe: [
      "scripts/migrate.js",
      "scripts/create-admin.js",
      "scripts/create-test-database.js",
      "test/helpers.js",
    ],
    test: /process\.env\.DATABASE_URL/,
    msg: "lee DATABASE_URL en el borde de entorno (scripts de conexion), no en el dominio",
  },
  {
    id: "DB-05",
    area: "datos",
    sev: "info",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /\bSELECT\s+\*/i,
    msg: "SELECT *: nombra las columnas para no depender del orden del esquema",
  },

  // --- Auth / sesion -----------------------------------------------------
  {
    id: "AUTH-01",
    area: "auth",
    sev: "deny",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/"],
    extensiones: JS,
    test: /\brouter\.(?:post|patch|put|delete)\s*\(/,
    unless: /requireCsrf|[,(\s]write[,)\s]|\/login['"]/,
    msg: "ruta de escritura sin requireCsrf: toda mutacion exige el token CSRF",
  },
  {
    id: "AUTH-02",
    area: "auth",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/"],
    extensiones: JS,
    test: /\brouter\.(?:get|post|patch|put|delete)\s*\(/,
    unless: /requireSession|requireRole|requireCsrf|requireNoPendingPasswordChange|\bauth\b|\badmin\b|\bwrite\b|\bowner\b|\bstudent\b|\bhistoryRole\b|\bsession\b|\/login['"]/,
    msg: "ruta sin middleware de sesion o rol declarado: revisa el control de acceso",
  },
  {
    id: "AUTH-03",
    area: "auth",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    extensiones: JS,
    test: /(?:\b(?:token|csrf\w*|password|hash\w*)\s*===)|(?:===\s*(?:token|password|hash\w*)\b)/,
    unless: /safeEqual/,
    msg: "compara secretos con safeEqual (tiempo constante), no con ===",
  },
  {
    id: "AUTH-04",
    area: "auth",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/routes/auth.js"],
    extensiones: JS,
    test: /(?:no existe|no registrado|correo incorrecto|usuario incorrecto)/i,
    msg: "el mensaje de login no debe revelar si la cuenta existe",
  },

  // --- Migraciones -------------------------------------------------------
  {
    id: "MIG-01",
    area: "migraciones",
    sev: "warn",
    tipo: "linea",
    soloEn: ["migrations/"],
    extensiones: SQL,
    test: /\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE)\b/i,
    justificacion: true,
    msg: "operacion destructiva en una migracion: justifica el motivo en la linea o la anterior",
  },
  {
    id: "MIG-02",
    area: "migraciones",
    sev: "warn",
    tipo: "ruta",
    extensiones: SQL,
    test: /^migrations\/(?!\d{4}_[a-z0-9_]+\.sql$)/,
    msg: "las migraciones se ordenan por nombre: usa NNNN_descripcion.sql",
  },

  // --- Higiene y supresiones --------------------------------------------
  {
    id: "HYG-01",
    area: "higiene",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/"],
    soloFueraDe: ["src/server.js"],
    extensiones: JS,
    test: /\bconsole\.(?:log|debug)\s*\(|^\s*debugger\b/,
    msg: "resto de depuracion en el codigo de la aplicacion",
  },
  {
    id: "HYG-02",
    area: "higiene",
    sev: "info",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["src/", "scripts/"],
    extensiones: JS,
    test: /\b(?:TODO|FIXME)\b/,
    msg: "pendiente declarado en el codigo: registralo en la documentacion o resolvelo",
  },
  {
    id: "HYG-03",
    area: "higiene",
    sev: "warn",
    tipo: "linea",
    saltarComentarios: true,
    soloEn: ["test/"],
    extensiones: JS,
    test: /\b(?:describe|it|test)\.only\s*\(/,
    msg: "solo se ejecutaria una prueba: quita el .only antes de cerrar",
  },
  {
    id: "SUP-01",
    area: "higiene",
    sev: "warn",
    tipo: "linea",
    extensiones: JS,
    test: /eslint-disable|@ts-ignore|@ts-expect-error/,
    justificacion: true,
    msg: "supresion de lint o de tipos sin justificar: explica el motivo o corrige la causa",
  },
];

// --- utilidades ----------------------------------------------------------

export function normalizarRuta(valor) {
  return String(valor || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

export function esIgnorada(ruta) {
  return RUTAS_IGNORADAS.some((patron) => patron.test(ruta));
}

function aplica(regla, ruta) {
  if (esIgnorada(ruta)) return false;
  if (regla.soloEn && !regla.soloEn.some((prefijo) => ruta.startsWith(prefijo))) return false;
  if (regla.soloFueraDe && regla.soloFueraDe.length && regla.soloFueraDe.includes(ruta)) return false;
  if (regla.extensiones && !regla.extensiones.test(ruta)) return false;
  return true;
}

function esComentario(linea) {
  const t = linea.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("--");
}

function lineaDe(texto, indice) {
  return texto.slice(0, indice).split(/\r?\n/).length;
}

function hallazgo(regla, ruta, linea) {
  return { id: regla.id, area: regla.area, sev: regla.sev, path: ruta, linea, msg: regla.msg };
}

export function claveDe(f) {
  return `${f.id}:${f.path}:${f.linea}`;
}

export function esDenegado(f) {
  return f.sev === "deny";
}

export function ordenar(hallazgos) {
  return [...hallazgos].sort(
    (a, b) => PESO[a.sev] - PESO[b.sev] || a.path.localeCompare(b.path) || a.linea - b.linea,
  );
}

// --- evaluadores ---------------------------------------------------------

function evaluarLinea(regla, ruta, lineas) {
  const salida = [];
  lineas.forEach((texto, indice) => {
    if (regla.saltarComentarios && esComentario(texto)) return;
    if (regla.requiere && !regla.requiere.test(texto)) return;
    if (regla.unless && regla.unless.test(texto)) return;
    if (regla.contextoPrevio) {
      const desde = Math.max(0, indice - 3);
      const previas = lineas.slice(desde, indice).join("\n");
      if (regla.contextoPrevio.test(previas)) return;
    }
    if (regla.justificacion) {
      const previa = indice > 0 ? lineas[indice - 1].trim() : "";
      const esComentarioPrevio =
        (previa.startsWith("//") || previa.startsWith("--")) && !/eslint-disable|@ts-/.test(previa);
      if (/--/.test(texto) || esComentarioPrevio) return;
    }
    if (!regla.test.test(texto)) return;
    regla.test.lastIndex = 0;
    salida.push(hallazgo(regla, ruta, indice + 1));
  });
  return salida;
}

function evaluarArchivo(regla, ruta, texto) {
  if (regla.requiereArchivo && !regla.requiereArchivo.test(texto)) return [];
  if (regla.requiereAusente && regla.requiereAusente.test(texto)) return [];
  const patron = new RegExp(regla.test.source, regla.test.flags.includes("g") ? regla.test.flags : `${regla.test.flags}g`);
  const coincidencias = [];
  let match;
  while ((match = patron.exec(texto)) !== null) {
    coincidencias.push(match);
    if (match.index === patron.lastIndex) patron.lastIndex += 1;
  }
  if (regla.invertida) {
    return coincidencias.length ? [] : [hallazgo(regla, ruta, 1)];
  }
  return coincidencias
    .filter((match) => {
      if (!regla.unless) return true;
      const objetivo = regla.ventana
        ? texto.slice(match.index, match.index + regla.ventana)
        : match[0];
      return !regla.unless.test(objetivo);
    })
    .map((match) => hallazgo(regla, ruta, lineaDe(texto, match.index)));
}

// --- API publica ---------------------------------------------------------

/** Audita la ruta sin leer contenido (credenciales, extensiones sensibles). */
export function auditPath(rutaCruda) {
  const ruta = normalizarRuta(rutaCruda);
  if (!ruta || esIgnorada(ruta)) return [];
  return REGLAS
    .filter((regla) => regla.tipo === "ruta" && aplica(regla, ruta) && regla.test.test(ruta))
    .map((regla) => hallazgo(regla, ruta, 1));
}

/** Audita un texto ya cargado. Devuelve hallazgos ordenados por severidad. */
export function auditText({ path, text }) {
  const ruta = normalizarRuta(path);
  const contenido = typeof text === "string" ? text : "";
  if (!ruta || !contenido || esIgnorada(ruta)) return [];
  const lineas = contenido.split(/\r?\n/);
  const salida = [];
  for (const regla of REGLAS) {
    if (!aplica(regla, ruta)) continue;
    if (regla.tipo === "linea") salida.push(...evaluarLinea(regla, ruta, lineas));
    else if (regla.tipo === "archivo") salida.push(...evaluarArchivo(regla, ruta, contenido));
  }
  return ordenar(salida);
}

/** Audita varias entradas `{ path, text }` y deduplica por regla, ruta y linea. */
export function auditEntries(entradas) {
  const vistos = new Set();
  const salida = [];
  for (const entrada of entradas) {
    for (const f of auditText(entrada)) {
      const clave = claveDe(f);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      salida.push(f);
    }
  }
  return ordenar(salida);
}

/** Hallazgos que justifican un rechazo de escritura. */
export function auditDenegado(entradas) {
  return auditEntries(entradas).filter(esDenegado);
}

export function mensajeRechazo(f) {
  return (
    `Hook local MiBeca: escritura rechazada por ${f.id} (${f.area}).\n` +
    `Archivo: ${f.path}:${f.linea}\n` +
    `Motivo: ${f.msg}.\n` +
    "Corrige el contenido; el agente no puede desactivar este control para pasar."
  );
}

export function resumenTexto(hallazgos, { maximo = 20 } = {}) {
  const lista = ordenar(hallazgos);
  if (!lista.length) return "";
  const mostrados = lista.slice(0, maximo);
  const lineas = mostrados.map((f) => `- ${f.id} ${f.path}:${f.linea} ${f.msg}`);
  const resto = lista.length - mostrados.length;
  return [
    `[auditoria MiBeca] ${lista.length} hallazgo(s) de la ultima escritura:`,
    ...lineas,
    ...(resto > 0 ? [`- y ${resto} mas; ejecuta /auditar para el detalle completo`] : []),
    "Corrige o justifica antes de cerrar la tarea.",
  ].join("\n");
}

export function tablaTexto(hallazgos) {
  if (!hallazgos.length) return "Auditoria MiBeca: sin hallazgos.";
  const filas = hallazgos.map((f) => `| ${f.sev} | ${f.id} | ${f.path}:${f.linea} | ${f.msg} |`);
  return [
    "| Severidad | Regla | Ubicacion | Hallazgo |",
    "| --- | --- | --- | --- |",
    ...filas,
    "",
    `Total: ${hallazgos.length} (deny ${contar(hallazgos, "deny")}, warn ${contar(hallazgos, "warn")}, info ${contar(hallazgos, "info")}).`,
  ].join("\n");
}

function contar(hallazgos, severidad) {
  return hallazgos.filter((f) => f.sev === severidad).length;
}

/** Normaliza una ruta absoluta o relativa a la forma relativa al repo. */
export function rutaRelativa(root, archivo) {
  const base = normalizarRuta(root);
  const destino = normalizarRuta(archivo);
  if (!destino) return "";
  if (!/^[A-Za-z]:\//.test(destino) && !destino.startsWith("/")) return destino;
  if (destino === base) return "";
  if (destino.startsWith(`${base}/`)) return destino.slice(base.length + 1);
  const partesBase = base.split("/");
  const partesDestino = destino.split("/");
  let comun = 0;
  while (comun < partesBase.length && partesBase[comun] === partesDestino[comun]) comun += 1;
  const subida = partesBase.length - comun;
  return [...Array(subida).fill(".."), ...partesDestino.slice(comun)].join("/");
}

// --- contraste con el contrato (a demanda) -------------------------------

/** Rutas declaradas en un archivo de router: `router.get('/ruta', ...)`. */
export function rutasDeclaradas(texto) {
  const salida = [];
  const patron = /\brouter\.(get|post|patch|put|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
  let match;
  while ((match = patron.exec(texto)) !== null) {
    if (match[3].includes("${")) continue;
    const ruta = match[3].replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    salida.push({ metodo: match[1].toUpperCase(), ruta });
  }
  return salida;
}

/** Rutas declaradas en openapi.yaml, relativas al `servers.url` (sin /api/v1). */
export function pathsDeOpenapi(texto) {
  const salida = new Set();
  for (const linea of texto.split(/\r?\n/)) {
    const match = /^ {2}(\/[^\s:]*):\s*$/.exec(linea);
    if (match) salida.add(match[1]);
  }
  return salida;
}

/** Rutas de los routers que no aparecen en el contrato. */
export function rutasSinContrato(porArchivo, paths) {
  const salida = [];
  for (const { archivo, prefijo, texto } of porArchivo) {
    for (const { metodo, ruta } of rutasDeclaradas(texto)) {
      const completa = `${prefijo}${ruta === "/" ? "" : ruta}` || "/";
      if (!paths.has(completa)) salida.push({ id: "API-04", path: archivo, metodo, ruta: completa });
    }
  }
  return salida;
}
