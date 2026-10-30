import { before, after, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from './helpers.js'

let ctx, owner, other, student, admin
let sequence = 0

async function actor(template, suffix) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: '41001' }
  const created = await crearUsuario(ctx.pool, input, testEnv())
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}

before(async () => {
  ctx = await startTestServer(testEnv({ DB_SSL_MODE: 'disable' }))
  await resetSchema(ctx.pool)
  owner = await actor(datos.encargado, 'evaluation-owner')
  other = await actor(datos.encargado, 'evaluation-other')
  student = await actor(datos.becario, 'evaluation-student')
  admin = await actor(datos.admin, 'evaluation-admin')
})
after(async () => ctx?.close())

async function application({ accepted = true, attended = null } = {}) {
  sequence += 1
  const job = await owner.post('/api/v1/jobs', {
    titulo: `Evaluacion ${sequence}`, descripcion: 'Trabajo para evaluar asistencia', ubicacion: 'Biblioteca',
    inicioPrevisto: new Date(Date.now() + 86400000).toISOString(),
    finPrevisto: new Date(Date.now() + 90000000).toISOString(), duracionMinutos: 60, cupos: 1,
  })
  assert.equal(job.status, 201, JSON.stringify(job.body))
  const jobId = job.body.data.id
  const applied = await student.post(`/api/v1/jobs/${jobId}/applications`, {})
  assert.equal(applied.status, 201, JSON.stringify(applied.body))
  const applicationId = applied.body.data.id
  if (accepted) assert.equal((await owner.post(`/api/v1/applications/${applicationId}/accept`, {})).status, 200)
  if (attended !== null) {
    await ctx.pool.query("UPDATE trabajos SET inicio_previsto=clock_timestamp()-interval '2 hours', fin_previsto=clock_timestamp()-interval '1 hour' WHERE id=$1", [jobId])
    const closed = await owner.post(`/api/v1/jobs/${jobId}/close`, {
      attendance: accepted ? [{ applicationId, attended }] : [],
    }, { 'Idempotency-Key': `evaluation-${jobId}` })
    assert.equal(closed.status, 200, JSON.stringify(closed.body))
  }
  return applicationId
}

const scores = { responsabilidad: 5, puntualidad: 4, proactividad: 5, comunicacion: 4 }

it('solo el propietario puede evaluar una postulacion aceptada con asistencia confirmada', async () => {
  const open = await application()
  assert.equal((await owner.post(`/api/v1/applications/${open}/evaluation`, scores)).status, 409)
  const pending = await application({ accepted: false })
  assert.equal((await owner.post(`/api/v1/applications/${pending}/evaluation`, scores)).status, 409)
  const absent = await application({ attended: false })
  assert.equal((await owner.post(`/api/v1/applications/${absent}/evaluation`, scores)).status, 409)
  const attended = await application({ attended: true })
  for (const client of [other, student, admin]) {
    assert.equal((await client.post(`/api/v1/applications/${attended}/evaluation`, scores)).status, 403)
  }
  assert.equal((await ctx.post(`/api/v1/applications/${attended}/evaluation`, scores)).status, 401)
  const before = (await student.get('/api/v1/me/progress')).body.data
  const created = await owner.post(`/api/v1/applications/${attended}/evaluation`, scores)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.deepEqual(Object.keys(created.body.data).sort(), [
    'id', 'postulacionId', 'responsabilidad', 'puntualidad', 'proactividad', 'comunicacion', 'promedio', 'creadoEn',
  ].sort())
  assert.equal(created.body.data.promedio, 4.5)
  assert.deepEqual((await student.get('/api/v1/me/progress')).body.data, before)
  assert.equal((await owner.post(`/api/v1/applications/${attended}/evaluation`, scores)).status, 409)
  assert.equal((await owner.patch(`/api/v1/applications/${attended}/evaluation`, scores)).status, 404)
  const deleted = await fetch(`${ctx.baseUrl}/api/v1/applications/${attended}/evaluation`, { method: 'DELETE' })
  assert.equal(deleted.status, 404)
  const rows = await ctx.pool.query('SELECT count(*)::int AS total FROM evaluaciones WHERE postulacion_id=$1', [attended])
  assert.equal(rows.rows[0].total, 1)
})

it('rechaza criterios fuera de 1 a 5 sin crear evaluaciones', async () => {
  const id = await application({ attended: true })
  for (const value of [0, 6, 3.5, '5']) {
    assert.equal((await owner.post(`/api/v1/applications/${id}/evaluation`, { ...scores, responsabilidad: value })).status, 400)
  }
  assert.equal((await ctx.pool.query('SELECT count(*)::int AS total FROM evaluaciones WHERE postulacion_id=$1', [id])).rows[0].total, 0)
  assert.equal((await owner.post('/api/v1/applications/00000000-0000-4000-8000-000000000000/evaluation', scores)).status, 404)
})
