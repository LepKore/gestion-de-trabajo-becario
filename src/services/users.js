import { badRequest, conflict, notFound, fromDatabaseError } from '../lib/errors.js'
import { generateTemporaryPassword, hashPassword } from '../lib/passwords.js'
import { revokeAllSessions } from './sessions.js'

// Reglas de cuentas. Las rutas solo traducen HTTP; la lógica vive aquí.

const SELECT_USUARIO = `
  SELECT u.id, u.nombre, u.correo, u.rol, u.activo, u.requiere_cambio_password,
         u.creado_en, u.actualizado_en,
         e.codigo, e.carrera, e.semestre, e.meta_minutos,
         g.contexto_tipo, g.contexto_nombre
    FROM usuarios u
    LEFT JOIN estudiantes e ON e.usuario_id = u.id
    LEFT JOIN encargados  g ON g.usuario_id = u.id`

export function serializeUsuario(row) {
  if (!row) return null
  const usuario = {
    id: row.id,
    nombre: row.nombre,
    correo: row.correo,
    rol: row.rol,
    activo: row.activo,
    requiereCambioPassword: row.requiere_cambio_password,
    estudiante: null,
    encargado: null,
    creadoEn: row.creado_en,
    actualizadoEn: row.actualizado_en,
  }
  if (row.codigo) {
    usuario.estudiante = {
      codigo: row.codigo,
      carrera: row.carrera,
      semestre: row.semestre,
      metaMinutos: row.meta_minutos,
    }
  }
  if (row.contexto_tipo) {
    usuario.encargado = {
      contextoTipo: row.contexto_tipo,
      contextoNombre: row.contexto_nombre,
    }
  }
  return usuario
}

export async function findUsuarioById(pool, id) {
  const { rows } = await pool.query(`${SELECT_USUARIO} WHERE u.id = $1`, [id])
  return serializeUsuario(rows[0] ?? null)
}

export async function findUsuarioByCorreo(pool, correo) {
  // Selecciona también el hash: es el único punto que lo necesita.
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.rol, u.activo, u.requiere_cambio_password, u.password_hash
       FROM usuarios u WHERE u.correo = $1`,
    [correo],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    id: row.id,
    nombre: row.nombre,
    correo: row.correo,
    rol: row.rol,
    activo: row.activo,
    requiereCambioPassword: row.requiere_cambio_password,
    passwordHash: row.password_hash,
  }
}

export async function listarUsuarios(pool, filtros) {
  const where = []
  const values = []
  const push = (fragment, value) => {
    values.push(value)
    where.push(fragment.replace('?', `$${values.length}`))
  }
  if (filtros.rol) push('u.rol = ?', filtros.rol)
  if (filtros.activo !== undefined) push('u.activo = ?', filtros.activo)
  if (filtros.q) {
    const patron = `%${filtros.q.toLowerCase()}%`
    values.push(patron)
    where.push(
      `(lower(u.nombre) LIKE $${values.length} OR lower(u.correo) LIKE $${values.length} OR e.codigo LIKE $${values.length})`,
    )
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalResult = await pool.query(
    `SELECT count(*)::int AS total FROM usuarios u LEFT JOIN estudiantes e ON e.usuario_id = u.id ${whereSql}`,
    values,
  )
  const total = totalResult.rows[0].total

  const offset = (filtros.page - 1) * filtros.pageSize
  const { rows } = await pool.query(
    `${SELECT_USUARIO} ${whereSql}
      ORDER BY lower(u.nombre), u.correo
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filtros.pageSize, offset],
  )

  return {
    data: rows.map(serializeUsuario),
    meta: {
      page: filtros.page,
      pageSize: filtros.pageSize,
      total,
      totalPages: Math.ceil(total / filtros.pageSize),
    },
  }
}

/**
 * Crea un usuario y su perfil en una transacción. `datos.passwordInicial` solo
 * lo usa el arranque local (bootstrap del primer administrador): la API no lo
 * acepta porque el esquema de entrada es estricto.
 */
