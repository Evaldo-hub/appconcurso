import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = readFile('src/lib/contest-catalog/queries.ts', 'utf8')
const adapter = readFile('src/lib/study/rag-selection-catalog.ts', 'utf8')

test('catálogo resolve TRT8 por slug e não hardcoda o ID remoto', async () => {
  assert.match(await adapter, /loadAuthorizedNormalizedCatalogBySlug\('trt8-2026'\)/)
  assert.doesNotMatch(await source, /(?:contestId|concurso_id)\s*[=:]\s*15\b/)
  assert.doesNotMatch(await adapter, /(?:contestId|concurso_id)\s*[=:]\s*15\b/)
})

test('camada preserva autenticação e autorização APP-3.3 no servidor', async () => {
  const code = await source
  assert.match(code, /userClient\.auth\.getUser\(\)/)
  assert.match(code, /userClient\.rpc\('usuario_pode_acessar_concurso'/)
  assert.match(code, /allowed !== true/)
})

test('camada consulta somente catálogo normalizado', async () => {
  const code = await source
  assert.match(code, /from\('prova_conteudos'\)/)
  assert.match(code, /from\('conteudos_catalogo'\)/)
  assert.doesNotMatch(code, /from\('conteudo_programatico'\)/)
  assert.doesNotMatch(code, /materiais_concurso|rag_ingestoes|documents/)
})
