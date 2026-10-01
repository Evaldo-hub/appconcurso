import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateStudyPerformance, createStudyPerformanceLoader, formatStudyTime, type StudyPerformanceRow } from './study-performance'

const row = (id: number, values: Partial<StudyPerformanceRow> = {}): StudyPerformanceRow => ({ id, usuarioId: 'session-user', questaoId: 200 + id, alternativaSelecionada: 'A', correta: true, tempoGasto: 10, createdAt: `2026-09-${String(id).padStart(2, '0')}T12:00:00Z`, disciplina: 'Administração', assunto: 'Planejamento', ...values })

test('zero respostas produz resumo seguro e tempo médio null', () => {
  assert.deepEqual(calculateStudyPerformance([]), { summary: { totalRespondidas: 0, totalCorretas: 0, totalIncorretas: 0, taxaAcerto: 0, tempoMedio: null }, disciplines: [], subjects: [], history: [] })
})

test('uma correta e uma incorreta calculam totais e taxa', () => {
  const result = calculateStudyPerformance([row(1), row(2, { correta: false })])
  assert.deepEqual(result.summary, { totalRespondidas: 2, totalCorretas: 1, totalIncorretas: 1, taxaAcerto: 50, tempoMedio: 10 })
})

test('multiple attempts da mesma questão contam separadamente', () => {
  const result = calculateStudyPerformance([row(1, { questaoId: 221 }), row(2, { questaoId: 221, correta: false }), row(3, { questaoId: 221 })])
  assert.equal(result.summary.totalRespondidas, 3)
  assert.equal(result.history.length, 3)
})

test('tempo médio ignora null e preserva tempos válidos', () => {
  assert.equal(calculateStudyPerformance([row(1, { tempoGasto: null }), row(2, { tempoGasto: 20 })]).summary.tempoMedio, 20)
  assert.equal(calculateStudyPerformance([row(1, { tempoGasto: null })]).summary.tempoMedio, null)
})

test('agrupa e ordena disciplinas por respondidas e depois nome', () => {
  const result = calculateStudyPerformance([row(1, { disciplina: 'Z' }), row(2, { disciplina: 'A' }), row(3, { disciplina: 'Z', correta: false }), row(4, { disciplina: 'B' })])
  assert.deepEqual(result.disciplines.map((item) => item.disciplina), ['Z', 'A', 'B'])
  assert.deepEqual(result.disciplines[0], { disciplina: 'Z', respondidas: 2, corretas: 1, incorretas: 1, taxaAcerto: 50 })
})

test('assuntos homônimos de disciplinas diferentes não são misturados', () => {
  const result = calculateStudyPerformance([row(1, { disciplina: 'A', assunto: 'Comum' }), row(2, { disciplina: 'B', assunto: 'Comum', correta: false })])
  assert.equal(result.subjects.length, 2)
  assert.deepEqual(result.subjects.map((item) => [item.disciplina, item.assunto]), [['A', 'Comum'], ['B', 'Comum']])
})

test('histórico limita a 20, ordena created_at e id DESC e preserva questao_id', () => {
  const rows = Array.from({ length: 25 }, (_, index) => row(index + 1, { createdAt: '2026-09-30T12:00:00Z' }))
  const history = calculateStudyPerformance(rows).history
  assert.equal(history.length, 20)
  assert.equal(history[0].id, 25)
  assert.equal(history[0].questaoId, 225)
  assert.equal(`/questoes/${history[0].questaoId}`, '/questoes/225')
})

test('formata segundos, minutos e ausência de tempo', () => {
  assert.equal(formatStudyTime(null), '—'); assert.equal(formatStudyTime(5), '5 s'); assert.equal(formatStudyTime(72), '1 min 12 s')
})

test('loader usa exclusivamente user_id da sessão e não mistura outro usuário', async () => {
  let receivedUser = ''
  const loader = createStudyPerformanceLoader({ authenticate: async () => 'session-user', loadRows: async (userId) => { receivedUser = userId; return [row(1)] } })
  const result = await loader()
  assert.equal(receivedUser, 'session-user')
  assert.equal(result.authenticated && result.data.summary.totalRespondidas, 1)
})

test('sem autenticação não consulta respostas', async () => {
  let queried = false
  const result = await createStudyPerformanceLoader({ authenticate: async () => null, loadRows: async () => { queried = true; return [] } })()
  assert.equal(result.authenticated, false); assert.equal(queried, false)
})
