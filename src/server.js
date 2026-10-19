import { createPool } from './db.js'
import { createApp } from './app.js'

const pool = createPool()
const { app, config } = createApp({ pool })

const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un puerto TCP válido')
}

const server = app.listen(port, host, () => {
  console.log(`MiBeca API disponible en ${host}:${port}`)
  console.log(`Sesiones: ${config.sessionTtlHours} h; cookie Secure=${config.cookieSecure}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)))
  })
}