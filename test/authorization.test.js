import { before, after, it } from 'node:test'
import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from './helpers.js'

let ctx, owner, other, student, admin

async function actor(template, suffix) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: '61001' }
  const created = await crearUsuario(ctx.pool, input, testEnv())
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}

before(async () => {
  ctx = await startTestServer(testEnv({ DB_SSL_MODE: 'disable' }))
  await resetSchema(ctx.pool)
  owner = await actor(datos.encargado, 'matrix-owner')
  other = await actor(datos.encargado, 'matrix-other')
  student = await actor(datos.becario, 'matrix-student')
  admin = await actor(datos.admin, 'matrix-admin')
})
after(async () => ctx?.close())

it('aplica matriz de roles y propiedad a rating, asistencia, evaluacion y cumplimiento', async () => {
  const created = await owner.post('/api/v1/jobs', {
    titulo: 'Matriz de permisos', descripcion: 'Actividad para probar permisos', ubicacion: 'Biblioteca',
    inicioPrevisto: new Date(Date.now() + 86400000).toISOString(),
    finPrevisto: new Date(Date.now() + 90000000).toISOString(), duracionMinutos: 60, cupos: 1,
  })
  assert.equal(created.status, 201)
  const jobId = created.body.data.id
  const applied = await student.post(`/api/v1/jobs/${jobId}/applications`, {})
  assert.equal(applied.status, 201)
  const applicationId = applied.body.data.id
  const scores = { responsabilidad: 5, puntualidad: 4, proactividad: 5, comunicacion: 4 }
  assert.equal((await ctx.get('/api/v1/me/rating')).status, 401)
  assert.equal((await student.get('/api/v1/me/rating')).status, 200)
  for (const client of [owner, other, admin]) assert.equal((await client.get('/api/v1/me/rating')).status, 403)
  assert.equal((await admin.get('/api/v1/students/compliance')).status, 200)
  for (const client of [student, owner, other]) assert.equal((await client.get('/api/v1/students/compliance')).status, 403)
  assert.equal((await ctx.get('/api/v1/students/compliance')).status, 401)
  assert.equal((await other.get(`/api/v1/jobs/${jobId}/attendance`)).status, 403)
  assert.equal((await student.get(`/api/v1/jobs/${jobId}/attendance`)).status, 403)
  assert.equal((await owner.get(`/api/v1/jobs/${jobId}/attendance`)).status, 409)
  const closeJob = client => client.post(`/api/v1/jobs/${jobId}/close`, { attendance: [] }, { 'Idempotency-Key': `matrix-${jobId}` })
  assert.equal((await ctx.post(`/api/v1/jobs/${jobId}/close`, { attendance: [] }, { 'Idempotency-Key': `matrix-${jobId}` })).status, 401)
  for (const client of [other, student, admin]) assert.equal((await closeJob(client)).status, 403)
  assert.equal((await other.post(`/api/v1/applications/${applicationId}/evaluation`, scores)).status, 403)
  assert.equal((await student.post(`/api/v1/applications/${applicationId}/evaluation`, scores)).status, 403)
  assert.equal((await admin.post(`/api/v1/applications/${applicationId}/evaluation`, scores)).status, 403)
  assert.equal((await owner.post(`/api/v1/applications/${applicationId}/evaluation`, scores)).status, 409)
  await ctx.pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [owner.id])
  assert.equal((await owner.post(`/api/v1/applications/${applicationId}/evaluation`, scores)).status, 401)
  assert.equal((await owner.get(`/api/v1/jobs/${jobId}/attendance`)).status, 401)
  assert.equal((await closeJob(owner)).status, 401)
  await ctx.pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [student.id])
  assert.equal((await student.get('/api/v1/me/rating')).status, 401)
  await ctx.pool.query('UPDATE usuarios SET activo=false WHERE id=$1', [admin.id])
  assert.equal((await admin.get('/api/v1/students/compliance')).status, 401)
})
