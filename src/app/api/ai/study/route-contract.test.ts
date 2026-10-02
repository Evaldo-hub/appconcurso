import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeUrl = new URL('./route.ts', import.meta.url)

test('rota preserva autenticação, autorização, rate limit e persistência', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /supabase\.auth\.getUser\(\)/)
  assert.match(source, /'usuario_tem_acesso'/)
  assert.match(source, /'consumir_limite_integracao'/)
  assert.match(source, /'obter_estudo_questao_seguro'/)
  assert.match(source, /\.from\('estudo_questao'\)/)
  assert.match(source, /\.from\('conversas_estudo_ia'\)/)
})

test('rota usa contexto RAG nativo e não referencia Edge Function ou n8n', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /buildStudyRagContext/)
  assert.match(source, /contexto: rag\.contextText/)
  assert.match(source, /fontes: rag\.sources/)
  assert.doesNotMatch(source, /functions\.invoke|N8N_|webhook/i)
})

test('rota não devolve detalhes técnicos de provider ao navegador', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /'Não foi possível gerar o conteúdo\.'/)
  assert.match(source, /study_ai_error/)
  assert.match(source, /\[REDACTED\]/)
})
