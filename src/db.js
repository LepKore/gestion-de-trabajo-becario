import { readFileSync } from 'node:fs'
import { Pool } from 'pg'

export function databaseConfig(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatoria')
  }

  const url = new URL(env.DATABASE_URL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL debe usar PostgreSQL')
  }
  if (url.searchParams.has('sslmode')) {
    throw new Error('Configura TLS con DB_SSL_MODE; elimina sslmode de DATABASE_URL')
  }
  if (url.hash) {
    throw new Error('DATABASE_URL no admite fragmento (#)')
  }
  if (!url.username || !url.password) {
    throw new Error('DATABASE_URL debe incluir usuario y contraseña')
  }

  const mode = env.DB_SSL_MODE || 'disable'
  let ssl
  if (mode === 'disable') {
    ssl = false
  } else if (mode === 'require' || mode === 'verify-full') {
    ssl = { rejectUnauthorized: true }
    if (env.DB_SSL_CA_FILE) {
      ssl.ca = readFileSync(env.DB_SSL_CA_FILE, 'utf8')
    }
  } else {
    throw new Error('DB_SSL_MODE debe ser disable, require o verify-full')
  }

  return { connectionString: env.DATABASE_URL, ssl }
}

// Supavisor en modo transacción (puerto 6543) reasigna la sesión en cada
// transacción. node-postgres solo usa sentencias preparadas con nombre cuando
// se pasa `name` en la configuración de la consulta, así que este pool no
// habilita ninguna: añadir `name` rompería las conexiones al pooler.
export function poolConfig(env = process.env) {
  return {
    ...databaseConfig(env),
    max: positiveInteger(env.DB_POOL_MAX, 5, 'DB_POOL_MAX'),
    idleTimeoutMillis: positiveInteger(env.DB_POOL_IDLE_TIMEOUT_MS, 30_000, 'DB_POOL_IDLE_TIMEOUT_MS'),
  }
}

function positiveInteger(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`)
  }
  return value
}

export function isSupabaseHost(hostname) {
  return typeof hostname === 'string' && hostname.toLowerCase().endsWith('supabase.com')
}

export function createPool(env = process.env) {
  return new Pool(poolConfig(env))
}
