import { before, after, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from './helpers.js'

let ctx, admin, owner, student

async function actor(template, suffix) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: '51001' }
  const created = await crearUsuario(ctx.pool, input, testEnv())
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}

before(async () => {
  ctx = await startTestServer(testEnv({ DB_SSL_MODE: 'disable' }))
  await resetSchema(ctx.pool)
  admin = await actor(datos.admin, 'compliance-admin')
  owner = await actor(datos.encargado, 'compliance-owner')
  student = await actor(datos.becario, 'compliance-student')
})
after(async () => ctx?.close())

it('entrega cumplimiento institucional en una respuesta solo a ADMIN y sin calificaciones', async () => {
  assert.equal((await ctx.get('/api/v1/students/compliance')).status, 401)
  assert.equal((await owner.get('/api/v1/students/compliance')).status, 403)
  assert.equal((await student.get('/api/v1/students/compliance')).status, 403)
  const response = await admin.get('/api/v1/students/compliance')
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(response.body.data.length, 1)
  assert.deepEqual(response.body.data[0], {
    id: student.id, name: datos.becario.nombre, code: '51001',
    targetMinutes: 120, accreditedMinutes: 0, remainingMinutes: 120, completed: false,
  })
  assert.equal(JSON.stringify(response.body).includes('rating'), false)
  assert.equal(JSON.stringify(response.body).includes('evaluacion'), false)

  const job = await owner.post('/api/v1/jobs', {
    titulo: 'Cumplimiento evaluado', descripcion: 'Actividad para comprobar horas', ubicacion: 'Biblioteca',
    inicioPrevisto: new Date(Date.now() + 86400000).toISOString(),
    finPrevisto: new Date(Date.now() + 90000000).toISOString(), duracionMinutos: 60, cupos: 1,
  })
  assert.equal(job.status, 201)
  const jobId = job.body.data.id
  const applied = await student.post(`/api/v1/jobs/${jobId}/applications`, {})
  const applicationId = applied.body.data.id
  assert.equal((await owner.post(`/api/v1/applications/${applicationId}/accept`, {})).status, 200)
  await ctx.pool.query("UPDATE trabajos SET inicio_previsto=clock_timestamp()-interval '2 hours',fin_previsto=clock_timestamp()-interval '1 hour' WHERE id=$1", [jobId])
  assert.equal((await owner.post(`/api/v1/jobs/${jobId}/close`, {
    attendance: [{ applicationId, attended: true }],
  }, { 'Idempotency-Key': `compliance-${jobId}` })).status, 200)
  const beforeRating = (await admin.get('/api/v1/students/compliance')).body
  assert.equal(beforeRating.data[0].accreditedMinutes, 60)
  assert.equal(beforeRating.data[0].completed, false)
  assert.equal((await owner.post(`/api/v1/applications/${applicationId}/evaluation`, {
    responsabilidad: 5, puntualidad: 4, proactividad: 5, comunicacion: 4,
  })).status, 201)
  assert.deepEqual((await admin.get('/api/v1/students/compliance')).body, beforeRating)
  const ownerHistory = await owner.get('/api/v1/me/history')
  const saved = ownerHistory.body.data.flatMap(row => row.attendance).find(row => row.applicationId === applicationId).evaluation
  assert.equal(saved.promedio, 4.5)
  for (const response of [
    await student.get('/api/v1/me/progress'),
    await student.get('/api/v1/me/history'),
    await admin.get(`/api/v1/students/${student.id}/history`),
  ]) {
    assert.equal(response.status, 200)
    assert.doesNotMatch(JSON.stringify(response.body), /"(?:evaluation|promedio|responsabilidad|puntualidad|proactividad|comunicacion|rating)"/)
  }
})
