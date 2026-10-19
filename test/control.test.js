import { before, after, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from './helpers.js'

let ctx, owner, other, first, second, third, admin
let counter = 0

async function actor(template, suffix, code) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: code }
  const created = await crearUsuario(ctx.pool, input, testEnv())
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}

before(async () => {
  ctx = await startTestServer(testEnv({ DB_SSL_MODE: 'disable' }))
  await resetSchema(ctx.pool)
  owner = await actor(datos.encargado, 'closeowner')
  other = await actor(datos.encargado, 'closeother')
  first = await actor(datos.becario, 'closefirst', '20101')
  second = await actor(datos.becario, 'closesecond', '20102')
  third = await actor(datos.becario, 'closethird', '20103')
  admin = await actor(datos.admin, 'closeadmin')
})

after(async () => ctx?.close())

async function createJob(minutes = 60, cupos = 3) {
  counter += 1
  const created = await owner.post('/api/v1/jobs', {
    titulo: `Trabajo de cierre ${counter}`,
    descripcion: 'Actividad para verificar el cierre',
    ubicacion: 'Biblioteca central',
    inicioPrevisto: new Date(Date.now() + 86400000).toISOString(),
    finPrevisto: new Date(Date.now() + 90000000).toISOString(),
    duracionMinutos: minutes, cupos,
  })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  return created.body.data.id
}

async function apply(student, jobId, accept = false) {
  const response = await student.post(`/api/v1/jobs/${jobId}/applications`, {})
  assert.equal(response.status, 201, JSON.stringify(response.body))
  const id = response.body.data.id
  if (accept) assert.equal((await owner.post(`/api/v1/applications/${id}/accept`, {})).status, 200)
  return id
}

async function finish(jobId) {
  await ctx.pool.query("UPDATE trabajos SET inicio_previsto=clock_timestamp()-interval '2 hours',fin_previsto=clock_timestamp()-interval '1 hour' WHERE id=$1", [jobId])
}

function close(jobId, attendance, key = `close-key-${jobId}`) {
  return owner.post(`/api/v1/jobs/${jobId}/close`, { attendance }, { 'Idempotency-Key': key })
}

it('valida lista exhaustiva, registra ausencias y rechaza pendientes en un solo cierre', async () => {
  const jobId = await createJob()
  const one = await apply(first, jobId, true)
  const two = await apply(second, jobId, true)
  const pending = await apply(third, jobId)
  const list = [{ applicationId: one, attended: true }, { applicationId: two, attended: false }]
  assert.equal((await close(jobId, list)).status, 409)
  await finish(jobId)
  for (const invalid of [
    list.slice(0, 1),
    [...list, list[0]],
    [...list, { applicationId: pending, attended: true }],
  ]) assert.equal((await close(jobId, invalid)).status, 400)
  const untouched = await ctx.pool.query('SELECT estado FROM trabajos WHERE id=$1', [jobId])
  assert.equal(untouched.rows[0].estado, 'PUBLICADO')
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM asistencias WHERE trabajo_id=$1', [jobId])).rows[0].n, 0)

  const closed = await close(jobId, list)
  assert.equal(closed.status, 200, JSON.stringify(closed.body))
  assert.equal(closed.body.data.job.estado, 'CERRADO')
  assert.deepEqual(closed.body.data.attendance.map(row => row.awardedMinutes).sort((a, b) => a - b), [0, 60])
  const rejected = await ctx.pool.query('SELECT estado,motivo_rechazo FROM postulaciones WHERE id=$1', [pending])
  assert.deepEqual(rejected.rows[0], { estado: 'RECHAZADA', motivo_rechazo: 'CIERRE_TRABAJO' })
  assert.equal((await first.get('/api/v1/me/progress')).body.data.accreditedMinutes, 60)
  assert.equal((await second.get('/api/v1/me/progress')).body.data.accreditedMinutes, 0)
  const absent = (await second.get('/api/v1/me/history')).body.data.find(row => row.applicationId === two)
  assert.equal(absent.attended, false)
  assert.equal(absent.awardedMinutes, 0)
  const ownerHistory = await owner.get('/api/v1/me/history?pageSize=1')
  assert.equal(ownerHistory.status, 200)
  assert.equal(ownerHistory.body.data[0].attendance.length, 2)
  const detail = await owner.get(`/api/v1/jobs/${jobId}/attendance`)
  assert.deepEqual(Object.keys(detail.body.data[0].student).sort(), ['career', 'code', 'name'])
})

