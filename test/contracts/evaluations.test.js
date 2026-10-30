import { readFile } from 'node:fs/promises'
import { it } from 'node:test'
import assert from 'node:assert/strict'

const contract = await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8')

function section(start, next) {
  const from = contract.indexOf(start)
  assert.notEqual(from, -1, `Falta ${start} en openapi.yaml`)
  const to = contract.indexOf(next, from + start.length)
  assert.notEqual(to, -1, `No se pudo delimitar ${start}`)
  return contract.slice(from, to)
}

it('documenta la evaluación con CSRF, rol propietario, cuerpo estricto y errores', () => {
  const path = section('  /applications/{id}/evaluation:', '  /jobs/{id}/close:')
  assert.match(path, /post:/)
  assert.match(path, /ENCARGADO propietario/)
  assert.match(path, /trabajo CERRADO/)
  assert.match(path, /asistencia confirmada/)
  assert.match(path, /no modifica horas/)
  assert.match(path, /cookieAuth/)
  assert.match(path, /CsrfToken/)
  assert.match(path, /EvaluacionInput/)
  assert.match(path, /Evaluacion'/)
  assert.doesNotMatch(path, /^\s{4}(?:get|put|patch|delete):/m)
  for (const status of [201, 400, 401, 403, 404, 409]) {
    assert.match(path, new RegExp(`\\b${status}:`), `Falta respuesta ${status}`)
  }
  for (const [status, response] of Object.entries({
    400: 'ErrorValidacion', 401: 'ErrorNoAutorizado', 403: 'ErrorProhibido',
    404: 'ErrorNoEncontrado', 409: 'ErrorConflicto',
  })) {
    const line = path.split('\n').find(candidate => new RegExp(`^\\s+${status}:`).test(candidate))
    assert.ok(line?.includes(response), `La respuesta ${status} debe referenciar ${response}`)
  }
  const input = section('    EvaluacionInput:', '    Evaluacion:')
  assert.match(input, /additionalProperties: false/)
  for (const name of ['responsabilidad', 'puntualidad', 'proactividad', 'comunicacion']) {
    assert.match(input, new RegExp(`${name}: \\{ type: integer, minimum: 1, maximum: 5 \\}`))
  }
  const output = section('    Evaluacion:', '    RatingBecario:')
  for (const field of ['id', 'postulacionId', 'promedio', 'creadoEn']) {
    assert.match(output, new RegExp(`\\b${field}:`))
  }
})

it('documenta el rating exclusivo del becario y su respuesta', () => {
  const path = section('  /me/rating:', '  /applications/{id}/evaluation:')
  assert.match(path, /Solo BECARIO autenticado/)
  assert.match(path, /cookieAuth/)
  assert.match(path, /RatingBecario/)
  for (const status of [200, 401, 403]) assert.match(path, new RegExp(`\\b${status}:`))
  assert.match(path, /ErrorNoAutorizado/)
  assert.match(path, /ErrorProhibido/)
  const rating = section('    RatingBecario:', '    TrabajoInput:')
  for (const field of ['rating', 'trabajosRealizados', 'evaluacionesConsideradas', 'message']) {
    assert.match(rating, new RegExp(`\\b${field}:`))
  }
  assert.match(rating, /type: \[number, 'null'\]/)
  assert.match(rating, /type: \[string, 'null'\]/)
  assert.match(rating, /faltan realizar trabajos/)
})
