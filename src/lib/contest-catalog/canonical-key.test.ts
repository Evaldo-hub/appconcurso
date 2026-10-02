import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CATALOG_NORMALIZATION_VERSION,
  createCatalogCanonicalKey,
  normalizeCatalogHierarchy,
  serializeCatalogIdentity,
} from './canonical-key'

test('canonical-v1 normaliza NFC, caixa e espaços preservando acentos', () => {
  const first = createCatalogCanonicalKey({
    disciplina: 'Língua Portuguesa',
    assunto: 'Interpretação de Texto',
    subassunto: null,
  })
  const second = createCatalogCanonicalKey({
    disciplina: '  LÍNGUA   PORTUGUESA ',
    assunto: ' interpretação   de texto ',
    subassunto: null,
  })

  assert.equal(CATALOG_NORMALIZATION_VERSION, 'canonical-v1')
  assert.equal(first, second)
  assert.equal(first, '5bf18320e446da6bcbc65785cd9af54a8e23c4e92400d1c598a999ad7558bccc')
  assert.match(first, /^[0-9a-f]{64}$/)
})

test('identidade distingue null de vazio, mas persistência converte vazio em null', () => {
  const withNull = serializeCatalogIdentity({
    disciplina: 'Direito Constitucional',
    assunto: null,
    subassunto: null,
  })
  const withEmpty = serializeCatalogIdentity({
    disciplina: 'Direito Constitucional',
    assunto: '',
    subassunto: null,
  })

  assert.notEqual(withNull, withEmpty)
  assert.deepEqual(
    normalizeCatalogHierarchy({ disciplina: 'Direito Constitucional', assunto: '   ', subassunto: null }),
    { disciplina: 'Direito Constitucional', assunto: null, subassunto: null },
  )
})

test('não remove pontuação nem palavras', () => {
  const simple = createCatalogCanonicalKey({
    disciplina: 'Direito Constitucional',
    assunto: null,
    subassunto: null,
  })
  const qualified = createCatalogCanonicalKey({
    disciplina: 'Direito Constitucional - Constituição Federal',
    assunto: null,
    subassunto: null,
  })

  assert.notEqual(simple, qualified)
  assert.deepEqual(
    normalizeCatalogHierarchy({ disciplina: '  Língua   Portuguesa ', assunto: null, subassunto: '' }),
    { disciplina: 'Língua Portuguesa', assunto: null, subassunto: null },
  )
})

test('rejeita disciplina vazia e hierarquia inválida', () => {
  assert.throws(
    () => normalizeCatalogHierarchy({ disciplina: '   ', assunto: null, subassunto: null }),
    /Disciplina é obrigatória/,
  )
  assert.throws(
    () => normalizeCatalogHierarchy({ disciplina: 'Direito', assunto: null, subassunto: 'Constituição' }),
    /Subassunto exige assunto/,
  )
})