export async function crearUsuario(pool, datos, env = process.env) {
  validarPerfil(datos)
  const passwordDefinida = typeof datos.passwordInicial === 'string' && datos.passwordInicial.length > 0
  const passwordTemporal = passwordDefinida ? datos.passwordInicial : generateTemporaryPassword()
  const passwordHash = await hashPassword(passwordTemporal, env)

  const client = await pool.connect()
  let liberado = false
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, requiere_cambio_password)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [datos.nombre, datos.correo, passwordHash, datos.rol],
    )
    const id = rows[0].id

    if (datos.rol === 'BECARIO') {
      const p = datos.estudiante
      await client.query(
        `INSERT INTO estudiantes (usuario_id, codigo, carrera, semestre, meta_minutos)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, p.codigo, p.carrera, p.semestre, p.metaMinutos],
      )
    } else if (datos.rol === 'ENCARGADO') {
      const p = datos.encargado
      await client.query(
        `INSERT INTO encargados (usuario_id, contexto_tipo, contexto_nombre)
         VALUES ($1, $2, $3)`,
        [id, p.contextoTipo, p.contextoNombre],
      )
    }

    await auditar(client, { actorId: datos.actorId, accion: 'usuario.crear', recurso: id, detalle: { rol: datos.rol } })
    await client.query('COMMIT')
    // Se libera el cliente antes de leer el usuario: con un pool de una sola
    // conexión, mantenerla tomada dejaría la lectura esperando indefinidamente.
    client.release()
    liberado = true

    const usuario = await findUsuarioById(pool, id)
    return { usuario, passwordTemporal, passwordGenerada: !passwordDefinida }
  } catch (error) {
    await client.query('ROLLBACK')
    throw fromDatabaseError(error) ?? error
  } finally {
    if (!liberado) client.release()
  }
}

export async function actualizarUsuario(pool, id, cambios) {
  if ('rol' in cambios) {
    throw badRequest('El rol no se puede modificar después del alta.')
  }
  const actual = await findUsuarioById(pool, id)
  if (!actual) throw notFound('Usuario no encontrado.')

  try {
    const fields = []
    const values = []
    if (cambios.nombre !== undefined) {
      values.push(cambios.nombre)
      fields.push(`nombre = $${values.length}`)
    }
    if (cambios.correo !== undefined) {
      values.push(cambios.correo)
      fields.push(`correo = $${values.length}`)
    }
    if (fields.length === 0) {
      throw badRequest('Indica al menos un campo a modificar.')
    }
    values.push(id)
    await pool.query(
      `UPDATE usuarios SET ${fields.join(', ')}, actualizado_en = now() WHERE id = $${values.length}`,
      values,
    )

    if (cambios.estudiante !== undefined) {
      if (actual.rol !== 'BECARIO') throw badRequest('Solo un becario tiene perfil de estudiante.')
      const p = cambios.estudiante
      await pool.query(
        `UPDATE estudiantes SET codigo = $2, carrera = $3, semestre = $4, meta_minutos = $5
          WHERE usuario_id = $1`,
        [id, p.codigo, p.carrera, p.semestre, p.metaMinutos],
      )
    }
    if (cambios.encargado !== undefined) {
      if (actual.rol !== 'ENCARGADO') throw badRequest('Solo un encargado tiene contexto.')
      const p = cambios.encargado
      await pool.query(
        `UPDATE encargados SET contexto_tipo = $2, contexto_nombre = $3 WHERE usuario_id = $1`,
        [id, p.contextoTipo, p.contextoNombre],
      )
    }

    await auditar(pool, { actorId: cambios.actorId, accion: 'usuario.actualizar', recurso: id })
    return findUsuarioById(pool, id)
  } catch (error) {
    throw fromDatabaseError(error) ?? error
  }
}

export async function desactivarUsuario(pool, id, actorId) {
  const usuario = await findUsuarioById(pool, id)
  if (!usuario) throw notFound('Usuario no encontrado.')
  if (!usuario.activo) return usuario
  if (usuario.rol === 'ADMIN') {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS total FROM usuarios WHERE rol = 'ADMIN' AND activo = true`,
    )
    if (rows[0].total <= 1) {
      throw conflict('ultimo_admin_activo', 'No se puede desactivar al último administrador activo.')
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE usuarios SET activo = false, actualizado_en = now() WHERE id = $1', [id])
    await revokeAllSessions(client, id)
    await auditar(client, { actorId, accion: 'usuario.desactivar', recurso: id })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw fromDatabaseError(error) ?? error
  } finally {
    client.release()
  }
  return findUsuarioById(pool, id)
}

export async function reactivarUsuario(pool, id, actorId) {
  const usuario = await findUsuarioById(pool, id)
  if (!usuario) throw notFound('Usuario no encontrado.')
  if (usuario.activo) return usuario
  // No se revive ninguna sesión previa ni se salta el cambio de contraseña.
  await pool.query('UPDATE usuarios SET activo = true, actualizado_en = now() WHERE id = $1', [id])
  await auditar(pool, { actorId, accion: 'usuario.reactivar', recurso: id })
  return findUsuarioById(pool, id)
}

export async function restablecerPassword(pool, id, actorId, env = process.env) {
  const usuario = await findUsuarioById(pool, id)
  if (!usuario) throw notFound('Usuario no encontrado.')
  const passwordTemporal = generateTemporaryPassword()
  const passwordHash = await hashPassword(passwordTemporal, env)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE usuarios SET password_hash = $2, requiere_cambio_password = true, actualizado_en = now()
        WHERE id = $1`,
      [id, passwordHash],
    )
    await revokeAllSessions(client, id)
    await auditar(client, { actorId, accion: 'usuario.reset_password', recurso: id })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { passwordTemporal }
}

export async function cambiarPassword(pool, id, passwordHash) {
  await pool.query(
    `UPDATE usuarios SET password_hash = $2, requiere_cambio_password = false, actualizado_en = now()
      WHERE id = $1`,
    [id, passwordHash],
  )
}

export async function auditar(client, { actorId, accion, recurso, detalle = {} }) {
  await client.query(
    'INSERT INTO auditoria (actor_id, accion, recurso, detalle) VALUES ($1, $2, $3, $4)',
    [actorId ?? null, accion, recurso, JSON.stringify(detalle)],
  )
}

function validarPerfil(datos) {
  if (datos.rol === 'BECARIO' && !datos.estudiante) {
    throw badRequest('Un becario requiere código, carrera, semestre y meta de horas.')
  }
  if (datos.rol === 'ENCARGADO' && !datos.encargado) {
    throw badRequest('Un encargado requiere tipo de contexto y nombre del contexto.')
  }
  if (datos.rol === 'ADMIN' && (datos.estudiante || datos.encargado)) {
    throw badRequest('Un administrador no lleva perfil de estudiante ni de encargado.')
  }
  if (datos.rol !== 'BECARIO' && datos.estudiante) {
    throw badRequest('El perfil de estudiante solo aplica a becarios.')
  }
  if (datos.rol !== 'ENCARGADO' && datos.encargado) {
    throw badRequest('El contexto solo aplica a encargados.')
  }
}