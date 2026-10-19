import { z } from 'zod'
import { badRequest } from './errors.js'

// Esquemas de entrada alineados con openapi.yaml. El contrato es la referencia;
// estos objetos son su espejo ejecutable, no una fuente independiente.

const correo = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .transform((value) => value.toLowerCase())

const codigo = z
  .string()
  .trim()
  .regex(/^[0-9]{5}$/, 'El código debe tener exactamente cinco dígitos')

const minutos = z.coerce
  .number()
  .int('Las horas deben ser enteras en minutos')
  .min(6)
  .refine((value) => value % 6 === 0, 'Las horas deben ser múltiplo de seis minutos')

export const loginSchema = z
  .object({ correo, password: z.string().min(1).max(200) })
  .strict()

export const changePasswordSchema = z
  .object({
    passwordActual: z.string().min(1).max(200),
    passwordNuevo: z.string().min(1).max(200),
    passwordNuevoConfirmacion: z.string().min(1).max(200),
  })
  .strict()

const rol = z.enum(['ADMIN', 'ENCARGADO', 'BECARIO'])

const contextoTipo = z.enum(['MATERIA', 'FACULTAD', 'AREA'])

const nombre = z.string().trim().min(3).max(120)

export const perfilEstudianteInput = z
  .object({
    codigo,
    carrera: z.string().trim().min(2).max(120),
    semestre: z.coerce.number().int().min(1).max(12),
    metaMinutos: minutos,
  })
  .strict()

export const perfilEncargadoInput = z
  .object({ contextoTipo, contextoNombre: z.string().trim().min(2).max(120) })
  .strict()

export const nuevoUsuarioSchema = z
  .object({
    nombre,
    correo,
    rol,
    estudiante: perfilEstudianteInput.optional(),
    encargado: perfilEncargadoInput.optional(),
  })
  .strict()

export const editarUsuarioSchema = z
  .object({
    nombre: nombre.optional(),
    correo: correo.optional(),
    estudiante: perfilEstudianteInput.optional(),
    encargado: perfilEncargadoInput.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Indica al menos un campo a modificar')

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

export const listarUsuariosSchema = z.object({
  rol: rol.optional(),
  activo: booleanQuery.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export const usuarioIdSchema = z.string().uuid('Identificador de usuario inválido')

// Convierte un ZodError en el 400 del contrato, con mensajes por campo.
export function parse(schema, value, message = 'La solicitud no es válida.') {
  const result = schema.safeParse(value)
  if (!result.success) {
    const detalles = result.error.issues.map((issue) => {
      const campo = issue.path.join('.')
      return campo ? `${campo}: ${issue.message}` : issue.message
    })
    throw badRequest(message, detalles)
  }
  return result.data
}