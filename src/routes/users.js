import { Router } from 'express'
import { badRequest, notFound } from '../lib/errors.js'
import {
  listarUsuariosSchema,
  nuevoUsuarioSchema,
  editarUsuarioSchema,
  parse,
  usuarioIdSchema,
} from '../lib/validation.js'
import { requireCsrf, requireNoPendingPasswordChange, requireRole, requireSession } from '../middleware/auth.js'
import {
  actualizarUsuario,
  crearUsuario,
  desactivarUsuario,
  findUsuarioById,
  listarUsuarios,
  reactivarUsuario,
  restablecerPassword,
} from '../services/users.js'

// Administración de cuentas. Exclusiva del rol ADMIN; el rol no se edita y la
// baja es lógica, por lo que el historial se conserva.
export function usersRouter({ config }) {
  const router = Router()
  const admin = [requireSession(config), requireNoPendingPasswordChange, requireRole('ADMIN')]

  router.get('/', ...admin, async (request, response, next) => {
    try {
      const filtros = parse(listarUsuariosSchema, request.query)
      response.json(await listarUsuarios(request.app.locals.pool, filtros))
    } catch (error) {
      next(error)
    }
  })

  router.post('/', ...admin, requireCsrf(config), async (request, response, next) => {
    try {
      const datos = parse(nuevoUsuarioSchema, request.body ?? {})
      const { usuario, passwordTemporal } = await crearUsuario(
        request.app.locals.pool,
        { ...datos, actorId: request.usuario.id },
        request.app.locals.env,
      )
      // La contraseña temporal se devuelve una sola vez, en esta respuesta.
      response.status(201).json({ data: { ...usuario, passwordTemporal } })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', ...admin, async (request, response, next) => {
    try {
      const id = parse(usuarioIdSchema, request.params.id)
      const usuario = await findUsuarioById(request.app.locals.pool, id)
      if (!usuario) throw notFound('Usuario no encontrado.')
      response.json({ data: usuario })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:id', ...admin, requireCsrf(config), async (request, response, next) => {
    try {
      const id = parse(usuarioIdSchema, request.params.id)
      // `rol` se rechaza con un mensaje propio antes de la validación general,
      // que lo rechazaría como campo desconocido.
      if (Object.hasOwn(request.body ?? {}, 'rol')) {
        throw badRequest('El rol no se puede modificar después del alta.')
      }
      const cambios = parse(editarUsuarioSchema, request.body ?? {})
      const usuario = await actualizarUsuario(request.app.locals.pool, id, {
        ...cambios,
        actorId: request.usuario.id,
      })
      response.json({ data: usuario })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/deactivate', ...admin, requireCsrf(config), async (request, response, next) => {
    try {
      const id = parse(usuarioIdSchema, request.params.id)
      response.json({ data: await desactivarUsuario(request.app.locals.pool, id, request.usuario.id) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/reactivate', ...admin, requireCsrf(config), async (request, response, next) => {
    try {
      const id = parse(usuarioIdSchema, request.params.id)
      response.json({ data: await reactivarUsuario(request.app.locals.pool, id, request.usuario.id) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:id/reset-password', ...admin, requireCsrf(config), async (request, response, next) => {
    try {
      const id = parse(usuarioIdSchema, request.params.id)
      const { passwordTemporal } = await restablecerPassword(
        request.app.locals.pool,
        id,
        request.usuario.id,
        request.app.locals.env,
      )
      response.json({ data: { passwordTemporal } })
    } catch (error) {
      next(error)
    }
  })

  return router
}