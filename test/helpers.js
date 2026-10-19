import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { createPool } from '../src/db.js'
import { createApp } from '../src/app.js'

// Infraestructura de pruebas: base propia, esquema recreado desde las
// migraciones y un cliente HTTP con tarro de cookies.

// Las pruebas borran y recrean el esquema del destino. Por eso se niegan a
// correr contra un host que no sea local, salvo que se autorice explícitamente.
export function assertTestDatabase(url) {
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (!localHosts.has(url.hostname) && process.env.TEST_ALLOW_REMOTE !== 'true') {
    throw new Error(
      'Las pruebas recrean el esquema. Define TEST_ALLOW_REMOTE=true solo para una base de pruebas descartable.',
    )
  }
}

export function databaseUrl() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  if (!url) throw new Error('Define TEST_DATABASE_URL o DATABASE_URL para ejecutar las pruebas')
  assertTestDatabase(new URL(url))
  return url
}

export async function resetSchema(pool) {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE')
  await pool.query('CREATE SCHEMA public')
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url))
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    await pool.query(await readFile(`${dir}${file}`, 'utf8'))
  }
}

// Entorno de pruebas: argon2 con coste bajo y cookies sin Secure.
export function testEnv(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    COOKIE_SECURE: 'false',
    CORS_ORIGIN: 'http://localhost:5173',
    SESSION_TTL_HOURS: '1',
    LOGIN_MAX_ATTEMPTS: '1000',
    ...overrides,
  }
}

export async function startTestServer(env = testEnv()) {
  const url = env.TEST_DATABASE_URL || env.DATABASE_URL
  const pool = createPool({ ...env, DATABASE_URL: url })
  const { app, config } = createApp({ pool, env })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  const client = createClient(`http://127.0.0.1:${port}`)

  return {
    pool,
    server,
    config,
    baseUrl: `http://127.0.0.1:${port}`,
    ...client,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      await pool.end()
    },
  }
}

// Cliente HTTP mínimo con tarro de cookies y soporte de CSRF, equivalente a lo
// que hará el navegador contra la API real.
export function createClient(baseUrl) {
  const jar = new Map()
  let csrfToken = null

  function cookieHeader() {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() ?? []
    for (const cookie of raw) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (value === '') jar.delete(name)
      else jar.set(name, value)
    }
  }

  async function call(method, url, body, extraHeaders = {}) {
    // Las cabeceras explícitas tienen prioridad sobre la cookie y el CSRF
    // automáticos: una prueba puede enviar un token falso a propósito.
    const headers = {}
    const cookies = cookieHeader()
    if (cookies) headers.cookie = cookies
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (csrfToken && !['GET', 'HEAD'].includes(method)) headers['x-csrf-token'] = csrfToken
    Object.assign(headers, extraHeaders)

    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    storeCookies(response)
    const text = await response.text()
    const json = text ? JSON.parse(text) : null
    if (json?.data?.csrfToken) csrfToken = json.data.csrfToken
    return { status: response.status, body: json, headers: response.headers }
  }

  return {
    get: (url, headers) => call('GET', url, undefined, headers),
    post: (url, body, headers) => call('POST', url, body ?? {}, headers),
    patch: (url, body, headers) => call('PATCH', url, body ?? {}, headers),
    getCsrfToken: () => csrfToken,
    clearCookies: () => jar.clear(),
    cookies: jar,
  }
}

export const datos = {
  admin: { nombre: 'Admin Prueba', correo: 'admin@uni.edu', rol: 'ADMIN' },
  encargado: {
    nombre: 'Luis Gómez',
    correo: 'luis@uni.edu',
    rol: 'ENCARGADO',
    encargado: { contextoTipo: 'MATERIA', contextoNombre: 'Programación II' },
  },
  becario: {
    nombre: 'Ana Pérez',
    correo: 'ana@uni.edu',
    rol: 'BECARIO',
    estudiante: { codigo: '00731', carrera: 'Ingeniería de Sistemas', semestre: 4, metaMinutos: 120 },
  },
}
