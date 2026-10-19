import { test } from 'node:test'
import assert from 'node:assert/strict'
import { databaseUrl } from './helpers.js'

test('pruebas nunca usan implícitamente la base de desarrollo', () => {
  assert.throws(() => databaseUrl({ DATABASE_URL: 'postgresql://dev:dev@localhost/mibeca_dev' }), /TEST_DATABASE_URL/)
})

test('pruebas rechazan bases de desarrollo y hosts remotos aunque haya override', () => {
  for (const url of ['postgresql://dev:dev@localhost/mibeca_dev', 'postgresql://test:test@remote.invalid/mibeca_test']) {
    assert.throws(() => databaseUrl({ TEST_DATABASE_URL: url, TEST_ALLOW_REMOTE: 'true' }), /local descartable/)
  }
})

test('pruebas aceptan únicamente destino local de pruebas explícito', () => {
  const url = 'postgresql://test:test@127.0.0.1:55439/mibeca_fase3_test'
  assert.equal(databaseUrl({ TEST_DATABASE_URL: url }), url)
})
