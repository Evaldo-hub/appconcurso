import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildUniversalPreview, fetchAllContestRows } from './preview'
import type { ContestFile, ProgramFile } from './types'

const contest: ContestFile = { concurso_id: 9, nome: 'Concurso', orgao: 'Órgão', banca: 'Banca', ano: 2026, edital: '001' }
const program: ProgramFile = { schema_version: '1.0', concurso_id: 9, provas: [{ codigo_prova: 'C01', cargo: 'Professor', especialidade: null, turno: null, disciplinas: [{ nome: 'Português', ordem: 1, assuntos: [{ nome: 'Texto', ordem: 1, subassuntos: [] }] }] }] }

class Query {
  private filters: Array<[string, unknown]> = []
  private requestedRange: [number, number] | null = null
  constructor(private rows: Record<string, unknown>[], private table: string, private ranges: Array<{ table: string; from: number; to: number }>) {}
  select() { return this }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  order() { return this }
  range(from: number, to: number) { this.requestedRange = [from, to]; this.ranges.push({ table: this.table, from, to }); return this }
  private result() {
    const filtered = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    return this.requestedRange ? filtered.slice(this.requestedRange[0], this.requestedRange[1] + 1) : filtered
  }
  async maybeSingle() { const rows = this.result(); return { data: rows[0] ?? null, error: rows.length > 1 ? { message: 'multiple' } : null } }
  then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) { return Promise.resolve({ data: this.result(), error: null }).then(resolve) }
}
function database(proofs: Record<string, unknown>[] = [], contents: Record<string, unknown>[] = [], contests: Record<string, unknown>[] = [{ id: 9, nome: 'Concurso', orgao: 'Órgão', banca: 'Banca', ano: 2026, edital: '001' }], ranges: Array<{ table: string; from: number; to: number }> = []) {
  const tables: Record<string, Record<string, unknown>[]> = { concursos: contests, provas: proofs, conteudo_programatico: contents }
  return { from: (table: string) => new Query(tables[table] ?? [], table, ranges) } as unknown as SupabaseClient
}

test('prova nova e conteúdo novo aparecem no Preview', async () => {
  const preview = await buildUniversalPreview(contest, program, database())
  assert.equal(preview.provas[0].status, 'novo')
  assert.equal(preview.conteudos.every((item) => item.status === 'novo'), true)
})
test('prova e conteúdo existentes tornam a repetição idempotente', async () => {
  const proof = { id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: null, turno: null }
  const contents = [
    { concurso_id: 9, prova_id: 2, disciplina: 'Português', assunto: null, subassunto: null, disciplina_ordem: 1, assunto_ordem: null, subassunto_ordem: null },
    { concurso_id: 9, prova_id: 2, disciplina: 'Português', assunto: 'Texto', subassunto: null, disciplina_ordem: 1, assunto_ordem: 1, subassunto_ordem: null },
  ]
  const preview = await buildUniversalPreview(contest, program, database([proof], contents))
  assert.equal(preview.contagens.novo, 0)
  assert.equal(preview.contagens.atualizavel, 0)
  assert.equal(preview.contagens.existente, 3)
})
test('cargo ou especialidade incompatível bloqueia a importação', async () => {
  const preview = await buildUniversalPreview(contest, program, database([{ id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: 'História', turno: null }]))
  assert.equal(preview.provas[0].status, 'conflito')
  assert.equal(preview.bloqueado, true)
})
test('concurso_id divergente é rejeitado', async () => {
  await assert.rejects(() => buildUniversalPreview({ ...contest, nome: 'Outro' }, program, database()), /pertence a outro concurso/)
})
test('especialidade vazia no banco equivale a null do arquivo', async () => {
  const preview = await buildUniversalPreview(contest, program, database([{ id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: '', turno: null }]))
  assert.equal(preview.provas[0].status, 'existente')
})
test('turno vazio no banco equivale a null do arquivo', async () => {
  const preview = await buildUniversalPreview(contest, program, database([{ id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: null, turno: '' }]))
  assert.equal(preview.provas[0].status, 'existente')
})
test('edital vazio no banco equivale a null do arquivo sem concurso_id', async () => {
  const file = { ...contest, concurso_id: undefined, edital: null }
  const programWithoutId = { ...program, concurso_id: undefined }
  const preview = await buildUniversalPreview(file, programWithoutId, database([], [], [{ id: 9, nome: 'Concurso', orgao: 'Órgão', banca: 'Banca', ano: 2026, edital: '' }]))
  assert.equal(preview.concurso.id, 9)
})
test('assunto e subassunto vazios ou com espaços equivalem a null', async () => {
  const proof = { id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: null, turno: null }
  for (const empty of ['', '   ']) {
    const preview = await buildUniversalPreview(contest, program, database([proof], [
      { concurso_id: 9, prova_id: 2, disciplina: 'Português', assunto: empty, subassunto: empty, disciplina_ordem: 1, assunto_ordem: null, subassunto_ordem: null },
      { concurso_id: 9, prova_id: 2, disciplina: 'Português', assunto: 'Texto', subassunto: empty, disciplina_ordem: 1, assunto_ordem: 1, subassunto_ordem: null },
    ]))
    assert.equal(preview.conteudos.every((item) => item.status === 'existente'), true)
  }
})
test('especialidades textuais diferentes continuam em conflito', async () => {
  const specializedProgram = structuredClone(program)
  specializedProgram.provas[0].especialidade = 'História'
  const preview = await buildUniversalPreview(contest, specializedProgram, database([{ id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: 'Matemática', turno: null }]))
  assert.equal(preview.provas[0].status, 'conflito')
})
test('turnos textuais diferentes continuam atualizáveis', async () => {
  const shiftedProgram = structuredClone(program)
  shiftedProgram.provas[0].turno = 'Vespertino'
  const preview = await buildUniversalPreview(contest, shiftedProgram, database([{ id: 2, concurso_id: 9, codigo_prova: 'C01', cargo: 'Professor', especialidade: null, turno: 'Matutino' }]))
  assert.equal(preview.provas[0].status, 'atualizavel')
})

