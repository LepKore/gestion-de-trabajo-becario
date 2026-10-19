import { Router } from 'express'
import { parse, usuarioIdSchema } from '../lib/validation.js'
import { closeSchema, historyQuerySchema, idempotencyKeySchema, studentProgressQuerySchema } from '../lib/control-validation.js'
import { requireSession, requireRole, requireCsrf, requireNoPendingPasswordChange } from '../middleware/auth.js'
import { closeJob, getProgress, getStudentHistory, getStudentHistoryForAdmin, getOwnerHistory, getJobAttendance, getOwnerDashboard } from '../services/control.js'
import { listStudentProgress } from '../services/student-progress.js'

export function controlRouter({ config }) {
  const router = Router()
  const auth = [requireSession(config), requireNoPendingPasswordChange]
  const owner = requireRole('ENCARGADO')
  const student = requireRole('BECARIO')
  const historyRole = requireRole('ENCARGADO', 'BECARIO')
  const admin = requireRole('ADMIN')
  const id = request => parse(usuarioIdSchema, request.params.id).toLowerCase()
  const handle = fn => async (request, response, next) => {
    try { await fn(request, response, request.app.locals.pool) } catch (error) { next(error) }
  }

  router.post('/jobs/:id/close', ...auth, owner, requireCsrf(config), handle(async (req, res, pool) => {
    const jobId = id(req)
    const key = parse(idempotencyKeySchema, req.get('Idempotency-Key'), 'Idempotency-Key invalida o ausente.')
    const body = parse(closeSchema, req.body)
    res.json(await closeJob(pool, jobId, req.usuario.id, key, body.attendance))
  }))
  router.get('/jobs/:id/attendance', ...auth, owner, handle(async (req, res, pool) => {
    res.json({ data: await getJobAttendance(pool, id(req), req.usuario.id) })
  }))
  router.get('/me/progress', ...auth, student, handle(async (req, res, pool) => {
    res.json({ data: await getProgress(pool, req.usuario.id) })
  }))
  router.get('/me/dashboard', ...auth, owner, handle(async (req, res, pool) => {
    res.json({ data: await getOwnerDashboard(pool, req.usuario.id) })
  }))
  router.get('/me/history', ...auth, historyRole, handle(async (req, res, pool) => {
    const filters = parse(historyQuerySchema, req.query)
    res.json(req.usuario.rol === 'BECARIO'
      ? await getStudentHistory(pool, req.usuario.id, filters)
      : await getOwnerHistory(pool, req.usuario.id, filters))
  }))

  router.get('/students/progress', ...auth, admin, handle(async (req, res, pool) => {
    const filters = parse(studentProgressQuerySchema, req.query)
    res.json(await listStudentProgress(pool, filters))
  }))
  router.get('/students/:id/history', ...auth, admin, handle(async (req, res, pool) => {
    const filters = parse(historyQuerySchema, req.query)
    res.json(await getStudentHistoryForAdmin(pool, id(req), filters))
  }))

  return router
}
