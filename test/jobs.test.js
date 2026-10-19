import { before, after, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from './helpers.js'

let ctx, owner, other, student, second, admin
const payload = (extra = {}) => ({ titulo: 'Trabajo de biblioteca', descripcion: 'Ordenar libros en biblioteca', ubicacion: 'Biblioteca central', inicioPrevisto: new Date(Date.now() + 86400000).toISOString(), finPrevisto: new Date(Date.now() + 90000000).toISOString(), duracionMinutos: 60, cupos: 1, ...extra })
async function actor(template, suffix) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: suffix === 'student' ? '10001' : '10002' }
  const created = await crearUsuario(ctx.pool, input, testEnv())
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}
before(async () => {
  const raw = process.env.TEST_DATABASE_URL
  if (!raw) throw new Error('Se exige TEST_DATABASE_URL descartable explícita')
  const url = new URL(raw)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^\/mibeca.*test/i.test(url.pathname)) throw new Error('Solo base local MiBeca de pruebas')
  ctx = await startTestServer(testEnv({ DB_SSL_MODE: 'disable' }))
  await resetSchema(ctx.pool)
  owner = await actor(datos.encargado, 'owner'); other = await actor(datos.encargado, 'other')
  student = await actor(datos.becario, 'student'); second = await actor(datos.becario, 'second'); admin = await actor(datos.admin, 'admin')
})
after(async () => ctx?.close())
async function job(extra) {
  const response = await owner.post('/api/v1/jobs', payload(extra))
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return response.body.data
}
async function apply(client, id) {
  const response = await client.post(`/api/v1/jobs/${id}/applications`, {})
  assert.equal(response.status, 201, JSON.stringify(response.body))
  return response.body.data
}
it('publica con contexto copiado y consulta paginada por los tres roles', async () => {
  const created = await job()
  assert.equal(created.contextoNombre, datos.encargado.encargado.contextoNombre)
  assert.equal(created.cuposDisponibles, 1)
  assert.equal(created.faseTemporal, 'PROXIMO')
  for (const client of [owner, student, admin]) {
    const response = await client.get('/api/v1/jobs?pageSize=1')
    assert.equal(response.status, 200); assert.equal(response.body.meta.pageSize, 1)
  }
  assert.equal((await owner.get('/api/v1/me/jobs')).body.data[0].encargadoId, owner.id)
})
it('rechaza roles, CSRF, cambio obligatorio y fechas/duración inválidas', async () => {
  assert.equal((await ctx.get('/api/v1/jobs')).status, 401)
  for (const client of [student, admin]) assert.equal((await client.post('/api/v1/jobs', payload())).status, 403)
  assert.equal((await owner.post('/api/v1/jobs', payload(), { 'x-csrf-token': '' })).status, 403)
  for (const extra of [{ inicioPrevisto: '2020-01-01T00:00:00Z' }, { inicioPrevisto: '2030-01-01T12:00:00' }, { finPrevisto: '2020-01-01T00:00:00Z' }, { duracionMinutos: 61 }, { duracionMinutos: 6.6 }, { cupos: 0 }, { encargadoId: other.id }]) assert.equal((await owner.post('/api/v1/jobs', payload(extra))).status, 400)
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=true WHERE id=$1', [other.id])
  assert.equal((await other.get('/api/v1/jobs')).status, 403)
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [other.id])
})
it('pendientes no reservan; duplicados y doble aceptación no exceden último cupo', async () => {
  const created = await job()
  const one = await apply(student, created.id), two = await apply(second, created.id)
  assert.equal((await student.post(`/api/v1/jobs/${created.id}/applications`, {})).status, 409)
  assert.equal((await owner.get(`/api/v1/jobs/${created.id}`)).body.data.cuposDisponibles, 1)
  const responses = await Promise.all([one, two].map(a => owner.post(`/api/v1/applications/${a.id}/accept`, {})))
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
  const actual = (await owner.get(`/api/v1/jobs/${created.id}`)).body.data
  assert.equal(actual.aceptados, 1); assert.equal(actual.cuposDisponibles, 0)
  assert.equal((await owner.patch(`/api/v1/jobs/${created.id}`, { titulo: 'Modificado' })).status, 409)
  const own = await student.get('/api/v1/me/applications')
  assert.equal(own.status, 200); assert.ok(own.body.data.every(a => a.estudianteId === student.id && a.trabajo))
})
it('propiedad, privacidad y decisiones irreversibles', async () => {
  const created = await job(), application = await apply(student, created.id)
  for (const client of [other, admin, student]) {
    assert.equal((await client.get(`/api/v1/jobs/${created.id}/applications`)).status, 403)
    assert.equal((await client.post(`/api/v1/applications/${application.id}/reject`, {})).status, 403)
  }
  const list = await owner.get(`/api/v1/jobs/${created.id}/applications`)
  assert.deepEqual(Object.keys(list.body.data[0].estudiante).sort(), ['carrera', 'codigo', 'nombre'])
  assert.equal((await owner.post(`/api/v1/applications/${application.id}/reject`, {})).status, 200)
  assert.equal((await owner.post(`/api/v1/applications/${application.id}/accept`, {})).status, 409)
  assert.equal((await other.patch(`/api/v1/jobs/${created.id}`, { titulo: 'Ajeno' })).status, 403)
})
it('PATCH valida campos combinados; inicio pasado y usuario inactivo impiden operaciones', async () => {
  const created = await job(), application = await apply(student, created.id)
  assert.equal((await owner.patch(`/api/v1/jobs/${created.id}`, { finPrevisto: '2020-01-01T00:00:00Z' })).status, 400)
  assert.equal((await owner.patch(`/api/v1/jobs/${created.id}`, { titulo: 'Nuevo título' })).status, 200)
  await ctx.pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [student.id])
  assert.equal((await owner.post(`/api/v1/applications/${application.id}/accept`, {})).status, 409)
  assert.equal((await student.post(`/api/v1/jobs/${created.id}/applications`, {})).status, 401)
  await ctx.pool.query('UPDATE usuarios SET activo=true WHERE id=$1', [student.id])
  await ctx.pool.query("UPDATE trabajos SET inicio_previsto=now()-interval '1 hour', fin_previsto=now()+interval '1 hour' WHERE id=$1", [created.id])
  assert.equal((await owner.post(`/api/v1/applications/${application.id}/accept`, {})).status, 409)
  assert.equal((await second.post(`/api/v1/jobs/${created.id}/applications`, {})).status, 409)
  assert.equal((await owner.patch(`/api/v1/jobs/${created.id}`, { titulo: 'Tarde' })).status, 409)
})
it('edición y aceptación simultáneas se serializan y fijan las condiciones aceptadas', async () => {
  const created = await job(), application = await apply(student, created.id)
  const [edit, accept] = await Promise.all([
    owner.patch(`/api/v1/jobs/${created.id}`, { duracionMinutos: 120 }),
    owner.post(`/api/v1/applications/${application.id}/accept`, {}),
  ])
  assert.equal(accept.status, 200)
  assert.ok([200, 409].includes(edit.status))
  const final = (await owner.get(`/api/v1/jobs/${created.id}`)).body.data
  assert.equal(final.duracionMinutos, edit.status === 200 ? 120 : 60)
  assert.equal((await owner.patch(`/api/v1/jobs/${created.id}`, { duracionMinutos: 180 })).status, 409)
})
async function waitForJobLock() {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const result = await ctx.pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM trabajos WHERE id=%' LIMIT 1")
    if (result.rowCount) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('La operación no llegó al bloqueo del trabajo')
}
it('relee el reloj tras esperar el bloqueo, sin aceptar después del inicio', async () => {
  const created = await job(), application = await apply(student, created.id)
  const blocker = await ctx.pool.connect()
  let pending
  try {
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM trabajos WHERE id=$1 FOR UPDATE', [created.id])
    pending = owner.post(`/api/v1/applications/${application.id}/accept`, {})
    await waitForJobLock()
    // Cambia la fecha mientras la aceptación espera: debe leer la fila y el
    // reloj actualizados después de adquirir el bloqueo, nunca los anteriores.
    await blocker.query("UPDATE trabajos SET inicio_previsto=clock_timestamp()-interval '1 second' WHERE id=$1", [created.id])
    await blocker.query('COMMIT')
    assert.equal((await pending).status, 409)
    assert.equal((await owner.get(`/api/v1/jobs/${created.id}`)).body.data.aceptados, 0)
  } finally {
    await blocker.query('ROLLBACK'); blocker.release()
    await pending
  }
})
it('relee actividad tras el bloqueo y conserva el contexto original', async () => {
  const created = await job(), application = await apply(student, created.id)
  const blocker = await ctx.pool.connect()
  let pending
  try {
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM trabajos WHERE id=$1 FOR UPDATE', [created.id])
    pending = owner.post(`/api/v1/applications/${application.id}/accept`, {})
    await waitForJobLock()
    await blocker.query('UPDATE usuarios SET activo=false WHERE id=$1', [student.id])
    await blocker.query('COMMIT')
    assert.equal((await pending).status, 409)
    await ctx.pool.query('UPDATE encargados SET contexto_nombre=$2 WHERE usuario_id=$1', [owner.id, 'Contexto actualizado'])
    assert.equal((await owner.get(`/api/v1/jobs/${created.id}`)).body.data.contextoNombre, created.contextoNombre)
  } finally {
    await blocker.query('ROLLBACK'); blocker.release()
    await pending
    await ctx.pool.query('UPDATE usuarios SET activo=true WHERE id=$1', [student.id])
  }
})
