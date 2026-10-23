import { badRequest, conflict, forbidden, fromDatabaseError, notFound } from '../lib/errors.js'

const selectJob = `SELECT t.*, u.nombre AS encargado_nombre,
  (SELECT count(*)::int FROM postulaciones p WHERE p.trabajo_id=t.id AND p.estado='ACEPTADA') AS aceptados
  FROM trabajos t JOIN usuarios u ON u.id=t.encargado_id`
function jobView(row) {
  const now = Date.now()
  return { id: row.id, encargadoId: row.encargado_id, encargadoNombre: row.encargado_nombre,
    titulo: row.titulo, descripcion: row.descripcion, ubicacion: row.ubicacion,
    contextoTipo: row.contexto_tipo, contextoNombre: row.contexto_nombre,
    inicioPrevisto: row.inicio_previsto, finPrevisto: row.fin_previsto,
    duracionMinutos: row.duracion_minutos, cupos: row.cupos, estado: row.estado,
    faseTemporal: row.estado === 'CERRADO' ? 'CERRADO' : now < +row.inicio_previsto ? 'PROXIMO' : now < +row.fin_previsto ? 'EN_CURSO' : 'FINALIZADO',
    aceptados: row.aceptados, cuposDisponibles: row.cupos - row.aceptados,
    creadoEn: row.creado_en, actualizadoEn: row.actualizado_en }
}
function applicationView(row) {
  return { id: row.id, trabajoId: row.trabajo_id, estudianteId: row.estudiante_id, estado: row.estado, creadoEn: row.creado_en, actualizadoEn: row.actualizado_en }
}
function pageResult(data, total, filters) {
  return { data, meta: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) } }
}
async function transaction(pool, run) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw fromDatabaseError(error) ?? error
  } finally { client.release() }
}
// Work first, then users in UUID order. Shared user locks serialize against
// deactivation without blocking other job operations by the same account.
async function activeUsers(client, ids, actorId) {
  const { rows } = await client.query('SELECT id, activo, requiere_cambio_password FROM usuarios WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [ids])
  for (const id of ids) {
    const row = rows.find(r => r.id === id)
    if (!row?.activo) throw conflict('usuario_inactivo', 'La cuenta debe estar activa.')
    if (id === actorId && row.requiere_cambio_password) throw forbidden('Debes cambiar tu contraseña temporal.')
  }
}
async function lockJob(client, id) {
  const { rows } = await client.query('SELECT id,encargado_id,titulo,estado,inicio_previsto,duracion_minutos,cupos FROM trabajos WHERE id=$1 FOR UPDATE', [id])
  if (!rows[0]) throw notFound('Trabajo no encontrado.')
  return rows[0]
}
function ownerOnly(job, actorId) {
  if (job.encargado_id !== actorId) throw forbidden('Solo el encargado propietario puede realizar esta operación.')
}
async function notStarted(client, job) {
  const { rows } = await client.query('SELECT clock_timestamp() AS ahora')
  if (job.estado !== 'PUBLICADO' || +job.inicio_previsto <= +rows[0].ahora) throw conflict('trabajo_no_disponible', 'El trabajo ya comenzó o está cerrado.')
}
async function validateTimes(client, data) {
  const { rows } = await client.query('SELECT clock_timestamp() AS ahora')
  if (+new Date(data.inicioPrevisto) <= +rows[0].ahora) throw badRequest('El inicio debe ser futuro.')
  if (+new Date(data.finPrevisto) <= +new Date(data.inicioPrevisto)) throw badRequest('El fin debe ser posterior al inicio.')
}
async function available(client, job) {
  const { rows } = await client.query("SELECT count(*)::int AS total FROM postulaciones WHERE trabajo_id=$1 AND estado='ACEPTADA'", [job.id])
  if (rows[0].total >= job.cupos) throw conflict('sin_cupo', 'No quedan cupos disponibles.')
}
export async function getJob(pool, id) {
  const { rows } = await pool.query(`${selectJob} WHERE t.id=$1`, [id])
  if (!rows[0]) throw notFound('Trabajo no encontrado.')
  return jobView(rows[0])
}
export async function listJobs(pool, filters, ownerId = null) {
  const where = 'WHERE ($1::text IS NULL OR t.estado=$1) AND ($2::text IS NULL OR t.titulo ILIKE $2 OR t.descripcion ILIKE $2) AND ($3::uuid IS NULL OR t.encargado_id=$3)'
  const values = [filters.estado ?? null, filters.q ? `%${filters.q}%` : null, ownerId]
  const total = await pool.query(`SELECT count(*)::int AS total FROM trabajos t ${where}`, values)
  const { rows } = await pool.query(`${selectJob} ${where} ORDER BY t.inicio_previsto,t.id LIMIT $4 OFFSET $5`, [...values, filters.pageSize, (filters.page - 1) * filters.pageSize])
  return pageResult(rows.map(jobView), total.rows[0].total, filters)
}
export async function createJob(pool, data, actorId) {
  return transaction(pool, async client => {
    await activeUsers(client, [actorId], actorId)
    const { rows: profiles } = await client.query('SELECT contexto_tipo,contexto_nombre FROM encargados WHERE usuario_id=$1 FOR SHARE', [actorId])
    if (!profiles[0]) throw forbidden('Se requiere perfil de encargado.')
    await validateTimes(client, data)
    const { rows } = await client.query(`INSERT INTO trabajos(encargado_id,titulo,descripcion,ubicacion,inicio_previsto,fin_previsto,duracion_minutos,cupos,contexto_tipo,contexto_nombre)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [actorId,data.titulo,data.descripcion,data.ubicacion,data.inicioPrevisto,data.finPrevisto,data.duracionMinutos,data.cupos,profiles[0].contexto_tipo,profiles[0].contexto_nombre])
    return getJob(client, rows[0].id)
  })
}
export async function editJob(pool, id, changes, actorId) {
  return transaction(pool, async client => {
    const job = await lockJob(client, id)
    ownerOnly(job, actorId)
    await activeUsers(client, [actorId], actorId)
    await notStarted(client, job)
    const current = await getJob(client, id)
    if (current.aceptados) throw conflict('trabajo_fijo', 'El trabajo tiene aceptaciones y sus condiciones son fijas.')
    const data = { ...current, ...changes }
    await validateTimes(client, data)
    await client.query(`UPDATE trabajos SET titulo=$2,descripcion=$3,ubicacion=$4,inicio_previsto=$5,fin_previsto=$6,duracion_minutos=$7,cupos=$8,actualizado_en=clock_timestamp() WHERE id=$1`, [id,data.titulo,data.descripcion,data.ubicacion,data.inicioPrevisto,data.finPrevisto,data.duracionMinutos,data.cupos])
    return getJob(client, id)
  })
}
export async function applyJob(pool, id, actorId) {
  return transaction(pool, async client => {
    const job = await lockJob(client, id)
    await activeUsers(client, [actorId], actorId)
    await notStarted(client, job)
    await available(client, job)
    const { rows } = await client.query('INSERT INTO postulaciones(trabajo_id,estudiante_id) VALUES($1,$2) RETURNING *', [id,actorId])
    return applicationView(rows[0])
  })
}
export async function decideApplication(pool, id, actorId, state) {
  return transaction(pool, async client => {
    const lookup = await client.query('SELECT trabajo_id FROM postulaciones WHERE id=$1', [id])
    if (!lookup.rows[0]) throw notFound('Postulación no encontrada.')
    const job = await lockJob(client, lookup.rows[0].trabajo_id)
    ownerOnly(job, actorId)
    const { rows } = await client.query('SELECT id,trabajo_id,estudiante_id,estado,creado_en,actualizado_en FROM postulaciones WHERE id=$1 FOR UPDATE', [id])
    const application = rows[0]
    await activeUsers(client, state === 'ACEPTADA' ? [actorId, application.estudiante_id] : [actorId], actorId)
    await notStarted(client, job)
    if (application.estado !== 'PENDIENTE') throw conflict('postulacion_resuelta', 'La decisión de esta postulación ya fue registrada.')
    if (state === 'ACEPTADA') await available(client, job)
    const updated = await client.query('UPDATE postulaciones SET estado=$2,actualizado_en=clock_timestamp() WHERE id=$1 RETURNING id,trabajo_id,estudiante_id,estado,creado_en,actualizado_en', [id,state])
    return applicationView(updated.rows[0])
  })
}
export async function listApplications(pool, filters, { jobId = null, actorId }) {
  if (jobId) {
    const job = await pool.query('SELECT encargado_id FROM trabajos WHERE id=$1', [jobId])
    if (!job.rows[0]) throw notFound('Trabajo no encontrado.')
    ownerOnly(job.rows[0], actorId)
  }
  const where = 'WHERE ($1::uuid IS NULL OR p.trabajo_id=$1) AND ($2::uuid IS NULL OR p.estudiante_id=$2) AND ($3::text IS NULL OR p.estado=$3)'
  const values = [jobId, jobId ? null : actorId, filters.estado ?? null]
  const count = await pool.query(`SELECT count(*)::int AS total FROM postulaciones p ${where}`, values)
  const { rows } = await pool.query(`SELECT p.*,u.nombre,e.codigo,e.carrera,e.semestre,e.meta_minutos,
    (SELECT COALESCE(sum(a.minutos_acreditados),0)::bigint FROM postulaciones previa LEFT JOIN asistencias a ON a.postulacion_id=previa.id WHERE previa.estudiante_id=p.estudiante_id) AS acreditados
    FROM postulaciones p JOIN estudiantes e ON e.usuario_id=p.estudiante_id JOIN usuarios u ON u.id=p.estudiante_id ${where} ORDER BY p.creado_en,p.id LIMIT $4 OFFSET $5`, [...values,filters.pageSize,(filters.page-1)*filters.pageSize])
  // Fetch the page's jobs in one query rather than one query per application.
  const jobs = new Map()
  if (!jobId && rows.length) {
    const result = await pool.query(`${selectJob} WHERE t.id=ANY($1::uuid[])`, [rows.map(row => row.trabajo_id)])
    for (const row of result.rows) jobs.set(row.id, jobView(row))
  }
  const data = rows.map(row => ({
    ...applicationView(row),
    ...(jobId
      ? { estudiante: { nombre: row.nombre, codigo: row.codigo, carrera: row.carrera, semester: row.semestre, targetMinutes: row.meta_minutos, accreditedMinutes: Number(row.acreditados), remainingMinutes: Math.max(row.meta_minutos - Number(row.acreditados), 0) } }
      : { trabajo: jobs.get(row.trabajo_id) }),
  }))
  return pageResult(data, count.rows[0].total, filters)
}
