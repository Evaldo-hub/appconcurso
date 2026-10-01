import assert from 'node:assert/strict'
import test from 'node:test'
import { assertManifestHash, hashManifestSource } from './hash'

test('mesmo manifesto após Preview é permitido', () => {
  const source = '{"schema_version":1}'
  assert.equal(assertManifestHash(source, hashManifestSource(source)), hashManifestSource(source))
})

test('manifesto alterado após Preview é bloqueado', () => {
  const hash = hashManifestSource('{"schema_version":1}')
  assert.throws(() => assertManifestHash('{"schema_version":2}', hash), /alterado após o Preview/)
})

test('SHA-256 considera exatamente os bytes UTF-8 usados no Preview', () => {
  assert.notEqual(hashManifestSource('{"a":1}'), hashManifestSource('{ "a": 1 }'))
  assert.match(hashManifestSource('ação'), /^[a-f0-9]{64}$/)
})
