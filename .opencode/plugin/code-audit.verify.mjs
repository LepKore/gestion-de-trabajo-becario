/**
 * Verificacion del motor de auditoria contra una tabla canonica de casos.
 * Uso: node .opencode/plugin/code-audit.verify.mjs
 *
 * Importa solo el motor puro (`../lib/code-audit-rules.js`), asi que se ejecuta
 * con `node` a secas: no necesita el paquete `@opencode/plugin`.
 */
import { AREAS, REGLAS, SEVERIDADES, auditPath, auditText } from "../lib/code-audit-rules.js";

const CLAVE_FALSA = `${"-".repeat(5)}BEGIN RSA PRIVATE KEY${"-".repeat(5)}`;
const TOKEN_FALSO = `${"gh" + "p_"}${"a".repeat(24)}`;
const CLAVE_URI = `${"postgres"}://mibeca_dev:supersecreto123@127.0.0.1:5432/mibeca_dev`;

// [ruta, texto, severidad esperada o null]
const CASOS = [
  // Seguridad
  ["src/lib/x.js", `const k = "${CLAVE_FALSA}"`, "deny"],
  ["src/lib/x.js", `const t = "${TOKEN_FALSO}"`, "deny"],
  [".env", "DATABASE_URL=lo-que-sea", "deny"],
  [".env.example", "DATABASE_URL=postgresql://u:<clave>@127.0.0.1/db", null],
  ["certs/prod-ca-2021.crt", "-----BEGIN CERTIFICATE-----", null],
  ["secrets/credenciales.pem", `${"-".repeat(5)}BEGIN PRIVATE KEY${"-".repeat(5)}`, "deny"],
  ["src/db.js", `const url = '${CLAVE_URI}'`, "deny"],
  ["src/app.js", "console.log('password', valor)", "warn"],
  ["src/app.js", "response.cookie('s', valor, { httpOnly: false })", "warn"],
  ["src/app.js", "cors({ origin: '*' })", "warn"],
  ["src/lib/x.js", "createHash('md5').update(clave).digest('hex')", "warn"],
  // Contrato
  ["src/routes/x.js", "throw new Error('algo salio mal')", "warn"],
  ["src/routes/x.js", "const datos = request.body", "warn"],
  ["src/routes/x.js", "const datos = parse(esquema, request.body)", null],
  ["src/routes/x.js", "response.send('ok')", "warn"],
  ["src/routes/x.js", "response.json({ error: error.stack })", "warn"],
  // Datos
  ["src/services/x.js", "pool.query(`SELECT * FROM jobs WHERE id = ${req.params.id}`)", "deny"],
  ["src/services/x.js", "await client.query('BEGIN')", "warn"],
  ["src/services/x.js", "DELETE FROM usuarios", "warn"],
  ["src/services/x.js", "DELETE FROM usuarios\n  WHERE id = $1", null],
  ["src/services/x.js", "const u = process.env.DATABASE_URL", "warn"],
  ["src/services/x.js", "SELECT * FROM usuarios", "info"],
  // Auth
  ["src/routes/x.js", "router.post('/jobs', auth, owner, handle(fn))", "deny"],
  ["src/routes/x.js", "router.post('/jobs', auth, owner, write, handle(fn))", null],
  ["src/routes/x.js", "router.post('/login', handle(fn))", null],
  ["src/routes/x.js", "router.get('/x', handle(fn))", "warn"],
  ["src/middleware/x.js", "if (token === esperado) return true", "warn"],
  ["src/routes/auth.js", "throw unauthorized('El correo no existe')", "warn"],
  // Migraciones
  ["migrations/0004_x.sql", "DROP TABLE usuarios;", "warn"],
  ["migrations/0004_x.sql", "-- justificacion: la tabla se reemplaza en 0005\nDROP TABLE usuarios;", null],
  ["migrations/borrador.sql", "SELECT 1;", "warn"],
  ["migrations/0004_x.sql", "SELECT 1;", null],
  // Higiene
  ["src/app.js", "console.log('depurando')", "warn"],
  ["src/server.js", "console.log('MiBeca API disponible')", null],
  ["test/a.test.js", "test.only('x', () => {})", "warn"],
  ["src/lib/x.js", "// eslint-disable-next-line no-unused-vars", "warn"],
];

let fallos = 0;

function revisar(nombre, ok, detalle) {
  if (!ok) fallos += 1;
  console.log(`${ok ? "OK  " : "FALLA"} | ${nombre}${ok ? "" : ` -> ${detalle}`}`);
}

// --- invariantes del catalogo ---
const ids = REGLAS.map((r) => r.id);
revisar("ids unicos", new Set(ids).size === ids.length, `duplicados: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
revisar(
  "areas conocidas",
  REGLAS.every((r) => AREAS.includes(r.area)),
  REGLAS.filter((r) => !AREAS.includes(r.area)).map((r) => r.id).join(","),
);
revisar(
  "severidades conocidas",
  REGLAS.every((r) => SEVERIDADES.includes(r.sev)),
  REGLAS.filter((r) => !SEVERIDADES.includes(r.sev)).map((r) => r.id).join(","),
);
const denegadas = REGLAS.filter((r) => r.sev === "deny").map((r) => r.id);
revisar("cinco reglas deny", denegadas.length === 5, denegadas.join(","));

// --- tabla canonica ---
for (const [ruta, texto, esperado] of CASOS) {
  const encontrados = [...auditPath(ruta), ...auditText({ path: ruta, text: texto })];
  const severidades = new Set(encontrados.map((f) => f.sev));
  const ok = esperado === null ? encontrados.length === 0 : severidades.has(esperado);
  revisar(
    `${ruta} :: ${JSON.stringify(texto).slice(0, 46)}`,
    ok,
    `esperado ${esperado ?? "sin hallazgos"}, obtenido ${encontrados.map((f) => `${f.id}/${f.sev}`).join(", ") || "nada"}`,
  );
}

const total = CASOS.length + 4;
console.log(`\n${total - fallos}/${total} comprobaciones correctas`);
process.exit(fallos === 0 ? 0 : 1);
