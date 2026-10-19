import { Router } from 'express'
import { badRequest, tooManyRequests, unauthorized } from '../lib/errors.js'
import { hashPassword, verifyPassword } from '../lib/passwords.js'
import { clearCookieOptions, cookieOptions } from '../lib/sessions.js'
import { changePasswordSchema, loginSchema, parse } from '../lib/validation.js'
import { requireCsrf, requireSession } from '../middleware/auth.js'
import { findUsuarioById, findUsuarioByCorreo, cambiarPassword } from '../services/users.js'
import { createSession, revokeAllSessions, revokeSession } from '../services/sessions.js'

// Mensaje único para credenciales inválidas: no revela si el correo existe.
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos.'

export function authRouter({ config, limiter }) {
  const router = Router()
  const session = requireSession(config)

  router.post('/login', async (request, response, next) => {
    try {
      const body = parse(loginSchema, request.body ?? {})
      const key = `${body.correo}|${request.ip ?? 'desconocida'}`
      if (limiter.isBlocked(key)) {
        throw tooManyRequests()
      }

      const usuario = await findUsuarioByCorreo(request.app.locals.pool, body.correo)
      const passwordHash = usuario?.passwordHash ?? (await dummyHash())
      const valida = await verifyPassword(passwordHash, body.password)

      if (!usuario || !valida || !usuario.activo) {
        limiter.recordFailure(key)
        throw unauthorized(CREDENCIALES_INVALIDAS)
      }
      limiter.clear(key)

      const creada = await createSession(request.app.locals.pool, {
        usuarioId: usuario.id,
        ttlHours: config.sessionTtlHours,
        userAgent: request.get('user-agent'),
      })
      response.cookie(config.cookieName, creada.token, cookieOptions(config))

      const perfil = await findUsuarioById(request.app.locals.pool, usuario.id)
      response.json({
        data: {
          usuario: perfil,
          requiereCambioPassword: perfil.requiereCambioPassword,
          csrfToken: creada.csrfToken,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/logout', session, requireCsrf(config), async (request, response, next) => {
    try {
      await revokeSession(request.app.locals.pool, request.session.sessionId)
      response.clearCookie(config.cookieName, clearCookieOptions(config))
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', session, async (request, response, next) => {
    try {
      const perfil = await findUsuarioById(request.app.locals.pool, request.usuario.id)
      response.json({
        data: {
          usuario: perfil,
          requiereCambioPassword: request.usuario.requiereCambioPassword,
          csrfToken: request.session.csrfToken,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/change-password', session, requireCsrf(config), async (request, response, next) => {
    try {
      const body = parse(changePasswordSchema, request.body ?? {})
      const pool = request.app.locals.pool
      const usuario = await findUsuarioByCorreo(pool, request.usuario.correo)

      if (!usuario || !(await verifyPassword(usuario.passwordHash, body.passwordActual))) {
        throw badRequest('La contraseña actual no es correcta.')
      }
      if (body.passwordNuevo !== body.passwordNuevoConfirmacion) {
        throw badRequest('La confirmación no coincide con la nueva contraseña.')
      }
      if (body.passwordNuevo.length < config.minPasswordLength) {
        throw badRequest(`La nueva contraseña debe tener al menos ${config.minPasswordLength} caracteres.`)
      }
      if (body.passwordNuevo === body.passwordActual) {
        throw badRequest('La nueva contraseña debe ser distinta de la actual.')
      }
      if (await verifyPassword(usuario.passwordHash, body.passwordNuevo)) {
        throw badRequest('La nueva contraseña debe ser distinta de la actual.')
      }

      await cambiarPassword(pool, usuario.id, await hashPassword(body.passwordNuevo))
      // Cambiar la contraseña invalida el resto de sesiones; esta se renueva.
      await revokeAllSessions(pool, usuario.id)
      const nueva = await createSession(pool, {
        usuarioId: usuario.id,
        ttlHours: config.sessionTtlHours,
        userAgent: request.get('user-agent'),
      })
      response.cookie(config.cookieName, nueva.token, cookieOptions(config))

      const perfil = await findUsuarioById(pool, usuario.id)
      response.json({
        data: { usuario: perfil, requiereCambioPassword: false, csrfToken: nueva.csrfToken },
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}

// Hash señuelo: si el correo no existe se verifica igualmente una contraseña
// real, para que el tiempo de respuesta no delate qué correos están dados de
// alta. Se calcula una sola vez, de forma perezosa.
let dummyHashPromise
function dummyHash() {
  dummyHashPromise ??= hashPassword('mibeca-senuelo-inexistente')
  return dummyHashPromise
}