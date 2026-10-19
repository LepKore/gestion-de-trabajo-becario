import { Router } from 'express'
import { parse, usuarioIdSchema } from '../lib/validation.js'
import { jobFields, editJobSchema, emptySchema, jobsQuerySchema, applicationsQuerySchema } from '../lib/jobs-validation.js'
import { requireSession, requireRole, requireCsrf, requireNoPendingPasswordChange } from '../middleware/auth.js'
import { getJob, listJobs, createJob, editJob, applyJob, decideApplication, listApplications } from '../services/jobs.js'

export function jobsRouter({ config }) {
  const router = Router()
  // Apply auth only to this router's declared paths, leaving unrelated API routes alone.
  const auth = [requireSession(config), requireNoPendingPasswordChange]
  const write = requireCsrf(config)
  const owner = requireRole('ENCARGADO'), student = requireRole('BECARIO')
  const id = request => parse(usuarioIdSchema, request.params.id)
  const handle = fn => async (request, response, next) => {
    try { await fn(request, response, request.app.locals.pool) } catch (error) { next(error) }
  }
  router.get('/jobs', ...auth, handle(async (req, res, pool) => res.json(await listJobs(pool, parse(jobsQuerySchema, req.query)))))
  router.get('/me/jobs', ...auth, owner, handle(async (req, res, pool) => res.json(await listJobs(pool, parse(jobsQuerySchema, req.query), req.usuario.id))))
  router.get('/me/applications', ...auth, student, handle(async (req, res, pool) => res.json(await listApplications(pool, parse(applicationsQuerySchema, req.query), { actorId: req.usuario.id }))))
  router.post('/jobs', ...auth, owner, write, handle(async (req, res, pool) => res.status(201).json({ data: await createJob(pool, parse(jobFields, req.body), req.usuario.id) })))
  router.get('/jobs/:id', ...auth, handle(async (req, res, pool) => res.json({ data: await getJob(pool, id(req)) })))
  router.patch('/jobs/:id', ...auth, owner, write, handle(async (req, res, pool) => res.json({ data: await editJob(pool, id(req), parse(editJobSchema, req.body), req.usuario.id) })))
  router.post('/jobs/:id/applications', ...auth, student, write, handle(async (req, res, pool) => {
    parse(emptySchema, req.body)
    res.status(201).json({ data: await applyJob(pool, id(req), req.usuario.id) })
  }))
  router.get('/jobs/:id/applications', ...auth, owner, handle(async (req, res, pool) => res.json(await listApplications(pool, parse(applicationsQuerySchema, req.query), { jobId: id(req), actorId: req.usuario.id }))))
  for (const [action, state] of [['accept', 'ACEPTADA'], ['reject', 'RECHAZADA']]) {
    router.post(`/applications/:id/${action}`, ...auth, owner, write, handle(async (req, res, pool) => {
      parse(emptySchema, req.body)
      res.json({ data: await decideApplication(pool, id(req), req.usuario.id, state) })
    }))
  }
  return router
}
