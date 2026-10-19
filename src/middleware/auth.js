import { unauthorized, forbidden } from '../lib/errors.js'
import { safeEqual } from '../lib/sessions.js'
import { findActiveSession } from '../services/sessions.js'

// Sesión obligatoria. No distingue "sin cookie" de "cookie inválida": ambas
// responden 401 con el mismo mensaje para no filtrar información.
export function requireSession(config) {
  return async (request, response, next) => {
    const token = request.cookies?.[config.cookieName]
    if (!token) {
      next(unauthorized('Debes iniciar sesión.'))
      return
    }
    const session = await findActiveSession(request.app.locals.pool, token)
    if (!session) {
      next(unauthorized('La sesión no es válida o ha expirado.'))
      return
    }
    request.session = session
    request.usuario = session.usuario
    next()
  }
}

// Toda escritura con cookie exige el token CSRF de esa sesión.
export function requireCsrf(config) {
  return (request, response, next) => {
    const provided = request.get(config.csrfHeaderName)
    if (!request.session || !safeEqual(provided ?? '', request.session.csrfToken)) {
      next(forbidden('Token CSRF inválido o ausente.'))
      return
    }
    next()
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.usuario || !roles.includes(request.usuario.rol)) {
      next(forbidden('Tu rol no permite esta operación.'))
      return
    }
    next()
  }
}

// Permitido a cualquiera, pero exige cambio de contraseña pendiente para poder
// llegar a las rutas de negocio.
export function requireNoPendingPasswordChange(request, response, next) {
  if (request.usuario?.requiereCambioPassword) {
    next(forbidden('Debes cambiar tu contraseña temporal antes de continuar.'))
    return
  }
  next()
}