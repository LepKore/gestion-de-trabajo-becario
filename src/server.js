import { createServer } from 'node:http'
import { createPool } from './db.js'

const pool = createPool()
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
)

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  if (request.method === 'OPTIONS' && origin && allowedOrigins.has(origin)) {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok' })
    return
  }

  if (request.method === 'GET' && request.url === '/ready') {
    try {
      await pool.query('SELECT 1')
      sendJson(response, 200, { status: 'ready' })
    } catch {
      sendJson(response, 503, { error: 'database_unavailable' })
    }
    return
  }

  sendJson(response, 404, { error: 'not_found' })
})

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un puerto TCP válido')
}
server.listen(port, host, () => {
  console.log(`MiBeca API disponible en ${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)))
  })
}
