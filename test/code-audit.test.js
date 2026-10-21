import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AREAS,
  REGLAS,
  SEVERIDADES,
  auditEntries,
  auditPath,
  auditText,
  esDenegado,
  mensajeRechazo,
  pathsDeOpenapi,
  rutasDeclaradas,
  rutasSinContrato,
  tablaTexto,
} from '../.opencode/lib/code-audit-rules.js'

// El catalogo de reglas es el contrato del hook: si alguien afloja una regla
// deny o duplica un id, esta prueba lo detecta antes de llegar al PR.
// Los literales de secreto se arman en runtime para que este archivo no
// contenga credenciales con forma real (las reglas deny se aplican a si mismas).

test('el catalogo de reglas es consistente', () => {
  const ids = REGLAS.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length, 'hay ids de regla duplicados')
  for (const regla of REGLAS) {
    assert.ok(AREAS.includes(regla.area), `${regla.id}: area desconocida ${regla.area}`)
    assert.ok(SEVERIDADES.includes(regla.sev), `${regla.id}: severidad desconocida ${regla.sev}`)
    assert.ok(['linea', 'archivo', 'ruta'].includes(regla.tipo), `${regla.id}: tipo desconocido`)
    assert.ok(typeof regla.msg === 'string' && regla.msg.length > 0, `${regla.id}: falta el motivo`)
  }
})

test('solo cinco reglas pueden bloquear una escritura', () => {
  const denegadas = REGLAS.filter((r) => r.sev === 'deny').map((r) => r.id).sort()
  assert.deepEqual(denegadas, ['AUTH-01', 'DB-01', 'SEC-01', 'SEC-02', 'SEC-03'])
})

test('bloquea secretos, credenciales y SQL con datos de la peticion', () => {
  const clavePrivada = `${'-'.repeat(5)}BEGIN RSA PRIVATE KEY${'-'.repeat(5)}`
  const tokenGit = `${'gh' + 'p_'}${'a'.repeat(24)}`
  const claveAws = `${'AK' + 'IA'}1234567890ABCDEF`
  const uri = `${'postgres'}://usuario:claveSecreta123@host:5432/base`

  assert.ok(esDenegado(auditText({ path: 'src/lib/x.js', text: `const k = "${clavePrivada}"` })[0]))
  assert.ok(esDenegado(auditText({ path: 'src/lib/x.js', text: `const t = "${tokenGit}"` })[0]))
  assert.ok(esDenegado(auditText({ path: 'src/lib/x.js', text: `const a = "${claveAws}"` })[0]))
  assert.ok(esDenegado(auditText({ path: 'src/db.js', text: `const u = '${uri}'` })[0]))
  assert.ok(esDenegado(auditPath('.env')[0]))
  assert.ok(esDenegado(auditPath('secrets/credenciales.pem')[0]))
  assert.ok(
    esDenegado(
      auditText({ path: 'src/services/x.js', text: 'pool.query(`SELECT * FROM t WHERE id = ${req.params.id}`)' })[0],
    ),
  )
  assert.ok(esDenegado(auditText({ path: 'src/routes/x.js', text: "router.post('/jobs', auth, owner, handle(fn))" })[0]))
})

test('no bloquea el codigo legitimo del repositorio', () => {
  const legitimas = [
    { path: '.env.example', text: 'DATABASE_URL=postgresql://u:<clave-local>@127.0.0.1:5432/db' },
    { path: 'certs/prod-ca-2021.crt', text: `${'-'.repeat(5)}BEGIN CERTIFICATE${'-'.repeat(5)}` },
    { path: 'src/routes/x.js', text: "router.post('/jobs', auth, owner, write, handle(fn))" },
    { path: 'src/routes/x.js', text: "router.post('/login', handle(fn))" },
    { path: 'src/routes/x.js', text: "router.post('/logout', session, requireCsrf(config), handle(fn))" },
    { path: 'src/services/x.js', text: 'DELETE FROM usuarios\n  WHERE id = $1' },
    { path: 'src/services/x.js', text: 'SELECT * FROM usuarios' },
    { path: 'src/server.js', text: "console.log('MiBeca API disponible')" },
  ]
  for (const entrada of legitimas) {
    const hallazgos = [...auditPath(entrada.path), ...auditText(entrada)].filter(esDenegado)
    assert.deepEqual(hallazgos, [], `deny inesperado en ${entrada.path}: ${hallazgos.map((f) => f.id).join(', ')}`)
  }
})

