import assert from 'node:assert/strict'
import test from 'node:test'
import { loadMaterialFromGitHub, validateGitHubMaterialPath } from './github-loader'

const unicodeTrt8Paths = [
  'concursos/trt8/2022/documentos_gerais/D. Adm/VadeMEQ - Lei nº 8.112_1990 - Serviços Públicos Federais.pdf',
  'concursos/trt8/2022/documentos_gerais/D. Const/PDMEQ - Aula 01 - Direito Constitucional - Constituição, Normas e Princípios e Poder Constituinte.pdf',
  'concursos/trt8/2022/documentos_gerais/D. Const/VadeMEQ - Constituição Federal.pdf',
  'concursos/trt8/2022/documentos_gerais/D. Trab/Súmulas e OJs do TST (Otimizadas).pdf',
  'concursos/trt8/2022/documentos_gerais/D. Trab/Súmulas e OJs do TST (Separadas por assunto).pdf',
]

test('aceita e preserva semanticamente os cinco caminhos Unicode reais do TRT8', () => {
  for (const path of unicodeTrt8Paths) assert.equal(validateGitHubMaterialPath(path), path.normalize('NFC'))
})

test('aceita Unicode, espaços e pontuação segura sem transliterar', () => {
  const path = 'concursos/Constituição/Súmulas/Serviços Públicos nº 1 (revisão)-final_1.0.pdf'
  assert.equal(validateGitHubMaterialPath(path), path)
})

test('normaliza formas Unicode equivalentes para NFC', () => {
  const decomposed = 'concursos/Constituic\u0327a\u0303o/arquivo.pdf'
  assert.equal(validateGitHubMaterialPath(decomposed), 'concursos/Constituição/arquivo.pdf')
})

test('mantém compatibilidade com caminho ASCII já ingerido', () => {
  const path = 'concursos/trt8/2022/edital/ED_1_2022_TRT8_ABERTURA.pdf'
  assert.equal(validateGitHubMaterialPath(path), path)
})

test('rejeita traversal, caminhos absolutos, URLs e metacaracteres de URL', () => {
  const invalidPaths = [
    '',
    '../secret.pdf',
    'concursos/trt8/../../secret.pdf',
    '/concursos/trt8/test.pdf',
    '\\concursos\\trt8\\test.pdf',
    'concursos\\trt8\\..\\secret.pdf',
    'https://evil.example/file.pdf',
    'http://evil.example/file.pdf',
    'ftp://evil.example/file.pdf',
    'concursos/trt8/%2e%2e/secret.pdf',
    'concursos/trt8/../secret.pdf',
    'concursos/trt8/./secret.pdf',
    'concursos/trt8//secret.pdf',
    'concursos/trt8/file.pdf?download=1',
    'concursos/trt8/file.pdf#fragment',
    'concursos/trt8/file\0.pdf',
    'concursos/trt8/file\u0001.pdf',
    'concursos/trt8/file\u007f.pdf',
  ]
  for (const path of invalidPaths) assert.throws(() => validateGitHubMaterialPath(path), /inválido/)
})

test('codifica cada segmento Unicode uma única vez e preserva separadores', async () => {
  const path = unicodeTrt8Paths[3]
  let requestedUrl = ''
  const fetchImpl: typeof fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })
  }
  await loadMaterialFromGitHub(
    { githubPath: path },
    { owner: 'Evaldo-hub', repository: 'ebserh-ti-base-conhecimento', ref: 'main' },
    fetchImpl,
  )
  assert.match(requestedUrl, /\/contents\/concursos\/trt8\/2022\/documentos_gerais\/D\.%20Trab\/S%C3%BAmulas%20e%20OJs%20do%20TST%20\(Otimizadas\)\.pdf\?ref=main$/)
  assert.doesNotMatch(requestedUrl, /%2525|%252F|%2Fconcursos/i)
})
