import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPool, isSupabaseHost } from '../src/db.js'

const url = new URL(process.env.DATABASE_URL || 'postgresql://missing:missing@invalid/missing')
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
const sslMode = process.env.DB_SSL_MODE || 'disable'

const targets = {
  local() {
    if (!localHosts.has(url.hostname)) {
      throw new Error('MIGRATION_TARGET=local requiere DATABASE_URL en localhost')
    }
  },
  supabase() {
    if (localHosts.has(url.hostname)) {
      throw new Error('MIGRATION_TARGET=supabase no admite localhost')
    }
    if (!isSupabaseHost(url.hostname)) {
      throw new Error(`MIGRATION_TARGET=supabase requiere un host de Supabase; recibido: ${url.hostname}`)
    }
    if (process.env.MIGRATION_CONFIRM_HOST !== url.hostname) {
      throw new Error('Migración a Supabase requiere MIGRATION_CONFIRM_HOST igual al host de DATABASE_URL')
    }
    if (sslMode === 'disable') {
      throw new Error('MIGRATION_TARGET=supabase requiere DB_SSL_MODE=require o verify-full')
    }
  },
  render() {
    if (localHosts.has(url.hostname) || process.env.MIGRATION_CONFIRM_HOST !== url.hostname) {
      throw new Error('Migración remota requiere MIGRATION_CONFIRM_HOST igual al host de DATABASE_URL')
    }
  },
}

const target = process.env.MIGRATION_TARGET
const validate = Object.hasOwn(targets, target) ? targets[target] : null
if (!validate) {
  throw new Error('Define MIGRATION_TARGET=local, supabase o render para ejecutar migraciones')
}
validate()

if (target === 'supabase') {
  console.log(`Destino: Supabase en ${url.hostname}/${url.pathname.slice(1)} (TLS ${sslMode})`)
}

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url))
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
const pool = createPool()

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(78642371)')
    await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

    for (const file of files) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE filename = $1', [file])
      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migración aplicada modificada: ${file}`)
        }
        continue
      }
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum])
      console.log(`Migración aplicada: ${file}`)
    }

    await client.query('COMMIT')
    console.log(files.length === 0 ? 'Infraestructura lista; esquema de producto pendiente.' : 'Migraciones al día.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
