import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Sesiones opacas de servidor. El token viaja solo en la cookie HttpOnly; en
// la base se guarda su SHA-256, de modo que una lectura de la tabla no permite
// autenticarse. El token CSRF vive junto a la sesión y viaja en el cuerpo.
const TOKEN_BYTES = 32

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function createTokens() {
  return {
    token: randomBytes(TOKEN_BYTES).toString('base64url'),
    csrfToken: randomBytes(TOKEN_BYTES).toString('base64url'),
  }
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

export function expiresAt(ttlHours, now = new Date()) {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000)
}

export function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  }
}

export function clearCookieOptions(config) {
  const { maxAge, ...rest } = cookieOptions(config)
  return rest
}