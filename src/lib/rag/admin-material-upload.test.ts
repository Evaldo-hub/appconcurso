import assert from 'node:assert/strict'
import test from 'node:test'
import { RagMaterialRegistrationError, type RagMaterialInsert, type RagMaterialRegistrationRepository } from './admin-material'
import { createGitHubMaterialFileChecker, createGitHubMaterialWriter, RagGitHubRequestError } from './github-loader'
import {
  buildRagUploadPath,
  MAX_RAG_UPLOAD_BYTES,
  ragMaterialUploadMetadataSchema,
  RagMaterialUploadError,
  uploadAndRegisterRagMaterial,
  type RagMaterialUploadDependencies,
  type RagUploadFile,
} from './admin-material-upload'

const rawMetadata = {
  titulo: 'Material de revisão', prova_id: '', disciplina: 'Direito Constitucional', assunto: '', subassunto: '', categoria: 'documentos_gerais',
} as const
const metadata = ragMaterialUploadMetadataSchema.parse(rawMetadata)

function file(name: string, content: string | Uint8Array, type: string): RagUploadFile {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return { name, type, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }
}

function fixture(options: { duplicate?: boolean; githubExists?: boolean; githubFails?: boolean; insertFails?: boolean; examValid?: boolean } = {}) {
  const inserted: RagMaterialInsert[] = []
  const githubWrites: Array<{ path: string; bytes: Uint8Array; message: string }> = []
  const registration: RagMaterialRegistrationRepository = {
    contestExists: async () => true,
    examBelongsToContest: async () => options.examValid ?? true,
    duplicateExists: async () => options.duplicate ?? false,
    insertMaterial: async (value) => {
      if (options.insertFails) throw new Error('db unavailable')
      inserted.push(value)
      return { id: 17 }
    },
  }
  const dependencies: RagMaterialUploadDependencies = {
    registration,
    loadContestContext: async () => ({ organization: 'TRT8', year: 2022 }),
    github: {
      fileExists: async () => options.githubExists ?? false,
      createFile: async (path, bytes, message) => {
        if (options.githubFails) throw new Error('github unavailable')
        githubWrites.push({ path, bytes, message })
      },
    },
  }
  return { dependencies, inserted, githubWrites }
}

async function expectUploadError(promise: Promise<unknown>, code: RagMaterialUploadError['code']) {
  await assert.rejects(promise, (error) => error instanceof RagMaterialUploadError && error.code === code)
}

test('PDF válido realiza uma escrita GitHub e um insert de material, sem operações RAG', async () => {
  const state = fixture()
  const result = await uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, file('Revisão.pdf', '%PDF-1.7\nbody', 'application/pdf'))
  assert.deepEqual(result, { materialId: 17, githubPath: 'concursos/trt8/2022/documentos_gerais/Revisão.pdf' })
  assert.equal(state.githubWrites.length, 1)
  assert.equal(state.inserted.length, 1)
  assert.equal(state.inserted[0]?.arquivo_origem, 'Revisão.pdf')
  assert.deepEqual(Object.keys(state.dependencies).sort(), ['github', 'loadContestContext', 'registration'])
})

test('PDF falso, extensão inválida e arquivo grande falham antes de qualquer escrita', async () => {
  for (const invalid of [
    file('arquivo.pdf', 'não é PDF', 'application/pdf'),
    file('arquivo.exe', 'binário', 'application/octet-stream'),
    { name: 'grande.pdf', type: 'application/pdf', size: MAX_RAG_UPLOAD_BYTES + 1, arrayBuffer: async () => { throw new Error('não deveria ler') } } satisfies RagUploadFile,
  ]) {
    const state = fixture()
    await expectUploadError(uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, invalid), invalid.size > MAX_RAG_UPLOAD_BYTES ? 'FILE_TOO_LARGE' : 'INVALID_FILE')
    assert.equal(state.githubWrites.length, 0)
    assert.equal(state.inserted.length, 0)
  }
})

test('rejeita traversal no filename e preserva Unicode legítimo no path determinístico', async () => {
  const rejected = fixture()
  await expectUploadError(uploadAndRegisterRagMaterial(rejected.dependencies, 7, metadata, file('../../arquivo.pdf', '%PDF-', 'application/pdf')), 'INVALID_FILE')
  assert.equal(rejected.githubWrites.length, 0)
  assert.equal(buildRagUploadPath({ organization: 'TRT8', year: 2022 }, 'documentos_gerais', 'Constituição Federal — Revisão.pdf'), 'concursos/trt8/2022/documentos_gerais/Constituição Federal — Revisão.pdf')
})