test('los avisos llegan con severidad y ubicacion', () => {
  const hallazgos = auditText({ path: 'src/routes/x.js', text: "response.send('ok')" })
  assert.equal(hallazgos.length, 1)
  assert.equal(hallazgos[0].id, 'API-03')
  assert.equal(hallazgos[0].sev, 'warn')
  assert.equal(hallazgos[0].path, 'src/routes/x.js')
  assert.equal(hallazgos[0].linea, 1)
})

test('ignora rutas fuera del alcance', () => {
  const claveAws = `${'AK' + 'IA'}1234567890ABCDEF`
  assert.deepEqual(auditText({ path: 'node_modules/pkg/index.js', text: `const k = "${claveAws}"` }), [])
  assert.deepEqual(auditText({ path: '.opencode/plugin/x.js', text: "response.send('ok')" }), [])
  assert.deepEqual(auditPath('docs/notas.md'), [])
})

test('deduplica hallazgos repetidos entre entradas', () => {
  const entradas = [
    { path: 'src/routes/x.js', text: "response.send('ok')" },
    { path: 'src/routes/x.js', text: "response.send('ok')" },
  ]
  assert.equal(auditEntries(entradas).length, 1)
})

test('las migraciones destructivas exigen justificacion', () => {
  const sinJustificar = auditText({ path: 'migrations/0004_x.sql', text: 'DROP TABLE usuarios;' })
  assert.equal(sinJustificar[0].id, 'MIG-01')
  const justificada = auditText({
    path: 'migrations/0004_x.sql',
    text: '-- justificacion: la tabla se reemplaza en 0005\nDROP TABLE usuarios;',
  })
  assert.deepEqual(justificada, [])
})

test('el nombre de la migracion debe ser secuencial', () => {
  assert.equal(auditPath('migrations/0004_cierre.sql').length, 0)
  assert.equal(auditPath('migrations/borrador.sql')[0].id, 'MIG-02')
})

test('contrasta las rutas declaradas con openapi.yaml', () => {
  const texto = "router.get('/jobs', handle(fn))\nrouter.post('/jobs/:id/close', write, handle(fn))"
  assert.deepEqual(rutasDeclaradas(texto), [
    { metodo: 'GET', ruta: '/jobs' },
    { metodo: 'POST', ruta: '/jobs/{id}/close' },
  ])
  const paths = pathsDeOpenapi('paths:\n  /jobs:\n    get:\n  /jobs/{id}/close:\n    post:\n')
  assert.ok(paths.has('/jobs') && paths.has('/jobs/{id}/close'))
  const faltantes = rutasSinContrato(
    [{ archivo: 'src/routes/jobs.js', prefijo: '', texto: "router.get('/nueva', handle(fn))" }],
    paths,
  )
  assert.equal(faltantes.length, 1)
  assert.equal(faltantes[0].ruta, '/nueva')
})

test('el mensaje de rechazo explica la regla y el archivo', () => {
  const tokenGit = `${'gh' + 'p_'}${'a'.repeat(24)}`
  const [f] = auditText({ path: 'src/lib/x.js', text: `const t = "${tokenGit}"` })
  const texto = mensajeRechazo(f)
  assert.match(texto, /escritura rechazada por SEC-01/)
  assert.match(texto, /src\/lib\/x\.js:1/)
})

test('la tabla resume por severidad', () => {
  const hallazgos = auditText({ path: 'src/routes/x.js', text: "response.send('ok')" })
  assert.match(tablaTexto(hallazgos), /Total: 1 \(deny 0, warn 1, info 0\)/)
  assert.match(tablaTexto([]), /sin hallazgos/)
})
