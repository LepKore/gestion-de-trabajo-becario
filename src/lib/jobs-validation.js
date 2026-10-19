import { z } from 'zod'

const instant = z.string().datetime({ offset: true })
export const jobFields = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().min(3).max(4000),
  ubicacion: z.string().trim().min(2).max(200),
  inicioPrevisto: instant,
  finPrevisto: instant,
  duracionMinutos: z.number().int().min(6).max(2147483646).multipleOf(6),
  cupos: z.number().int().min(1).max(2147483647),
}).strict()
export const editJobSchema = jobFields.partial().refine(value => Object.keys(value).length > 0, 'Indica al menos un campo')
export const emptySchema = z.object({}).strict()
const pagination = { page: z.coerce.number().int().min(1).max(2147483647).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }
export const jobsQuerySchema = z.object({ ...pagination, estado: z.enum(['PUBLICADO', 'CERRADO']).optional(), q: z.string().trim().min(1).max(100).optional() }).strict()
export const applicationsQuerySchema = z.object({ ...pagination, estado: z.enum(['PENDIENTE', 'ACEPTADA', 'RECHAZADA']).optional() }).strict()