test('duplicidade no banco e prova cross-concurso impedem consulta/escrita GitHub e insert', async () => {
  const duplicate = fixture({ duplicate: true })
  await assert.rejects(uploadAndRegisterRagMaterial(duplicate.dependencies, 7, metadata, file('novo.pdf', '%PDF-', 'application/pdf')), (error) => error instanceof RagMaterialRegistrationError && error.code === 'DUPLICATE')
  assert.equal(duplicate.githubWrites.length, 0)
  assert.equal(duplicate.inserted.length, 0)

  const cross = fixture({ examValid: false })
  const withExam = ragMaterialUploadMetadataSchema.parse({ ...rawMetadata, prova_id: '999' })
  await assert.rejects(uploadAndRegisterRagMaterial(cross.dependencies, 7, withExam, file('novo.pdf', '%PDF-', 'application/pdf')), (error) => error instanceof RagMaterialRegistrationError && error.code === 'INVALID_EXAM')
  assert.equal(cross.githubWrites.length, 0)
  assert.equal(cross.inserted.length, 0)
})

test('conflito GitHub não sobrescreve e não cadastra metadado', async () => {
  const state = fixture({ githubExists: true })
  await expectUploadError(uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, file('novo.pdf', '%PDF-', 'application/pdf')), 'GITHUB_CONFLICT')
  assert.equal(state.githubWrites.length, 0)
  assert.equal(state.inserted.length, 0)
})

test('falha GitHub impede insert no banco', async () => {
  const state = fixture({ githubFails: true })
  await expectUploadError(uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, file('novo.pdf', '%PDF-', 'application/pdf')), 'GITHUB_FAILURE')
  assert.equal(state.inserted.length, 0)
})

test('falha de banco após upload retorna estado parcial e path, sem rollback remoto', async () => {
  const state = fixture({ insertFails: true })
  const promise = uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, file('Constituição Federal — Revisão.pdf', '%PDF-', 'application/pdf'))
  await assert.rejects(promise, (error) => error instanceof RagMaterialUploadError
    && error.code === 'FILE_UPLOADED_METADATA_FAILED'
    && error.githubPath === 'concursos/trt8/2022/documentos_gerais/Constituição Federal — Revisão.pdf')
  assert.equal(state.githubWrites.length, 1)
  assert.equal(state.inserted.length, 0)
})

test('TXT/MD rejeitam conteúdo vazio, MIME incompatível e binário com NUL excessivo', async () => {
  for (const invalid of [file('vazio.txt', '', 'text/plain'), file('texto.txt', 'texto', 'application/pdf'), file('binario.md', new Uint8Array(20).fill(0), 'application/octet-stream')]) {
    const state = fixture()
    await expectUploadError(uploadAndRegisterRagMaterial(state.dependencies, 7, metadata, invalid), 'INVALID_FILE')
    assert.equal(state.githubWrites.length, 0)
  }
})

test('input de upload não aceita github_path nem tipo_fonte vindos do browser', () => {
  const parsed = ragMaterialUploadMetadataSchema.parse({ ...rawMetadata, github_path: 'arbitrario', tipo_fonte: 'url' })
  assert.equal('github_path' in parsed, false)
  assert.equal('tipo_fonte' in parsed, false)
})

test('writer GitHub usa Contents API, branch oficial e token somente no header', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return new Response(init?.method === 'PUT' ? '{}' : '', { status: init?.method === 'PUT' ? 201 : 404 })
  }
  const writer = createGitHubMaterialWriter({ owner: 'owner', repository: 'repo', ref: 'main', token: 'secret-token' }, fetchMock as typeof fetch)
  assert.equal(await writer.fileExists('concursos/trt8/2022/documentos_gerais/Revisão.pdf'), false)
  await writer.createFile('concursos/trt8/2022/documentos_gerais/Revisão.pdf', new TextEncoder().encode('%PDF-'), 'Add RAG material: Revisão.pdf')
  assert.equal(requests.length, 2)
  assert.equal(requests.every((request) => !request.url.includes('secret-token')), true)
  const body = JSON.parse(String(requests[1]?.init?.body)) as { branch: string; message: string; content: string }
  assert.equal(body.branch, 'main')
  assert.equal(body.message, 'Add RAG material: Revisão.pdf')
  assert.equal(body.content, Buffer.from('%PDF-').toString('base64'))
})

test('writer GitHub nunca transforma conflito em sobrescrita nem expõe token no erro', async () => {
  let calls = 0
  const writer = createGitHubMaterialWriter({ owner: 'owner', repository: 'repo', ref: 'main', token: 'secret-token' }, (async () => {
    calls += 1
    return new Response('{}', { status: 422 })
  }) as typeof fetch)
  await assert.rejects(writer.createFile('concursos/trt8/2022/edital/novo.pdf', new Uint8Array([1]), 'Add RAG material: novo.pdf'), (error) => error instanceof Error && !error.message.includes('secret-token'))
  assert.equal(calls, 1)
})

