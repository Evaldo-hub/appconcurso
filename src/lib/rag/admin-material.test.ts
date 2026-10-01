import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ragMaterialBrowserInputSchema,
  RagMaterialRegistrationError,
  registerExistingRagMaterial,
  registerRagMaterial,
  type ExistingGitHubFileChecker,
  type RagMaterialInsert,
  type RagMaterialRegistrationRepository,
  type ValidatedRagMaterialInput,
} from './admin-material'
import { buildRagAdminSnapshot, type RagMaterialAdminRow } from './admin-status'

const rawInput = {
  titulo: '  Constituição comentada  ',
  prova_id: '',
  disciplina: '  Direito Constitucional ',
  assunto: '',
  subassunto: '',
  arquivo_origem: ' Constituição.pdf ',
  github_path: '  concursos/trt8/2022/documentos_gerais/D. Const/Constituição.pdf  ',
  tipo_arquivo: 'pdf',
}

function repository(overrides: Partial<RagMaterialRegistrationRepository> = {}) {
  const inserted: RagMaterialInsert[] = []
  const repo: RagMaterialRegistrationRepository = {
    contestExists: async () => true,
    examBelongsToContest: async () => true,
    duplicateExists: async () => false,
    insertMaterial: async (material) => { inserted.push(material); return { id: 17 } },
    ...overrides,
  }
  return { repo, inserted }
}

test('aceita input válido, preserva Unicode e aplica trim sem transformar o path', () => {
  const result = ragMaterialBrowserInputSchema.parse(rawInput)
  assert.equal(result.titulo, 'Constituição comentada')
  assert.equal(result.github_path, 'concursos/trt8/2022/documentos_gerais/D. Const/Constituição.pdf')
  assert.equal(result.disciplina, 'Direito Constitucional')
  assert.equal(result.prova_id, null)
})

test('rejeita campo obrigatório vazio e paths claramente inválidos', () => {
  assert.equal(ragMaterialBrowserInputSchema.safeParse({ ...rawInput, titulo: '   ' }).success, false)
  assert.equal(ragMaterialBrowserInputSchema.safeParse({ ...rawInput, github_path: '../arquivo.pdf' }).success, false)
  assert.equal(ragMaterialBrowserInputSchema.safeParse({ ...rawInput, github_path: 'https://example.com/arquivo.pdf' }).success, false)
  assert.equal(ragMaterialBrowserInputSchema.safeParse({ ...rawInput, github_path: 'pasta\\arquivo.pdf' }).success, false)
})

test('cadastra material geral somente em materiais_concurso', async () => {
  const input = ragMaterialBrowserInputSchema.parse(rawInput)
  const { repo, inserted } = repository()
  const result = await registerRagMaterial(repo, 7, input)
  assert.equal(result.id, 17)
  assert.deepEqual(inserted, [{ ...input, concurso_id: 7, tipo_fonte: 'arquivo', ativo: true }])
})

test('aceita prova pertencente ao concurso e rejeita prova cross-concurso', async () => {
  const input = ragMaterialBrowserInputSchema.parse({ ...rawInput, prova_id: '22' })
  const accepted = repository({ examBelongsToContest: async (provaId, concursoId) => provaId === 22 && concursoId === 7 })
  await registerRagMaterial(accepted.repo, 7, input)
  assert.equal(accepted.inserted[0]?.prova_id, 22)

  const rejected = repository({ examBelongsToContest: async () => false })
  await assert.rejects(registerRagMaterial(rejected.repo, 7, input), (error) => error instanceof RagMaterialRegistrationError && error.code === 'INVALID_EXAM')
  assert.equal(rejected.inserted.length, 0)
})

test('bloqueia duplicidade antes do insert', async () => {
  const input = ragMaterialBrowserInputSchema.parse(rawInput)
  const { repo, inserted } = repository({ duplicateExists: async () => true })
  await assert.rejects(registerRagMaterial(repo, 7, input), (error) => error instanceof RagMaterialRegistrationError && error.code === 'DUPLICATE')
  assert.equal(inserted.length, 0)
})

