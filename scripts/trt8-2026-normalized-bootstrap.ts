import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { prepareNormalizedBootstrap } from '../src/lib/normalized-contest-import/prepare'
import {
  SupabaseNormalizedImportExecutor,
  toNormalizedImportRpcPayload,
} from '../src/lib/normalized-contest-import/rpc-executor'
import { parseTrt82026SourceText } from '../src/lib/normalized-contest-import/trt8-source'

const EXPECTED_SOURCE_SHA256 = '49e7ba4b33f78e2da95a8f6abf2522db6ad4891b2816690c2950b328417554a5'
const EXPECTED_COUNTS = { provas: 24, conteudos: 248, vinculos: 1770 } as const
const DEFAULT_SOURCE = 'C:/Users/evaldo.cardoso/Documents/trt82026/conteudo-programatico.json'

async function main() {
const execute = process.argv.includes('--execute')
const sourceArgument = process.argv.slice(2).find((argument) => argument !== '--execute')
const sourcePath = resolve(sourceArgument ?? DEFAULT_SOURCE)
const sourceBuffer = await readFile(sourcePath)
const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
if (sourceHash !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`TRT8_SOURCE_HASH_MISMATCH: esperado ${EXPECTED_SOURCE_SHA256}, recebido ${sourceHash}`)
}

const parsed = parseTrt82026SourceText(sourceBuffer.toString('utf8'))
if (!parsed.success) throw new Error(`TRT8_SOURCE_INVALID: ${JSON.stringify(parsed.errors)}`)
const preparation = prepareNormalizedBootstrap(parsed.manifest, {
  legacyContestIdIgnored: true,
  declaredCommonBlocks: parsed.declaredCommonBlocks,
  examSchooling: parsed.examSchooling,
})
const payload = toNormalizedImportRpcPayload(preparation.plan)
if (payload.provas.length !== EXPECTED_COUNTS.provas
    || payload.conteudos.length !== EXPECTED_COUNTS.conteudos
    || payload.vinculos.length !== EXPECTED_COUNTS.vinculos) {
  throw new Error(`TRT8_PLAN_COUNT_MISMATCH: ${JSON.stringify(payload.contagens_esperadas)}`)
}

const linksByContent = new Map<string, Set<string>>()
for (const link of payload.vinculos) {
  const exams = linksByContent.get(link.chave_canonica) ?? new Set<string>()
  exams.add(link.codigo_prova)
  linksByContent.set(link.chave_canonica, exams)
}
const shared = payload.conteudos
  .map((content) => ({ ...content, quantidade_provas: linksByContent.get(content.chave_canonica)?.size ?? 0 }))
  .filter((content) => content.quantidade_provas > 1)
const sourceExamByCode = new Map(parsed.source.provas.map((exam) => [exam.codigo_prova, exam]))
const examRows = payload.provas.map((exam) => ({
  codigo_prova: exam.codigo_prova,
  cargo: exam.cargo,
  especialidade: exam.especialidade,
  quantidade_conteudos: payload.vinculos.filter((link) => link.codigo_prova === exam.codigo_prova).length,
}))
const examsWithComputing = parsed.source.provas
  .filter((exam) => exam.disciplinas.some((discipline) => discipline.nome === 'Noções de Informática'))
  .map((exam) => exam.codigo_prova)
const examsWithoutComputing = parsed.source.provas
  .filter((exam) => !exam.disciplinas.some((discipline) => discipline.nome === 'Noções de Informática'))
  .map((exam) => exam.codigo_prova)

if (shared.length !== 103
    || examsWithComputing.length !== 22
    || examsWithoutComputing.join(',') !== 'TRT8-2026-C04,TRT8-2026-C23'
    || payload.provas.some((exam) => !sourceExamByCode.has(exam.codigo_prova))) {
  throw new Error('TRT8_AUDIT_INVARIANT_MISMATCH')
}

console.log(JSON.stringify({
  mode: execute ? 'execute' : 'dry-run',
  source: sourcePath,
  sourceSha256: sourceHash,
  contest: { slug: payload.concurso.slug, legacyContestIdIgnored: parsed.legacyContestId },
  counts: { concursos: 1, ...payload.contagens_esperadas, conteudos_compartilhados: shared.length },
  provas: examRows,
  informatica: { provas_com: examsWithComputing, provas_sem: examsWithoutComputing, derivado_da_fonte: true },
  exemplos_compartilhados: shared
    .filter((content) => content.disciplina === 'Língua Portuguesa')
    .slice(0, 10)
    .map(({ disciplina, assunto, subassunto, quantidade_provas }) => ({ disciplina, assunto, subassunto, quantidade_provas })),
  payloadValidado: true,
}, null, 2))

if (!execute) {
  console.log('DRY_RUN_ONLY: nenhuma chamada Supabase/RPC foi realizada.')
} else {
  const { loadEnvConfig } = await import('@next/env')
  loadEnvConfig(resolve('.'))
  const { createAdminClient } = await import('../src/lib/supabase/admin-core')
  const admin = createAdminClient()
  const executor = new SupabaseNormalizedImportExecutor({
    rpc: (name, args) => admin.rpc(name, args),
  })
  const result = await executor.executeAtomically(preparation.plan)
  const expected = {
    provas_total: 24, provas_inseridas: 24, provas_reutilizadas: 0,
    conteudos_total: 248, conteudos_inseridos: 248, conteudos_reutilizados: 0,
    vinculos_total: 1770, vinculos_inseridos: 1770, vinculos_reutilizados: 0,
  }
  for (const [field, value] of Object.entries(expected)) {
    if (result[field as keyof typeof result] !== value) {
      throw new Error(`TRT8_RPC_RESULT_MISMATCH: ${field}`)
    }
  }
  console.log(JSON.stringify({ rpcExecutada: true, result }, null, 2))
}
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
