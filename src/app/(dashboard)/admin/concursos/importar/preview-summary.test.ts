import assert from 'node:assert/strict'
import test from 'node:test'
import type { ContestManifestPreview, DiffStatus, PreviewItem } from '@/lib/contest-manifest/types'
// Node's native TypeScript test runner requires the explicit extension.
// @ts-expect-error The project compiles with noEmit, so this import is never emitted.
import { summarizePreviewDifferences } from './preview-summary.ts'

const items = (status: DiffStatus, quantity: number): PreviewItem[] =>
  Array.from({ length: quantity }, (_, index) => ({ chave: `${status}-${index}`, titulo: `${status} ${index}`, status }))

test('consolida os status já calculados pelo Preview por categoria e no total', () => {
  const preview = {
    concurso: { id: 1, slug: 'trt8', nome: 'TRT8', orgao: 'TRT8', banca: 'Cebraspe', ano: 2026, status: 'sem_alteracao' },
    resumo: { provas: 20, disciplinas: 0, assuntos: 0, subassuntos: 0, materiais: 0 },
    provas: items('sem_alteracao', 20),
    conteudos: items('sem_alteracao', 107),
    materiais: items('somente_supabase', 2),
    detalhes_provas: [],
  } satisfies ContestManifestPreview

  assert.deepEqual(summarizePreviewDifferences(preview), {
    concurso: { inserir: 0, atualizar: 0, sem_alteracao: 1, somente_supabase: 0 },
    provas: { inserir: 0, atualizar: 0, sem_alteracao: 20, somente_supabase: 0 },
    conteudos: { inserir: 0, atualizar: 0, sem_alteracao: 107, somente_supabase: 0 },
    materiais: { inserir: 0, atualizar: 0, sem_alteracao: 0, somente_supabase: 2 },
    total: { inserir: 0, atualizar: 0, sem_alteracao: 128, somente_supabase: 2 },
  })
})

test('apresenta concurso novo como inserção e concurso alterado como atualização', () => {
  const base = {
    id: null,
    slug: 'concurso',
    nome: 'Concurso',
    orgao: 'Órgão',
    banca: 'Banca',
    ano: 2026,
  }
  const preview = {
    concurso: { ...base, status: 'novo' },
    resumo: { provas: 0, disciplinas: 0, assuntos: 0, subassuntos: 0, materiais: 0 },
    provas: [],
    conteudos: [],
    materiais: [],
    detalhes_provas: [],
  } satisfies ContestManifestPreview

  assert.equal(summarizePreviewDifferences(preview).total.inserir, 1)
  assert.equal(summarizePreviewDifferences({ ...preview, concurso: { ...base, status: 'alterado' } }).total.atualizar, 1)
})
