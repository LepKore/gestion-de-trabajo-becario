import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { datos, databaseUrl, resetSchema, startTestServer, testEnv } from './helpers.js'

// Fase 2: auth y usuarios. Cada prueba usa la API por HTTP sobre la base de
// pruebas, cuyo esquema se recrea desde las migraciones.

let ctx
let admin
let adminPassword
let becario
let becarioPassword
let encargado
let encargadoPassword

before(async () => {
  const env = testEnv()
  const url = databaseUrl()
  const pool = await startTestServer(env)
  await resetSchema(pool.pool)
  ctx = pool

  // El primer administrador se crea por servicio: la API no tiene todavía
  // ninguna cuenta con la que entrar. Es el mismo camino que create-admin.js.
  const creado = await crearUsuario(ctx.pool, datos.admin, env)
  admin = creado.usuario
  adminPassword = creado.passwordTemporal
})

after(async () => {
  await ctx?.close()
})

async function crearDesdeApi(payload) {
  return ctx.post('/api/v1/users', payload)
}

async function entrar(adminUsuario, password) {
  ctx.clearCookies()
  const response = await ctx.post('/api/v1/auth/login', {
    correo: adminUsuario.correo,
    password,
  })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return response.body.data
}

async function cambiarClaveTemporal(password) {
  const nueva = 'ClaveDefinitiva#2026'
  const response = await ctx.post('/api/v1/auth/change-password', {
    passwordActual: password,
    passwordNuevo: nueva,
    passwordNuevoConfirmacion: nueva,
  })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  return nueva
}

describe('POST /auth/login', () => {
  it('inicia sesión con credenciales válidas y emite cookie HttpOnly', async () => {
    ctx.clearCookies()
    const response = await ctx.post('/api/v1/auth/login', {
      correo: 'ADMIN@uni.edu',
      password: adminPassword,
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.data.usuario.correo, 'admin@uni.edu')
    assert.equal(response.body.data.requiereCambioPassword, true)
    assert.ok(response.body.data.csrfToken)

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('mibeca_session='))
    assert.ok(cookie, 'debe emitir la cookie de sesión')
    assert.match(cookie, /HttpOnly/)
  })

  it('no revela si el correo existe: mismo mensaje y mismo código', async () => {
    ctx.clearCookies()
    const inexistente = await ctx.post('/api/v1/auth/login', {
      correo: 'nadie@uni.edu',
      password: 'cualquiera',
    })
    const malaClave = await ctx.post('/api/v1/auth/login', {
      correo: admin.correo,
      password: 'incorrecta',
    })
    assert.equal(inexistente.status, 401)
    assert.equal(malaClave.status, 401)
    assert.deepEqual(inexistente.body, malaClave.body)
  })

  it('rechaza cuerpos inválidos con 400', async () => {
    ctx.clearCookies()
    const response = await ctx.post('/api/v1/auth/login', { correo: 'no-es-correo' })
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'validation_error')
  })
})

describe('GET /auth/me', () => {
  it('devuelve el usuario de la sesión', async () => {
    await entrar(admin, adminPassword)
    const response = await ctx.get('/api/v1/auth/me')
    assert.equal(response.status, 200)
    assert.equal(response.body.data.usuario.id, admin.id)
  })

  it('responde 401 sin cookie', async () => {
    ctx.clearCookies()
    const response = await ctx.get('/api/v1/auth/me')
    assert.equal(response.status, 401)
    assert.equal(response.body.error.code, 'unauthenticated')
  })

  it('responde 401 con cookie ajena o inválida', async () => {
    ctx.clearCookies()
    ctx.cookies.set('mibeca_session', 'token-inexistente')
    const response = await ctx.get('/api/v1/auth/me')
    assert.equal(response.status, 401)
  })
})

describe('cambio de contraseña obligatorio', () => {
  it('bloquea las rutas de negocio hasta cambiar la contraseña', async () => {
    await entrar(admin, adminPassword)
    const response = await ctx.get('/api/v1/users')
    assert.equal(response.status, 403)
    assert.match(response.body.error.message, /cambiar tu contraseña temporal/)
  })

  it('exige CSRF, contraseña actual correcta y confirmación coincidente', async () => {
    await entrar(admin, adminPassword)
    const sinCsrf = await ctx.post(
      '/api/v1/auth/change-password',
      { passwordActual: adminPassword, passwordNuevo: 'NuevaClave#2026', passwordNuevoConfirmacion: 'NuevaClave#2026' },
      { 'x-csrf-token': 'falso' },
    )
    assert.equal(sinCsrf.status, 403)

    const actualIncorrecta = await ctx.post('/api/v1/auth/change-password', {
      passwordActual: 'no-es-la-actual',
      passwordNuevo: 'NuevaClave#2026',
      passwordNuevoConfirmacion: 'NuevaClave#2026',
    })
    assert.equal(actualIncorrecta.status, 400)

    const confirmacionDistinta = await ctx.post('/api/v1/auth/change-password', {
      passwordActual: adminPassword,
      passwordNuevo: 'NuevaClave#2026',
      passwordNuevoConfirmacion: 'OtraClave#2026',
    })
    assert.equal(confirmacionDistinta.status, 400)

    const demasiadoCorta = await ctx.post('/api/v1/auth/change-password', {
      passwordActual: adminPassword,
      passwordNuevo: 'corta',
      passwordNuevoConfirmacion: 'corta',
    })
    assert.equal(demasiadoCorta.status, 400)
  })

  it('cambia la contraseña, libera el negocio y renueva la sesión', async () => {
    await entrar(admin, adminPassword)
    adminPassword = await cambiarClaveTemporal(adminPassword)
    const response = await ctx.get('/api/v1/users')
    assert.equal(response.status, 200)
    const propio = response.body.data.find((u) => u.id === admin.id)
    assert.equal(propio.requiereCambioPassword, false)
  })
})

