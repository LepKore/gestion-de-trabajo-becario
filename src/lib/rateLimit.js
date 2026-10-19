// Limitador de intentos de inicio de sesión en memoria del proceso. Es una
// mitigación mínima, no un control distribuido: con varias instancias cada
// una lleva su propia ventana. Suficiente para el MVP.
export function createLoginLimiter({ maxAttempts, windowMinutes }) {
  const attempts = new Map()

  function prune(now) {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key)
    }
  }

  return {
    isBlocked(key, now = Date.now()) {
      const entry = attempts.get(key)
      if (!entry) return false
      if (entry.resetAt <= now) {
        attempts.delete(key)
        return false
      }
      return entry.count >= maxAttempts
    },
    recordFailure(key, now = Date.now()) {
      const entry = attempts.get(key)
      if (!entry || entry.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMinutes * 60_000 })
        return
      }
      entry.count += 1
    },
    clear(key) {
      attempts.delete(key)
    },
    prune,
  }
}