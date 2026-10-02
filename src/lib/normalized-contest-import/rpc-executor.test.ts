import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { prepareNormalizedBootstrap } from './prepare'
import {
  NORMALIZED_IMPORT_RPC,
  SupabaseNormalizedImportExecutor,
  toNormalizedImportRpcPayload,
  validateNormalizedImportRpcPayload,
} from './rpc-executor'
import type { NormalizedImportRpcPayload } from './types'
import { parseTrt82026SourceText } from './trt8-source'

const realSourcePath = 'C:/Users/evaldo.cardoso/Documents/trt82026/conteudo-programatico.json'

test('converte o plano real sem duplicar conteudos ou vinculos', async () => {
  const parsed = parseTrt82026SourceText(await readFile(realSourcePath, 'utf8'))
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  const preparation = prepareNormalizedBootstrap(parsed.manifest, {
    legacyContestIdIgnored: true,
    declaredCommonBlocks: parsed.declaredCommonBlocks,
    examSchooling: parsed.examSchooling,
  })
  const payload = toNormalizedImportRpcPayload(preparation.plan)
  assert.equal(preparation.dryRun.logicalAssociations, 1770)
  assert.equal(payload.provas.length, 24)
  assert.equal(payload.conteudos.length, 248)
  assert.equal(payload.vinculos.length, 1770)
  assert.deepEqual(payload.contagens_esperadas, { provas: 24, conteudos: 248, vinculos: 1770 })
  assert.equal(new Set(payload.conteudos.map((row) => row.chave_canonica)).size, 248)
  assert.equal(new Set(payload.vinculos.map((row) => `${row.codigo_prova}\0${row.chave_canonica}`)).size, 1770)
  assert.ok(payload.vinculos.every((row) => row.origem === 'trt8-2026-manifest-v1'))
})

test('executor faz uma unica chamada RPC com o payload completo', async () => {
  const calls: unknown[] = []
  const executor = new SupabaseNormalizedImportExecutor({
    async rpc(name, args) {
      calls.push({ name, args })
      return {
        data: {
          concurso_id: 1,
          provas_total: 0, provas_inseridas: 0, provas_reutilizadas: 0,
          conteudos_total: 0, conteudos_inseridos: 0, conteudos_reutilizados: 0,
          vinculos_total: 0, vinculos_inseridos: 0, vinculos_reutilizados: 0,
        },
        error: null,
      }
    },
  })
  await executor.executeAtomically({
    contest: { slug: 'teste', nome: 'Teste', orgao: 'Orgao', banca: 'Banca', ano: 2026, edital: null, data_prova: null, descricao: null },
    exams: [{ code: 'P01', name: 'Prova', role: 'Cargo', specialty: null, shift: null, sourceFile: null, active: true }],
    catalog: [{ disciplina: 'Direito', assunto: null, subassunto: null, canonicalKey: 'a'.repeat(64), normalizationVersion: 'canonical-v1', active: true }],
    links: [{ examCode: 'P01', canonicalKey: 'a'.repeat(64), active: true, disciplineOrder: 1, subjectOrder: null, subsubjectOrder: null, order: 1, origin: 'trt8-2026-manifest-v1' }],
    origin: 'trt8-2026-manifest-v1',
  })
  assert.equal(calls.length, 1)
  assert.equal((calls[0] as { name: string }).name, NORMALIZED_IMPORT_RPC)
})

test('validador local rejeita coercoes e referencias ausentes', () => {
  const base = {
    concurso: { slug: 'teste', nome: 'Teste', orgao: 'Orgao', banca: 'Banca', ano: 2026, edital: null, data_prova: null, descricao: null },
    provas: [{ codigo_prova: 'P01', nome: 'Prova', cargo: null, especialidade: null, turno: null, arquivo_origem: null, ativo: true }],
    conteudos: [{ disciplina: 'Direito', assunto: null, subassunto: null, chave_canonica: 'a'.repeat(64), versao_normalizacao: 'canonical-v1', ativo: true }],
    vinculos: [{ codigo_prova: 'P01', chave_canonica: 'a'.repeat(64), ativo: true, disciplina_ordem: 1, assunto_ordem: null, subassunto_ordem: null, ordem: 1, origem: 'trt8-2026-manifest-v1' }],
    contagens_esperadas: { provas: 1, conteudos: 1, vinculos: 1 },
  } satisfies NormalizedImportRpcPayload
  validateNormalizedImportRpcPayload(base)
  assert.throws(() => validateNormalizedImportRpcPayload({
    ...base,
    contagens_esperadas: { ...base.contagens_esperadas, provas: '1' },
  } as unknown as NormalizedImportRpcPayload))
  assert.throws(() => validateNormalizedImportRpcPayload({
    ...base,
    vinculos: [{ ...base.vinculos[0], codigo_prova: 'AUSENTE' }],
  }))
})
