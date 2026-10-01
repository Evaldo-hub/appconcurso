import assert from 'node:assert/strict'
import test from 'node:test'
import { hashManifestSource } from './hash'
import { decodeManifestSource, encodeManifestSource } from './source-transport'

test('Base64 preserva source com LF e conteúdo Unicode em UTF-8', () => {
  const original = '{\n  "cargo": "Área Judiciária – Tecnologia da Informação"\n}\n'
  assert.equal(original.includes('\r'), false)
  assert.equal(original.includes('\n'), true)

  const transported = encodeManifestSource(original)
  assert.equal(transported.includes('\n'), false)

  const recovered = decodeManifestSource(transported)
  assert.equal(recovered, original)
  assert.deepEqual(Buffer.from(recovered, 'utf8'), Buffer.from(original, 'utf8'))
  assert.equal(hashManifestSource(recovered), hashManifestSource(original))
})

test('decode rejeita Base64 inválida', () => {
  assert.throws(() => decodeManifestSource('não-é-base64'), /conteúdo codificado/)
})
