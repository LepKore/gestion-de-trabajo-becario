import { it } from 'node:test'
import assert from 'node:assert/strict'
import { averageEvaluations, selectLastRealized } from '../src/services/jobs.js'

it('selecciona los diez trabajos realizados más recientes con desempate estable', () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ postulacion_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, cerrado_en: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` }))
  assert.equal(selectLastRealized(rows).length, 10)
  assert.equal(selectLastRealized(rows)[0].postulacion_id, rows[10].postulacion_id)
})

it('promedia solo evaluaciones disponibles y no convierte ausencias en cero', () => {
  assert.equal(averageEvaluations([{ promedio: '4.00' }, { promedio: null }, { promedio: '5.00' }]), 4.5)
  assert.equal(averageEvaluations([{ promedio: null }]), null)
})
