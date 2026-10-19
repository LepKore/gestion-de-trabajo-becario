// Configuración de sesión y cookies. Valores por defecto pensados para
// desarrollo local; en producción HTTPS debe activarse COOKIE_SECURE.
const DEFAULTS = {
  SESSION_TTL_HOURS: 8,
  SESSION_COOKIE_NAME: 'mibeca_session',
  CSRF_HEADER_NAME: 'x-csrf-token',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MINUTES: 15,
}

function positiveInteger(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`)
  }
  return value
}

function positiveHours(raw, fallback, name) {
  const hours = positiveInteger(raw, fallback, name)
  if (hours > 24 * 30) {
    throw new Error(`${name} no puede superar 720 horas`)
  }
  return hours
}

export function appConfig(env = process.env) {
  const cookieName = env.SESSION_COOKIE_NAME || DEFAULTS.SESSION_COOKIE_NAME
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) {
    throw new Error('SESSION_COOKIE_NAME solo admite letras, dígitos, guion y guion bajo')
  }

  const secure = env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === ''
    ? env.NODE_ENV === 'production'
    : env.COOKIE_SECURE === 'true'
  if (secure && env.NODE_ENV !== 'production' && env.COOKIE_SECURE === 'true') {
    // Permitido: desarrollo local por HTTPS (túnel) o pruebas.
  }

  const sameSite = (env.SESSION_SAME_SITE || 'lax').toLowerCase()
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('SESSION_SAME_SITE debe ser lax, strict o none')
  }
  if (sameSite === 'none' && !secure) {
    throw new Error('SESSION_SAME_SITE=none exige COOKIE_SECURE=true')
  }

  const origins = new Set(
    (env.CORS_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )

  return {
    poolMax: positiveInteger(env.DB_POOL_MAX, 5, 'DB_POOL_MAX'),
    sessionTtlHours: positiveHours(env.SESSION_TTL_HOURS, DEFAULTS.SESSION_TTL_HOURS, 'SESSION_TTL_HOURS'),
    cookieName,
    csrfHeaderName: DEFAULTS.CSRF_HEADER_NAME,
    cookieSecure: secure,
    cookieSameSite: sameSite,
    allowedOrigins: origins,
    loginMaxAttempts: positiveInteger(env.LOGIN_MAX_ATTEMPTS, DEFAULTS.LOGIN_MAX_ATTEMPTS, 'LOGIN_MAX_ATTEMPTS'),
    loginWindowMinutes: positiveInteger(
      env.LOGIN_WINDOW_MINUTES,
      DEFAULTS.LOGIN_WINDOW_MINUTES,
      'LOGIN_WINDOW_MINUTES',
    ),
    minPasswordLength: positiveInteger(env.MIN_PASSWORD_LENGTH, 10, 'MIN_PASSWORD_LENGTH'),
  }
}