describe('POST /auth/logout', () => {
  it('revoca la sesión y limpia la cookie', async () => {
    await entrar(admin, adminPassword)
    const response = await ctx.post('/api/v1/auth/logout')
    assert.equal(response.status, 204)
    const despues = await ctx.get('/api/v1/auth/me')
    assert.equal(despues.status, 401)
  })
})

describe('POST /users (solo ADMIN)', () => {
  before(async () => {
    await entrar(admin, adminPassword)
  })

  it('crea becario y encargado con contraseña temporal mostrada una vez', async () => {
    const creadoBecario = await crearDesdeApi(datos.becario)
    assert.equal(creadoBecario.status, 201)
    assert.match(creadoBecario.body.data.passwordTemporal, /^[A-Za-z0-9]{12}$/)
    assert.equal(creadoBecario.body.data.estudiante.codigo, '00731')
    assert.equal(creadoBecario.body.data.requiereCambioPassword, true)
    becario = creadoBecario.body.data
    becarioPassword = creadoBecario.body.data.passwordTemporal

    const creadoEncargado = await crearDesdeApi(datos.encargado)
    assert.equal(creadoEncargado.status, 201)
    assert.equal(creadoEncargado.body.data.encargado.contextoTipo, 'MATERIA')
    encargado = creadoEncargado.body.data
    encargadoPassword = creadoEncargado.body.data.passwordTemporal
  })

  it('nunca devuelve el hash de la contraseña', async () => {
    const listado = await ctx.get('/api/v1/users')
    assert.equal(listado.status, 200)
    const serializado = JSON.stringify(listado.body)
    assert.ok(!serializado.includes('passwordHash'))
    assert.ok(!serializado.includes('$argon2'))
    assert.equal(listado.body.meta.total, 3)
    assert.equal(listado.body.data.length, 3)
  })

  it('exige el perfil correspondiente al rol', async () => {
    const becarioSinPerfil = await crearDesdeApi({ nombre: 'Sin Perfil', correo: 'sin@uni.edu', rol: 'BECARIO' })
    assert.equal(becarioSinPerfil.status, 400)

    const encargadoSinContexto = await crearDesdeApi({
      nombre: 'Sin Contexto',
      correo: 'contexto@uni.edu',
      rol: 'ENCARGADO',
    })
    assert.equal(encargadoSinContexto.status, 400)
  })

  it('rechaza datos de estudiante inválidos', async () => {
    const codigoCorto = await crearDesdeApi({
      ...datos.becario,
      correo: 'corto@uni.edu',
      estudiante: { ...datos.becario.estudiante, codigo: '731' },
    })
    assert.equal(codigoCorto.status, 400)

    const semestreCero = await crearDesdeApi({
      ...datos.becario,
      correo: 'semestre@uni.edu',
      estudiante: { ...datos.becario.estudiante, semestre: 0 },
    })
    assert.equal(semestreCero.status, 400)

    const metaNoMultiploDeSeis = await crearDesdeApi({
      ...datos.becario,
      correo: 'meta@uni.edu',
      estudiante: { ...datos.becario.estudiante, metaMinutos: 121 },
    })
    assert.equal(metaNoMultiploDeSeis.status, 400)
  })

  it('rechaza correo y código duplicados con 409', async () => {
    const correoDuplicado = await crearDesdeApi({ ...datos.becario, nombre: 'Otra Ana' })
    assert.equal(correoDuplicado.status, 409)
    assert.equal(correoDuplicado.body.error.code, 'duplicate')

    const codigoDuplicado = await crearDesdeApi({
      nombre: 'Otro Estudiante',
      correo: 'otro.estudiante@uni.edu',
      rol: 'BECARIO',
      estudiante: datos.becario.estudiante,
    })
    assert.equal(codigoDuplicado.status, 409)
  })

  it('preserva los ceros iniciales del código', async () => {
    const detalle = await ctx.get(`/api/v1/users/${becario.id}`)
    assert.equal(detalle.status, 200)
    assert.equal(detalle.body.data.estudiante.codigo, '00731')
  })
})

