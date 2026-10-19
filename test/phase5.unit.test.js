import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { listStudentProgress } from '../src/services/student-progress.js'
import { getOwnerDashboard } from '../src/services/control.js'

describe('resúmenes de fase 5', () => {
  it('calcula faltantes/excedentes y pasa filtros seguros a las consultas de progreso', async () => {
    const calls = []
    const pool = { query: async (sql, values) => {
      calls.push({ sql, values })
      if (calls.length === 1) return { rows: [{ total: 1 }] }
      return { rows: [{
        id: 'student-id', nombre: 'Ana Pérez', correo: 'ana@uni.edu', codigo: '00731',
        carrera: 'Sistemas', semestre: 4, meta_minutos: 120, acreditados: '180',
      }] }
    } }
    const result = await listStudentProgress(pool, { q: 'ANA', conHorasPendientes: false, page: 1, pageSize: 20 })

    assert.equal(calls.length, 2)
    assert.deepEqual(calls[0].values, ['%ana%', false])
    assert.match(calls[0].sql, /resumen\.acreditados >= resumen\.meta_minutos/)
    assert.deepEqual(result.data[0], {
      id: 'student-id', name: 'Ana Pérez', email: 'ana@uni.edu', code: '00731',
      career: 'Sistemas', semester: 4, targetMinutes: 120, accreditedMinutes: 180,
      remainingMinutes: 0, excessMinutes: 60,
    })
    assert.deepEqual(result.meta, { page: 1, pageSize: 20, total: 1, totalPages: 1 })
  })

  it('devuelve totales en cero y páginas vacías de forma estable', async () => {
    const pool = { query: async (_sql, values) => values.length === 2
      ? { rows: [{ total: 0 }] }
      : { rows: [] } }
    const result = await listStudentProgress(pool, { q: undefined, conHorasPendientes: undefined, page: 2, pageSize: 10 })
    assert.deepEqual(result, { data: [], meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 } })
  })

  it('mapea el resumen agregado del encargado sin ampliar su alcance', async () => {
    let values
    const pool = { query: async (_sql, args) => {
      values = args
      return { rows: [{ total_jobs: 8, published_jobs: 5, closed_jobs: 3, pending_close_jobs: 1, pending_applications: 2, accepted_students: 6 }] }
    } }
    const result = await getOwnerDashboard(pool, 'owner-id')
    assert.deepEqual(values, ['owner-id'])
    assert.deepEqual(result, { totalJobs: 8, publishedJobs: 5, closedJobs: 3, pendingCloseJobs: 1, pendingApplications: 2, acceptedStudents: 6 })
  })
})