it('reintento con clave y contenido equivalentes conserva respuesta y horas; otras claves dan conflicto', async () => {
  const jobId = await createJob()
  const one = await apply(first, jobId, true)
  const two = await apply(second, jobId, true)
  await finish(jobId)
  const list = [{ applicationId: one, attended: true }, { applicationId: two, attended: false }]
  const key = `repeat-${jobId}`
  const initial = await close(jobId, list, key)
  const repeated = await close(jobId.toUpperCase(), [...list].reverse(), key)
  assert.equal(initial.status, 200)
  assert.equal(repeated.status, 200)
  assert.deepEqual(repeated.body, initial.body)
  assert.equal((await close(jobId, [{ applicationId: one, attended: false }, list[1]], key)).status, 409)
  assert.equal((await close(jobId, list, `new-key-${jobId}`)).status, 409)
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM cierres WHERE trabajo_id=$1', [jobId])).rows[0].n, 1)
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM asistencias WHERE trabajo_id=$1', [jobId])).rows[0].n, 2)
  assert.equal((await ctx.pool.query("SELECT count(*)::int AS n FROM auditoria WHERE accion='trabajo.cerrar' AND recurso=$1", [jobId])).rows[0].n, 1)
  const anotherJob = await createJob()
  await finish(anotherJob)
  assert.equal((await close(anotherJob, [], key)).status, 409)
  assert.equal((await close(anotherJob, [], `empty-${anotherJob}`)).status, 200)
  assert.deepEqual((await owner.get(`/api/v1/jobs/${anotherJob}/attendance`)).body.data, [])
})

it('cierres concurrentes con la misma clave devuelven el mismo resultado sin duplicar', async () => {
  const jobId = await createJob()
  const applicationId = await apply(first, jobId, true)
  await finish(jobId)
  const list = [{ applicationId, attended: true }]
  const [left, right] = await Promise.all([close(jobId, list), close(jobId, list)])
  assert.deepEqual([left.status, right.status], [200, 200])
  assert.deepEqual(left.body, right.body)
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM asistencias WHERE trabajo_id=$1', [jobId])).rows[0].n, 1)
})

it('cierres concurrentes con distintas claves conceden solo un cierre', async () => {
  const jobId = await createJob()
  const applicationId = await apply(second, jobId, true)
  await finish(jobId)
  const list = [{ applicationId, attended: true }]
  const [left, right] = await Promise.all([
    close(jobId, list, `first-key-${jobId}`),
    close(jobId.toUpperCase(), list, `second-key-${jobId}`),
  ])
  assert.deepEqual([left.status, right.status].sort(), [200, 409])
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM cierres WHERE trabajo_id=$1', [jobId])).rows[0].n, 1)
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS n FROM asistencias WHERE trabajo_id=$1', [jobId])).rows[0].n, 1)
})

it('conserva asistencia de un aceptado desactivado y calcula exceso sobre la meta', async () => {
  const jobId = await createJob(120)
  const disabled = await apply(third, jobId, true)
  const credited = await apply(first, jobId, true)
  await ctx.pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [third.id])
  try {
    await finish(jobId)
    const result = await close(jobId, [{ applicationId: disabled, attended: false }, { applicationId: credited, attended: true }])
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal((await third.get('/api/v1/me/history')).status, 401)
    const detail = await owner.get(`/api/v1/jobs/${jobId}/attendance`)
    assert.ok(detail.body.data.some(row => row.applicationId === disabled && row.attended === false))
    const progress = (await first.get('/api/v1/me/progress')).body.data
    assert.equal(progress.targetMinutes, 120)
    assert.equal(progress.accreditedMinutes, 300)
    assert.equal(progress.remainingMinutes, 0)
    assert.equal(progress.excessMinutes, 180)
  } finally {
    await ctx.pool.query('UPDATE usuarios SET activo=true WHERE id=$1', [third.id])
  }
})

it('aplica rol, propiedad, CSRF y validacion de clave a las nuevas rutas', async () => {
  const jobId = await createJob()
  for (const client of [other, first, admin]) {
    assert.equal((await client.post(`/api/v1/jobs/${jobId}/close`, { attendance: [] }, { 'Idempotency-Key': 'role-check-key' })).status, 403)
    assert.equal((await client.get(`/api/v1/jobs/${jobId}/attendance`)).status, 403)
  }
  assert.equal((await owner.post(`/api/v1/jobs/${jobId}/close`, { attendance: [] }, { 'x-csrf-token': '', 'Idempotency-Key': 'csrf-check-key' })).status, 403)
  assert.equal((await owner.post(`/api/v1/jobs/${jobId}/close`, { attendance: [] })).status, 400)
  assert.equal((await owner.get(`/api/v1/jobs/${jobId}/attendance`)).status, 409)
  assert.equal((await owner.get('/api/v1/me/progress')).status, 403)
  assert.equal((await admin.get('/api/v1/me/history')).status, 403)
  assert.equal((await first.get('/api/v1/me/history?pageSize=51')).status, 400)
  const preflight = await fetch(`${ctx.baseUrl}/api/v1/jobs/${jobId}/close`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Headers': 'Idempotency-Key,X-CSRF-Token' } })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-headers'), /Idempotency-Key/)
})