describe('permisos por rol', () => {
  it('el becario recibe 403 en la administración de cuentas', async () => {
    await entrar(becario, becarioPassword)
    becarioPassword = await cambiarClaveTemporal(becarioPassword)
    const listado = await ctx.get('/api/v1/users')
    assert.equal(listado.status, 403)

    const creacion = await crearDesdeApi({ ...datos.encargado, correo: 'nuevo.encargado@uni.edu' })
    assert.equal(creacion.status, 403)
  })

  it('el encargado también queda fuera de la administración de cuentas', async () => {
    await entrar(encargado, encargadoPassword)
    encargadoPassword = await cambiarClaveTemporal(encargadoPassword)
    const listado = await ctx.get('/api/v1/users')
    assert.equal(listado.status, 403)
  })
})

describe('edición de usuarios', () => {
  before(async () => {
    await entrar(admin, adminPassword)
  })

  it('actualiza nombre, correo y perfil', async () => {
    const response = await ctx.patch(`/api/v1/users/${becario.id}`, {
      nombre: 'Ana Pérez López',
      estudiante: { ...datos.becario.estudiante, metaMinutos: 240 },
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.data.nombre, 'Ana Pérez López')
    assert.equal(response.body.data.estudiante.metaMinutos, 240)
  })

  it('no permite cambiar el rol', async () => {
    const response = await ctx.patch(`/api/v1/users/${becario.id}`, { rol: 'ADMIN' })
    assert.equal(response.status, 400)
    assert.match(response.body.error.message, /rol/)
  })
})

describe('desactivación, reactivación y restablecimiento', () => {
  before(async () => {
    await entrar(admin, adminPassword)
  })

  it('no permite desactivar al último administrador activo', async () => {
    const response = await ctx.post(`/api/v1/users/${admin.id}/deactivate`)
    assert.equal(response.status, 409)
    assert.equal(response.body.error.code, 'ultimo_admin_activo')
  })

  it('desactiva conservando historial y revoca las sesiones', async () => {
    const desactivado = await ctx.post(`/api/v1/users/${encargado.id}/deactivate`)
    assert.equal(desactivado.status, 200)
    assert.equal(desactivado.body.data.activo, false)

    const { rows } = await ctx.pool.query('SELECT activo FROM usuarios WHERE id = $1', [encargado.id])
    assert.equal(rows[0].activo, false, 'la baja es lógica: la fila se conserva')

    const intento = await ctx.post('/api/v1/auth/login', {
      correo: encargado.correo,
      password: encargadoPassword,
    })
    assert.equal(intento.status, 401)
  })

  it('reactivar no revive sesiones antiguas', async () => {
    // Usuario propio para esta prueba: su sesión se revoca al desactivarlo y
    // debe seguir revocada después de reactivarlo.
    const creado = await crearDesdeApi({
      nombre: 'Temporal Prueba',
      correo: 'temporal@uni.edu',
      rol: 'BECARIO',
      estudiante: { codigo: '00999', carrera: 'Matemáticas', semestre: 1, metaMinutos: 60 },
    })
    assert.equal(creado.status, 201)

    await entrar(creado.body.data, creado.body.data.passwordTemporal)
    const tokenViejo = ctx.cookies.get('mibeca_session')
    assert.ok(tokenViejo)

    await entrar(admin, adminPassword)
    await ctx.post(`/api/v1/users/${creado.body.data.id}/deactivate`)
    await ctx.post(`/api/v1/users/${creado.body.data.id}/reactivate`)

    ctx.clearCookies()
    ctx.cookies.set('mibeca_session', tokenViejo)
    const response = await ctx.get('/api/v1/auth/me')
    assert.equal(response.status, 401, 'la sesión revocada no revive al reactivar la cuenta')

    const entrada = await ctx.post('/api/v1/auth/login', {
      correo: 'temporal@uni.edu',
      password: creado.body.data.passwordTemporal,
    })
    assert.equal(entrada.status, 200, 'el usuario vuelve a entrar con su contraseña')
  })

  it('el restablecimiento revoca sesiones y entrega una temporal nueva', async () => {
    await entrar(admin, adminPassword)
    const response = await ctx.post(`/api/v1/users/${becario.id}/reset-password`)
    assert.equal(response.status, 200)
    assert.match(response.body.data.passwordTemporal, /^[A-Za-z0-9]{12}$/)

    const anterior = await ctx.post('/api/v1/auth/login', {
      correo: becario.correo,
      password: becarioPassword,
    })
    assert.equal(anterior.status, 401, 'la contraseña anterior deja de servir')

    ctx.clearCookies()
    const nuevo = await ctx.post('/api/v1/auth/login', {
      correo: becario.correo,
      password: response.body.data.passwordTemporal,
    })
    assert.equal(nuevo.status, 200)
    assert.equal(nuevo.body.data.requiereCambioPassword, true)
  })
})

describe('CORS', () => {
  it('acepta el origen configurado con credenciales y rechaza otros', async () => {
    const permitido = await ctx.get('/api/v1/auth/me', { origin: 'http://localhost:5173' })
    assert.equal(permitido.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal(permitido.headers.get('access-control-allow-credentials'), 'true')

    const ajeno = await ctx.get('/api/v1/auth/me', { origin: 'https://sitio-malicioso.example' })
    assert.equal(ajeno.headers.get('access-control-allow-origin'), null)
  })
})