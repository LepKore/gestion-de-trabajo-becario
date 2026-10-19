import { createHash } from 'node:crypto'
import { badRequest, conflict, forbidden, fromDatabaseError, notFound } from '../lib/errors.js'
import { getJob } from './jobs.js'
import { auditar } from './users.js'

function pageResult(data, total, { page, pageSize }) {
  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
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
  } finally {
    client.release()
  }
}

function sortedAttendance(attendance) {
  return [...attendance].sort((left, right) => left.applicationId.localeCompare(right.applicationId, 'en'))
}

function requestHash(attendance) {
  return createHash('sha256').update(JSON.stringify(sortedAttendance(attendance))).digest('hex')
}

function assertOwner(job, actorId) {
  if (job.encargado_id !== actorId) throw forbidden('Solo el encargado propietario puede consultar o cerrar este trabajo.')
}

async function getOwnedJob(pool, jobId, actorId, forUpdate = false) {
  const { rows } = await pool.query(`SELECT * FROM trabajos WHERE id=$1${forUpdate ? ' FOR UPDATE' : ''}`, [jobId])
  if (!rows[0]) throw notFound('Trabajo no encontrado.')
  assertOwner(rows[0], actorId)
  return rows[0]
}

export async function closeJob(pool, jobId, actorId, idempotencyKey, attendance) {
  const ordered = sortedAttendance(attendance)
  const hash = requestHash(ordered)
  return transaction(pool, async client => {
    const job = await getOwnedJob(client, jobId, actorId, true)
    // El bloqueo de trabajo precede al de usuario, como en las decisiones de
    // postulaciones; releemos actividad despues de esperar por otro cierre.
    const actor = await client.query('SELECT activo,requiere_cambio_password FROM usuarios WHERE id=$1 FOR SHARE', [actorId])
    if (!actor.rows[0]?.activo) throw conflict('usuario_inactivo', 'La cuenta debe estar activa.')
    if (actor.rows[0].requiere_cambio_password) throw forbidden('Debes cambiar tu contrasena temporal.')

    const previous = await client.query('SELECT trabajo_id,request_hash,respuesta FROM cierres WHERE encargado_id=$1 AND idempotency_key=$2', [actorId, idempotencyKey])
    if (previous.rows[0]) {
      if (previous.rows[0].trabajo_id !== jobId || previous.rows[0].request_hash !== hash) {
        throw conflict('idempotency_key_conflict', 'La clave de idempotencia ya se uso con otro cierre o contenido.')
      }
      return previous.rows[0].respuesta
    }
    if (job.estado !== 'PUBLICADO') throw conflict('trabajo_cerrado', 'El trabajo ya fue cerrado.')
    const clock = await client.query('SELECT clock_timestamp() AS ahora')
    const closedAt = clock.rows[0].ahora
    if (+job.fin_previsto > +closedAt) throw conflict('cierre_temprano', 'El trabajo aun no alcanza su fin previsto.')

    const accepted = await client.query("SELECT id FROM postulaciones WHERE trabajo_id=$1 AND estado='ACEPTADA' ORDER BY id", [jobId])
    const acceptedIds = new Set(accepted.rows.map(row => row.id))
    if (ordered.length !== acceptedIds.size || ordered.some(entry => !acceptedIds.has(entry.applicationId))) {
      throw badRequest('La asistencia debe incluir exactamente todas las postulaciones aceptadas, sin agregar otras.')
    }

    await client.query("UPDATE postulaciones SET estado='RECHAZADA',motivo_rechazo='CIERRE_TRABAJO',actualizado_en=$2 WHERE trabajo_id=$1 AND estado='PENDIENTE'", [jobId, closedAt])
    await client.query("UPDATE trabajos SET estado='CERRADO',actualizado_en=$2 WHERE id=$1", [jobId, closedAt])
    const resultAttendance = ordered.map(entry => ({ applicationId: entry.applicationId, attended: entry.attended, awardedMinutes: entry.attended ? job.duracion_minutos : 0 }))
    const response = { data: { job: await getJob(client, jobId), attendance: resultAttendance, closedAt } }
    await client.query('INSERT INTO cierres(trabajo_id,encargado_id,idempotency_key,request_hash,respuesta,cerrado_en) VALUES($1,$2,$3,$4,$5,$6)', [jobId, actorId, idempotencyKey, hash, JSON.stringify(response), closedAt])
    for (const entry of resultAttendance) {
      await client.query('INSERT INTO asistencias(postulacion_id,trabajo_id,asistio,minutos_acreditados,registrado_por,registrado_en) VALUES($1,$2,$3,$4,$5,$6)', [entry.applicationId, jobId, entry.attended, entry.awardedMinutes, actorId, closedAt])
    }
    await auditar(client, { actorId, accion: 'trabajo.cerrar', recurso: jobId, detalle: { asistentes: resultAttendance.filter(entry => entry.attended).length, ausentes: resultAttendance.filter(entry => !entry.attended).length } })
    return response
  })
}

