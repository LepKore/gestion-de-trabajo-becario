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
  assert.match(path, /cookieAuth/)
  assert.match(path, /CsrfToken/)
  assert.match(path, /EvaluacionInput/)
  assert.match(path, /Evaluacion'/)
  for (const status of [201, 400, 401, 403, 404, 409]) {
    assert.match(path, new RegExp(`\\b${status}:`), `Falta respuesta ${status}`)
  }
  const input = section('    EvaluacionInput:', '    Evaluacion:')
  assert.match(input, /additionalProperties: false/)
  for (const name of ['responsabilidad', 'puntualidad', 'proactividad', 'comunicacion']) {
    assert.match(input, new RegExp(`${name}: \\{ type: integer, minimum: 1, maximum: 5 \\}`))
  }
})

it('documenta el rating exclusivo del becario y su respuesta', () => {
  const path = section('  /me/rating:', '  /applications/{id}/evaluation:')
  assert.match(path, /BECARIO/)
  assert.match(path, /cookieAuth/)
  assert.match(path, /RatingBecario/)
  for (const status of [200, 401, 403]) assert.match(path, new RegExp(`\\b${status}:`))
  const rating = section('    RatingBecario:', '    TrabajoInput:')
  for (const field of ['rating', 'trabajosRealizados', 'evaluacionesConsideradas', 'message']) {
    assert.match(rating, new RegExp(`\\b${field}:`))
  }
})
