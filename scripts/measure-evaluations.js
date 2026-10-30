import assert from 'node:assert/strict'
import { crearUsuario } from '../src/services/users.js'
import { createClient, datos, resetSchema, startTestServer, testEnv } from '../test/helpers.js'

const env = testEnv({ DB_SSL_MODE: 'disable' })
const ctx = await startTestServer(env)

async function actor(template, suffix, code) {
  const input = { ...template, correo: `${suffix}@uni.edu` }
  if (input.estudiante) input.estudiante = { ...input.estudiante, codigo: code }
  const created = await crearUsuario(ctx.pool, input, env)
  await ctx.pool.query('UPDATE usuarios SET requiere_cambio_password=false WHERE id=$1', [created.usuario.id])
  const client = createClient(ctx.baseUrl)
  assert.equal((await client.post('/api/v1/auth/login', { correo: input.correo, password: created.passwordTemporal })).status, 200)
  return { ...client, id: created.usuario.id }
}

function p95(samples) {
  const ordered = [...samples].sort((a, b) => a - b)
  return Math.round(ordered[Math.ceil(ordered.length * 0.95) - 1] * 100) / 100
}

async function sample(count, request) {
  const times = []
  for (let index = 0; index < count; index += 1) {
    const start = performance.now()
    const response = await request(index)
    times.push(performance.now() - start)
    assert.equal(response.status, 200, JSON.stringify(response.body))
  }
  return p95(times)
}

try {
  await resetSchema(ctx.pool)
  const owner = await actor(datos.encargado, 'perf-owner')
  const students = []
  for (let index = 0; index < 10; index += 1) students.push(await actor(datos.becario, `perf-student-${index}`, String(71000 + index)))
  const jobs = await ctx.pool.query(`INSERT INTO trabajos(encargado_id,titulo,descripcion,ubicacion,contexto_tipo,contexto_nombre,inicio_previsto,fin_previsto,duracion_minutos,cupos)
    SELECT $1,'Trabajo de medicion '||n,'Actividad de medicion','Biblioteca','MATERIA','Medicion',now()-interval '2 hours',now()-interval '1 hour',60,10
    FROM generate_series(1,100) AS n RETURNING id`, [owner.id])
  const ids = jobs.rows.map(row => row.id)
  const studentIds = students.map(student => student.id)
  const applications = await ctx.pool.query(`INSERT INTO postulaciones(trabajo_id,estudiante_id,estado)
    SELECT j.id,s.id,'ACEPTADA' FROM unnest($1::uuid[]) AS j(id) CROSS JOIN unnest($2::uuid[]) AS s(id)
    RETURNING id,trabajo_id,estudiante_id`, [ids, studentIds])
  for (const [index, jobId] of ids.slice(0, 20).entries()) {
    await ctx.pool.query("UPDATE trabajos SET estado='CERRADO' WHERE id=$1", [jobId])
    await ctx.pool.query(`INSERT INTO cierres(trabajo_id,encargado_id,idempotency_key,request_hash,respuesta,cerrado_en)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp())`, [jobId, owner.id, `performance-${index}`, '0'.repeat(64)])
    const application = applications.rows.find(row => row.trabajo_id === jobId && row.estudiante_id === students[0].id)
    await ctx.pool.query(`INSERT INTO asistencias(postulacion_id,trabajo_id,asistio,minutos_acreditados,registrado_por,registrado_en)
      VALUES($1,$2,true,60,$3,clock_timestamp())`, [application.id, jobId, owner.id])
  }
  const jobsP95 = await sample(20, () => students[0].get('/api/v1/jobs?pageSize=20'))
  const progressP95 = await sample(20, () => students[0].get('/api/v1/me/progress'))
  const evaluationTimes = []
  for (const jobId of ids.slice(0, 20)) {
    const application = applications.rows.find(row => row.trabajo_id === jobId && row.estudiante_id === students[0].id)
    const start = performance.now()
    const response = await owner.post(`/api/v1/applications/${application.id}/evaluation`, {
      responsabilidad: 5, puntualidad: 4, proactividad: 5, comunicacion: 4,
    })
    evaluationTimes.push(performance.now() - start)
    assert.equal(response.status, 201, JSON.stringify(response.body))
  }
  process.stdout.write(JSON.stringify({ jobs: ids.length, applications: applications.rowCount, requestsPerEndpoint: 20,
    jobsP95Ms: jobsP95, progressP95Ms: progressP95, evaluationP95Ms: p95(evaluationTimes) }, null, 2) + '\n')
} finally {
  await ctx.close()
}