export async function getProgress(pool, studentId) {
  const { rows } = await pool.query(`SELECT e.meta_minutos AS target_minutes,
      COALESCE(sum(a.minutos_acreditados),0)::bigint AS accredited_minutes
    FROM estudiantes e
    LEFT JOIN postulaciones p ON p.estudiante_id=e.usuario_id
    LEFT JOIN asistencias a ON a.postulacion_id=p.id
    WHERE e.usuario_id=$1 GROUP BY e.usuario_id,e.meta_minutos`, [studentId])
  if (!rows[0]) throw notFound('Perfil de estudiante no encontrado.')
  const targetMinutes = rows[0].target_minutes
  const accreditedMinutes = Number(rows[0].accredited_minutes)
  return { targetMinutes, accreditedMinutes,
    remainingMinutes: Math.max(targetMinutes - accreditedMinutes, 0),
    excessMinutes: Math.max(accreditedMinutes - targetMinutes, 0) }
}

export async function getOwnerDashboard(pool, ownerId) {
  const { rows } = await pool.query(`SELECT
      count(*)::int AS total_jobs,
      count(*) FILTER (WHERE t.estado='PUBLICADO')::int AS published_jobs,
      count(*) FILTER (WHERE t.estado='CERRADO')::int AS closed_jobs,
      count(*) FILTER (WHERE t.estado='PUBLICADO' AND t.fin_previsto <= clock_timestamp())::int AS pending_close_jobs,
      COALESCE(sum(stats.pending_applications),0)::int AS pending_applications,
      COALESCE(sum(stats.accepted_students),0)::int AS accepted_students
    FROM trabajos t
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE p.estado='PENDIENTE')::int AS pending_applications,
        count(*) FILTER (WHERE p.estado='ACEPTADA')::int AS accepted_students
      FROM postulaciones p WHERE p.trabajo_id=t.id
    ) stats ON true
    WHERE t.encargado_id=$1`, [ownerId])
  const row = rows[0]
  return {
    totalJobs: row.total_jobs,
    publishedJobs: row.published_jobs,
    closedJobs: row.closed_jobs,
    pendingCloseJobs: row.pending_close_jobs,
    pendingApplications: row.pending_applications,
    acceptedStudents: row.accepted_students,
  }
}

export async function getStudentHistory(pool, studentId, filters) {
  const count = await pool.query('SELECT count(*)::int AS total FROM postulaciones WHERE estudiante_id=$1', [studentId])
  const { rows } = await pool.query(`SELECT p.id,p.estado,p.trabajo_id,a.asistio,a.minutos_acreditados
    FROM postulaciones p LEFT JOIN asistencias a ON a.postulacion_id=p.id
    WHERE p.estudiante_id=$1 ORDER BY p.creado_en DESC,p.id DESC LIMIT $2 OFFSET $3`,
  [studentId, filters.pageSize, (filters.page - 1) * filters.pageSize])
  const data = await Promise.all(rows.map(async row => ({
    applicationId: row.id, applicationStatus: row.estado,
    attended: row.asistio ?? null, awardedMinutes: row.minutos_acreditados ?? 0,
    job: await getJob(pool, row.trabajo_id),
  })))
  return pageResult(data, count.rows[0].total, filters)
}

export async function getStudentHistoryForAdmin(pool, studentId, filters) {
  const student = await pool.query('SELECT 1 FROM estudiantes WHERE usuario_id=$1', [studentId])
  if (!student.rows[0]) throw notFound('Estudiante no encontrado.')
  return getStudentHistory(pool, studentId, filters)
}

async function getAttendanceForJobs(pool, ids) {
  if (ids.length === 0) return new Map()
  const { rows } = await pool.query(`SELECT a.trabajo_id,a.postulacion_id,a.asistio,a.minutos_acreditados,
      u.nombre,e.codigo,e.carrera
    FROM asistencias a
    JOIN postulaciones p ON p.id=a.postulacion_id
    JOIN estudiantes e ON e.usuario_id=p.estudiante_id
    JOIN usuarios u ON u.id=e.usuario_id
    WHERE a.trabajo_id=ANY($1::uuid[]) ORDER BY a.trabajo_id,a.postulacion_id`, [ids])
  const byJob = new Map(ids.map(id => [id, []]))
  for (const row of rows) {
    byJob.get(row.trabajo_id).push({
      applicationId: row.postulacion_id, attended: row.asistio,
      awardedMinutes: row.minutos_acreditados,
      student: { name: row.nombre, code: row.codigo, career: row.carrera },
    })
  }
  return byJob
}

export async function getOwnerHistory(pool, actorId, filters) {
  const count = await pool.query('SELECT count(*)::int AS total FROM cierres WHERE encargado_id=$1', [actorId])
  const { rows } = await pool.query(`SELECT trabajo_id,cerrado_en FROM cierres
    WHERE encargado_id=$1 ORDER BY cerrado_en DESC,trabajo_id DESC LIMIT $2 OFFSET $3`,
  [actorId, filters.pageSize, (filters.page - 1) * filters.pageSize])
  const attendance = await getAttendanceForJobs(pool, rows.map(row => row.trabajo_id))
  const data = await Promise.all(rows.map(async row => ({
    job: await getJob(pool, row.trabajo_id), closedAt: row.cerrado_en,
    attendance: attendance.get(row.trabajo_id),
  })))
  return pageResult(data, count.rows[0].total, filters)
}

export async function getJobAttendance(pool, jobId, actorId) {
  const job = await getOwnedJob(pool, jobId, actorId)
  if (job.estado !== 'CERRADO') throw conflict('trabajo_no_cerrado', 'El trabajo aun no fue cerrado.')
  const attendance = await getAttendanceForJobs(pool, [jobId])
  return attendance.get(jobId)
}
