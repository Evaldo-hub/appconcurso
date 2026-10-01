import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { formatRagRetrievalCliResult, parseRagRetrievalCliArguments } from './rag-retrieval-cli'
import type { RagRetrievalResult } from '../src/lib/rag/types'

const validArgs = ['--concurso-id', '7', '--prova-id', '10', '--disciplina', ' Direito Constitucional ', '--assunto', ' Constituição Federal ', '--query', ' direitos fundamentais ']

test('argumentos válidos preservam prova e tornam subassunto opcional', () => {
  assert.deepEqual(parseRagRetrievalCliArguments(validArgs), {
    concursoId: 7,
    provaId: 10,
    disciplina: 'Direito Constitucional',
    assunto: 'Constituição Federal',
    subassunto: null,
    query: 'direitos fundamentais',
  })
  assert.equal(parseRagRetrievalCliArguments([...validArgs, '--subassunto', ' Artigo 5 ']).subassunto, 'Artigo 5')
  assert.equal(parseRagRetrievalCliArguments([...validArgs, '--limit', '5']).limit, 5)
})

test('argumentos inválidos falham antes do retrieval', () => {
  for (const args of [[], [...validArgs.slice(0, 1), '0', ...validArgs.slice(2)], validArgs.filter((item) => item !== '--query' && item !== ' direitos fundamentais ')]) {
    assert.throws(() => parseRagRetrievalCliArguments(args))
  }
})

test('saída contém somente metadados sanitizados', () => {
  const result: RagRetrievalResult = {
    query: 'segredo da consulta', provider: 'google', model: 'gemini-embedding-2', dimensions: 768,
    matches: [{ documentId: 1, materialId: 8, ingestionId: 22, concursoId: 7, provaId: null, content: 'conteúdo integral proibido', similarity: 0.91, arquivoOrigem: 'cf.pdf', githubPath: 'materiais/cf.pdf', pagina: 5, chunkIndex: 4, disciplina: 'Direito Constitucional', assunto: 'Constituição Federal', subassunto: null, embeddingModel: 'gemini-embedding-2' }],
  }
  const output = JSON.stringify(formatRagRetrievalCliResult(result))
  assert.match(output, /"material_id":8/)
  assert.match(output, /"ingestion_id":22/)
  assert.doesNotMatch(output, /conteúdo integral proibido|segredo da consulta|embeddingModel|values/)
})

test('worker adapta somente retrieveRagContext e não possui escrita ou geração', async () => {
  const worker = await readFile('scripts/run-rag-retrieval-worker.ts', 'utf8')
  assert.match(worker, /retrieveRagContext\(input\)/)
  assert.doesNotMatch(worker, /\.from\(|\.rpc\(|insert|update|delete|upsert|persist|generate|semantic/i)
})

test('RPC produtiva preserva materiais gerais no escopo de prova', async () => {
  const sql = await readFile('supabase/migrations/20260929_023_fix_rag_retrieval_candidate_limit.sql', 'utf8')
  assert.match(sql, /p_prova_id is not null[\s\S]*m\.prova_id is null[\s\S]*m\.prova_id = p_prova_id/i)
})