test('arquivo GitHub existente com type=file permite o insert', async () => {
  const input = ragMaterialBrowserInputSchema.parse({ ...rawInput, prova_id: '10' })
  const { repo, inserted } = repository()
  const github: ExistingGitHubFileChecker = { checkFile: async () => ({ exists: true, type: 'file' }) }
  await registerExistingRagMaterial(repo, github, 7, input)
  assert.equal(inserted.length, 1)
})

test('arquivo ausente e diretório são rejeitados sem insert', async () => {
  const input = ragMaterialBrowserInputSchema.parse(rawInput)
  for (const result of [{ exists: false, type: null }, { exists: true, type: 'dir' }]) {
    const { repo, inserted } = repository()
    await assert.rejects(
      registerExistingRagMaterial(repo, { checkFile: async () => result }, 7, input),
      (error) => error instanceof RagMaterialRegistrationError && error.code === 'GITHUB_FILE_NOT_FOUND',
    )
    assert.equal(inserted.length, 0)
  }
})

test('falha ao consultar GitHub falha fechado e não vaza detalhes', async () => {
  const input = ragMaterialBrowserInputSchema.parse(rawInput)
  const { repo, inserted } = repository()
  const token = 'github_pat_FAKE_TEST_ONLY'
  await assert.rejects(
    registerExistingRagMaterial(repo, { checkFile: async () => { throw new Error(`Authorization: Bearer ${token}`) } }, 7, input),
    (error) => error instanceof RagMaterialRegistrationError
      && error.code === 'GITHUB_FILE_CHECK_FAILED'
      && !error.message.includes(token)
      && !error.message.includes('Authorization'),
  )
  assert.equal(inserted.length, 0)
})

test('duplicidade e prova inválida impedem a consulta GitHub e o insert', async () => {
  const input = ragMaterialBrowserInputSchema.parse({ ...rawInput, prova_id: '10' })
  for (const scenario of [
    { repo: repository({ duplicateExists: async () => true }), code: 'DUPLICATE' as const },
    { repo: repository({ examBelongsToContest: async () => false }), code: 'INVALID_EXAM' as const },
  ]) {
    let checks = 0
    await assert.rejects(
      registerExistingRagMaterial(scenario.repo.repo, { checkFile: async () => { checks += 1; return { exists: true, type: 'file' } } }, 7, input),
      (error) => error instanceof RagMaterialRegistrationError && error.code === scenario.code,
    )
    assert.equal(checks, 0)
    assert.equal(scenario.repo.inserted.length, 0)
  }
})

test('github_path inválido falha no payload antes de GitHub ou banco', () => {
  for (const github_path of ['../arquivo.pdf', 'pasta\\arquivo.pdf', 'https://example.com/arquivo.pdf']) {
    assert.equal(ragMaterialBrowserInputSchema.safeParse({ ...rawInput, github_path }).success, false)
  }
})

test('novo material sem ingestão fica PENDING, com zero documents, sem alterar READY ou documents ativos', () => {
  const material = (id: number): RagMaterialAdminRow => ({ id, titulo: `Material ${id}`, tipo_arquivo: 'pdf', tipo_fonte: 'arquivo', github_path: `path/${id}.pdf`, concurso_id: 7, prova_id: null, ativo: true })
  const before = buildRagAdminSnapshot(Array.from({ length: 13 }, (_, index) => material(index + 1)), [], new Map())
  const after = buildRagAdminSnapshot(Array.from({ length: 14 }, (_, index) => material(index + 1)), [], new Map())
  assert.equal(before.summary.totalMaterials, 13)
  assert.equal(after.summary.totalMaterials, 14)
  assert.equal(after.summary.pending, before.summary.pending + 1)
  assert.equal(after.summary.ready, before.summary.ready)
  assert.equal(after.summary.activeDocuments, before.summary.activeDocuments)
  assert.equal(after.materials.at(-1)?.ragStatus, 'PENDING')
  assert.equal(after.materials.at(-1)?.activeIngestion, null)
})

test('contrato de cadastro não oferece operações de ingestão, embeddings ou documents', () => {
  const { repo } = repository()
  assert.deepEqual(Object.keys(repo).sort(), ['contestExists', 'duplicateExists', 'examBelongsToContest', 'insertMaterial'])
  const input: ValidatedRagMaterialInput = ragMaterialBrowserInputSchema.parse(rawInput)
  assert.equal('concurso_id' in input, false)
})
