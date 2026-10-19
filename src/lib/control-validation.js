import { z } from 'zod'

const applicationId = z.string().uuid().transform(value => value.toLowerCase())

export const closeSchema = z.object({
  attendance: z.array(z.object({ applicationId, attended: z.boolean() }).strict()),
}).strict().superRefine((value, context) => {
  const seen = new Set()
  for (const [index, entry] of value.attendance.entries()) {
    if (seen.has(entry.applicationId)) {
      context.addIssue({ code: 'custom', path: ['attendance', index, 'applicationId'], message: 'La postulacion esta duplicada' })
    }
    seen.add(entry.applicationId)
  }
})

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9._-]{8,128}$/)

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict()

const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true')

export const studentProgressQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  conHorasPendientes: booleanQuery.optional(),
  page: z.coerce.number().int().min(1).max(2147483647).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict()
