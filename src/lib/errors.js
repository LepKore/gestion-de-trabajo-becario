// Errores de aplicación. Solo se expone `code` y `message`: nunca trazas,
// SQL ni secretos. El manejador central de src/app.js los traduce a JSON.
export class HttpError extends Error {
  constructor(status, code, message, detalles = undefined) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.detalles = detalles
  }
}

export const badRequest = (message, detalles) => new HttpError(400, 'validation_error', message, detalles)
export const unauthorized = (message = 'No autenticado') =>
  new HttpError(401, 'unauthenticated', message)
export const forbidden = (message = 'No autorizado') => new HttpError(403, 'forbidden', message)
export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, 'not_found', message)
export const conflict = (code, message) => new HttpError(409, code, message)
export const tooManyRequests = (message = 'Demasiados intentos. Intenta más tarde.') =>
  new HttpError(429, 'too_many_attempts', message)

// Traduce errores de PostgreSQL a respuestas del contrato. La referencia a la
// tabla es explícita: no se filtra el texto original del driver.
export function fromDatabaseError(error) {
  if (error?.code === '23505') {
    return conflict('duplicate', 'Ya existe un registro con esos datos.')
  }
  if (error?.code === '23514' || error?.code === '23502') {
    return badRequest('Los datos no cumplen las restricciones del dominio.')
  }
  return null
}