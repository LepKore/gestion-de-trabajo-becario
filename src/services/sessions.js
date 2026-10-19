import { createTokens, expiresAt, hashToken } from '../lib/sessions.js'

// Acceso a la tabla sesiones. Toda escritura de sesión pasa por aquí.

export async function createSession(pool, { usuarioId, ttlHours, userAgent = null, now = new Date() }) {
  const { token, csrfToken } = createTokens()
  const { rows } = await pool.query(
    `INSERT INTO sesiones (usuario_id, token_hash, csrf_token, user_agent, expira_en)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, csrf_token, expira_en`,
    [usuarioId, hashToken(token), csrfToken, truncate(userAgent), expiresAt(ttlHours, now)],
  )
  return { id: rows[0].id, csrfToken: rows[0].csrf_token, expiraEn: rows[0].expira_en, token }
}

export async function findActiveSession(pool, token, now = new Date()) {
  const { rows } = await pool.query(
    `SELECT s.id, s.csrf_token, s.expira_en,
            u.id AS usuario_id, u.nombre, u.correo, u.rol, u.activo, u.requiere_cambio_password
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1
        AND s.revocado_en IS NULL
        AND s.expira_en > $2
        AND u.activo = true`,
    [hashToken(token), now],
  )
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    sessionId: row.id,
    csrfToken: row.csrf_token,
    expiraEn: row.expira_en,
    usuario: {
      id: row.usuario_id,
      nombre: row.nombre,
      correo: row.correo,
      rol: row.rol,
      activo: row.activo,
      requiereCambioPassword: row.requiere_cambio_password,
    },
  }
}

export async function revokeSession(pool, sessionId) {
  await pool.query(
    'UPDATE sesiones SET revocado_en = now() WHERE id = $1 AND revocado_en IS NULL',
    [sessionId],
  )
}

// Desactivar un usuario, restablecer su contraseña y cerrar sesiones propias
// revocan todas sus sesiones: una contraseña nueva nunca hereda sesiones viejas.
export async function revokeAllSessions(pool, usuarioId) {
  const { rowCount } = await pool.query(
    'UPDATE sesiones SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL',
    [usuarioId],
  )
  return rowCount
}

function truncate(value) {
  if (typeof value !== 'string') return null
  return value.slice(0, 300)
}