test('token ausente falha fechado antes de qualquer chamada de escrita', async () => {
  let fetchCalls = 0
  const writer = createGitHubMaterialWriter({ owner: 'owner', repository: 'repo', ref: 'main' }, (async () => {
    fetchCalls += 1
    return new Response('{}', { status: 201 })
  }) as typeof fetch)
  await assert.rejects(
    writer.createFile('concursos/trt8/2022/edital/novo.pdf', new Uint8Array([1]), 'Add RAG material: novo.pdf'),
    (error) => error instanceof Error && error.message === 'Credencial de escrita GitHub não configurada no servidor.',
  )
  assert.equal(fetchCalls, 0)
})

test('HTTP 401, 403, 404, 409 e 422 geram códigos e logs seguros com o body lido uma vez', async () => {
  const fakeToken = 'github_pat_FAKE_TEST_ONLY'
  const expected = new Map([
    [401, 'RAG_GITHUB_AUTH_FAILED'],
    [403, 'RAG_GITHUB_PERMISSION_DENIED'],
    [404, 'RAG_GITHUB_REPOSITORY_OR_REF_NOT_FOUND'],
    [409, 'RAG_GITHUB_CONFLICT'],
    [422, 'RAG_GITHUB_VALIDATION_FAILED'],
  ])
  const originalConsoleError = console.error
  const logs: unknown[][] = []
  console.error = (...values: unknown[]) => { logs.push(values) }
  try {
    for (const [status, code] of expected) {
      const body = JSON.stringify({ message: `GitHub status ${status}; Authorization: Bearer ${fakeToken}`, documentation_url: 'https://docs.github.test/rest' })
      const writer = createGitHubMaterialWriter(
        { owner: 'owner', repository: 'repo', ref: 'main', token: fakeToken },
        (async () => new Response(body, { status, statusText: 'Rejected' })) as typeof fetch,
      )
      await assert.rejects(
        writer.createFile('concursos/trt8/2022/edital/novo.pdf', new Uint8Array([1]), 'Add RAG material: novo.pdf'),
        (error) => error instanceof RagGitHubRequestError
          && error.status === status
          && error.code === code
          && error.githubMessage === `GitHub status ${status}; Authorization: Bearer [REDACTED]`
          && error.documentationUrl === 'https://docs.github.test/rest',
      )
    }
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(logs.length, expected.size)
  const serializedLogs = JSON.stringify(logs)
  assert.equal(serializedLogs.includes(fakeToken), false)
  assert.equal(serializedLogs.includes('Authorization'), false)
  assert.match(serializedLogs, /concursos\/trt8\/2022\/edital\/novo\.pdf/)
})

test('checker GitHub aceita somente HTTP 200 com metadata type=file', async () => {
  const checker = createGitHubMaterialFileChecker(
    { owner: 'owner', repository: 'repo', ref: 'main', token: 'github_pat_FAKE_TEST_ONLY' },
    (async () => new Response(JSON.stringify({ type: 'file' }), { status: 200 })) as typeof fetch,
  )
  assert.deepEqual(await checker.checkFile('concursos/trt8/2022/arquivo.pdf'), { exists: true, type: 'file' })
})

test('checker GitHub distingue 404 e preserva metadata de diretório', async () => {
  const config = { owner: 'owner', repository: 'repo', ref: 'main', token: 'github_pat_FAKE_TEST_ONLY' }
  const missing = createGitHubMaterialFileChecker(config, (async () => new Response('{}', { status: 404 })) as typeof fetch)
  assert.deepEqual(await missing.checkFile('concursos/trt8/2022/ausente.pdf'), { exists: false, type: null })
  const directory = createGitHubMaterialFileChecker(config, (async () => new Response(JSON.stringify({ type: 'dir' }), { status: 200 })) as typeof fetch)
  assert.deepEqual(await directory.checkFile('concursos/trt8/2022/documentos_gerais'), { exists: true, type: 'dir' })
})

test('checker GitHub falha fechado e sanitizado em 401, 403, 500 e token ausente', async () => {
  const token = 'github_pat_FAKE_TEST_ONLY'
  for (const status of [401, 403, 500]) {
    let calls = 0
    const checker = createGitHubMaterialFileChecker(
      { owner: 'owner', repository: 'repo', ref: 'main', token },
      (async () => { calls += 1; return new Response(`Authorization: Bearer ${token}`, { status }) }) as typeof fetch,
    )
    await assert.rejects(checker.checkFile('concursos/trt8/2022/arquivo.pdf'), (error) => error instanceof Error
      && error.message === 'Não foi possível validar o arquivo no GitHub.'
      && !error.message.includes(token)
      && !error.message.includes('Authorization'))
    assert.equal(calls, 1)
  }

  let calls = 0
  const withoutToken = createGitHubMaterialFileChecker(
    { owner: 'owner', repository: 'repo', ref: 'main' },
    (async () => { calls += 1; return new Response('{}', { status: 200 }) }) as typeof fetch,
  )
  await assert.rejects(withoutToken.checkFile('concursos/trt8/2022/arquivo.pdf'), /Não foi possível validar/)
  assert.equal(calls, 0)
})
