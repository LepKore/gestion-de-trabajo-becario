import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { appConfig } from './config.js'
import { HttpError, notFound } from './lib/errors.js'
import { createLoginLimiter } from './lib/rateLimit.js'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { jobsRouter } from './routes/jobs.js'
import { controlRouter } from './routes/control.js'

// Construye la aplicación Express sobre un pool existente. Separar esto de
// src/server.js permite montar la API en pruebas sin abrir un puerto fijo.
export function createApp({ pool, env = process.env }) {
  const config = appConfig(env)
  const limiter = createLoginLimiter(config)
  const app = express()

  app.locals.pool = pool
  app.locals.env = env
  app.locals.config = config

  app.disable('x-powered-by')
  app.set('trust proxy', false)
  // El CORS se aplica antes del helmet para que sus cabeceras no pisen las de
  // la respuesta; helmet añade su propio conjunto y ambos son complementarios.
  app.use(cors(config))
  app.use(helmet())
  app.use(express.json({ limit: '64kb' }))

  // Orígenes exactos: nunca comodín, porque las sesiones viajan en cookie y
  // el navegador exige credenciales con origen concreto.
  function cors(options) {
    return (request, response, next) => {
      const origin = request.headers.origin
      if (origin && options.allowedOrigins.has(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Access-Control-Allow-Credentials', 'true')
        response.setHeader('Vary', 'Origin')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Idempotency-Key')
        response.setHeader('Access-Control-Max-Age', '600')
      }
      if (request.method === 'OPTIONS') {
        response.status(204).end()
        return
      }
      next()
    }
  }

  app.get('/health', (request, response) => response.json({ status: 'ok' }))
  app.get('/health_db', async (request, response) => {
    try {
      await pool.query('SELECT 1')
      response.json({ status: 'ok' })
    } catch {
      response.status(503).json({ status: 'error', error: 'database_unavailable' })
    }
  })
  app.get('/ready', async (request, response) => {
    try {
      await pool.query('SELECT 1')
      response.json({ status: 'ready' })
    } catch {
      response.status(503).json({ error: 'database_unavailable' })
    }
  })

  // cookieParser sin secreto: la cookie es un identificador opaco aleatorio y
  // la integridad la garantiza el hash almacenado, no una firma.
  app.use(cookieParser())

  app.use('/api/v1/auth', authRouter({ config, limiter }))
  app.use('/api/v1/users', usersRouter({ config }))
  app.use('/api/v1', jobsRouter({ config }))
  app.use('/api/v1', controlRouter({ config }))

  app.use((request, response, next) => {
    next(notFound('Ruta no encontrada.'))
  })

  app.use((error, request, response, next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.detalles ? { detalles: error.detalles } : {}),
        },
      })
      return
    }
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'validation_error', message: 'JSON inválido.' } })
      return
    }
    // Trazas y SQL solo a consola; nunca a la respuesta.
    console.error('Error no controlado:', error)
    response.status(500).json({ error: { code: 'internal_error', message: 'Error interno.' } })
  })

  return { app, config }
}