for (const [total, expectedPages] of [[1000, 2], [1307, 2], [2305, 3]] as const) {
  test(`pagina todos os ${total} conteúdos em ${expectedPages} requisições`, async () => {
    const ranges: Array<{ table: string; from: number; to: number }> = []
    const contents = Array.from({ length: total }, (_, index) => ({ id: index + 1, concurso_id: 9 }))
    const admin = database([], contents, undefined, ranges)
    const rows = await fetchAllContestRows<Record<string, unknown>>(admin, 'conteudo_programatico', 'id', 9)
    assert.equal(rows.length, total)
    assert.equal(ranges.filter((item) => item.table === 'conteudo_programatico').length, expectedPages)
    assert.deepEqual(ranges[0], { table: 'conteudo_programatico', from: 0, to: 999 })
  })
}

test('26 provas e 1307 conteúdos existentes não produzem falsos novos', async () => {
  const proofs: Record<string, unknown>[] = []
  const contents: Record<string, unknown>[] = []
  const exams: ProgramFile['provas'] = []
  let disciplineGlobal = 0
  let contentId = 1
  for (let proofIndex = 0; proofIndex < 26; proofIndex += 1) {
    const proofId = proofIndex + 1
    const code = `C${String(proofId).padStart(2, '0')}`
    proofs.push({ id: proofId, concurso_id: 9, codigo_prova: code, cargo: `Cargo ${proofId}`, especialidade: null, turno: null })
    const disciplines = Array.from({ length: proofIndex < 15 ? 5 : 4 }, (_, disciplineIndex) => {
      disciplineGlobal += 1
      const discipline = `Disciplina ${disciplineGlobal}`
      const disciplineOrder = disciplineIndex + 1
      contents.push({ id: contentId++, concurso_id: 9, prova_id: proofId, disciplina: discipline, assunto: null, subassunto: null, disciplina_ordem: disciplineOrder, assunto_ordem: null, subassunto_ordem: null })
      const subjectCount = disciplineGlobal <= 2 ? 9 : 10
      const assuntos = Array.from({ length: subjectCount }, (_, subjectIndex) => {
        const subject = `Assunto ${disciplineGlobal}.${subjectIndex + 1}`
        contents.push({ id: contentId++, concurso_id: 9, prova_id: proofId, disciplina: discipline, assunto: subject, subassunto: null, disciplina_ordem: disciplineOrder, assunto_ordem: subjectIndex + 1, subassunto_ordem: null })
        return { nome: subject, ordem: subjectIndex + 1, subassuntos: [] }
      })
      return { nome: discipline, ordem: disciplineOrder, assuntos }
    })
    exams.push({ codigo_prova: code, cargo: `Cargo ${proofId}`, especialidade: null, turno: null, disciplinas: disciplines })
  }
  assert.equal(proofs.length, 26)
  assert.equal(contents.length, 1307)
  const seducProgram: ProgramFile = { schema_version: '1.0', concurso_id: 9, provas: exams }
  const preview = await buildUniversalPreview(contest, seducProgram, database(proofs, contents))
  assert.deepEqual(preview.contagens, { novo: 0, existente: 1333, atualizavel: 0, conflito: 0 })
})
