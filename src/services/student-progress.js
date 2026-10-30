export async function listStudentProgress(pool, filters) {
  const values = [
    filters.q ? `%${filters.q.toLowerCase()}%` : null,
    filters.conHorasPendientes ?? null,
  ]
  const where = `WHERE ($1::text IS NULL OR lower(resumen.nombre) LIKE $1 OR lower(resumen.correo) LIKE $1 OR resumen.codigo LIKE $1 OR lower(resumen.carrera) LIKE $1)
    AND ($2::boolean IS NULL OR ($2 AND resumen.acreditados < resumen.meta_minutos) OR (NOT $2 AND resumen.acreditados >= resumen.meta_minutos))`
  const resumen = `WITH acreditado AS (
    SELECT p.estudiante_id, COALESCE(sum(a.minutos_acreditados), 0)::bigint AS acreditados
    FROM postulaciones p LEFT JOIN asistencias a ON a.postulacion_id=p.id
    GROUP BY p.estudiante_id
  )
  SELECT u.id,u.nombre,u.correo,e.codigo,e.carrera,e.semestre,e.meta_minutos,
    COALESCE(acreditado.acreditados,0)::bigint AS acreditados
  FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id
  LEFT JOIN acreditado ON acreditado.estudiante_id=e.usuario_id`

  const total = await pool.query(`WITH resumen AS (${resumen}) SELECT count(*)::int AS total FROM resumen ${where}`, values)
  const totalFilas = total.rows[0].total
  const { rows } = await pool.query(`WITH resumen AS (${resumen}) SELECT id,nombre,correo,codigo,carrera,semestre,meta_minutos,acreditados FROM resumen ${where}
    ORDER BY lower(nombre),codigo,id LIMIT $3 OFFSET $4`,
  [...values, filters.pageSize, (filters.page - 1) * filters.pageSize])

  return {
    data: rows.map(row => {
      const targetMinutes = row.meta_minutos
      const accreditedMinutes = Number(row.acreditados)
      return {
        id: row.id, name: row.nombre, email: row.correo, code: row.codigo,
        career: row.carrera, semester: row.semestre, targetMinutes, accreditedMinutes,
        remainingMinutes: Math.max(targetMinutes - accreditedMinutes, 0),
        excessMinutes: Math.max(accreditedMinutes - targetMinutes, 0),
      }
    }),
    meta: { page: filters.page, pageSize: filters.pageSize, total: totalFilas, totalPages: Math.ceil(totalFilas / filters.pageSize) },
  }
}

export async function listStudentCompliance(pool) {
  const { rows } = await pool.query(`SELECT u.id,u.nombre,e.codigo,e.meta_minutos,
      COALESCE(sum(a.minutos_acreditados),0)::bigint AS acreditados
    FROM estudiantes e JOIN usuarios u ON u.id=e.usuario_id
    LEFT JOIN postulaciones p ON p.estudiante_id=e.usuario_id
    LEFT JOIN asistencias a ON a.postulacion_id=p.id
    GROUP BY u.id,u.nombre,e.codigo,e.meta_minutos
    ORDER BY lower(u.nombre),e.codigo,u.id`)
  return rows.map(row => {
    const targetMinutes = row.meta_minutos
    const accreditedMinutes = Number(row.acreditados)
    return {
      id: row.id, name: row.nombre, code: row.codigo, targetMinutes, accreditedMinutes,
      remainingMinutes: Math.max(targetMinutes - accreditedMinutes, 0),
      completed: accreditedMinutes >= targetMinutes,
    }
  })
}
