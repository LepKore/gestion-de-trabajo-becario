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

export function createPool(env = process.env) {
  return new Pool(databaseConfig(env))
}
