import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createPdfJsTextExtractor, reconstructPdfPageText } from './pdf-extractor'
import { getRagGitHubConfig } from './config'
import { loadMaterialFromGitHub } from './github-loader'

function item(str: string, x: number, y: number, width: number, hasEOL = false) {
  return { str, hasEOL, transform: [12, 0, 0, 12, x, y], width, height: 12 }
}

test('reconstrói fragmentos contíguos, espaços reais e linhas por geometria', () => {
  assert.equal(reconstructPdfPageText([
    item('Cade', 10, 100, 24), item('r', 34, 100, 6), item('no', 40, 100, 12),
    item('Gestão', 70, 100, 36), item(' ', 106, 100, 4), item('de', 110, 100, 12),
    item('Processos', 130, 100, 48, true), item('Fundamentos', 10, 80, 66),
  ]), 'Caderno Gestão de Processos\nFundamentos')
})

test('preserva Unicode em NFC sem correções por dicionário', () => {
  assert.equal(reconstructPdfPageText([item('Gestão', 0, 10, 30), item(' ', 30, 10, 4), item('Pública', 34, 10, 36)]), 'Gestão Pública')
})

test('separa blocos sobrepostos na mesma linha sem fundir palavras', () => {
  assert.equal(reconstructPdfPageText([item('Fundamentos da', 100, 10, 80), item('Gestão de Processos', 100, 10, 70)]), 'Fundamentos da Gestão de Processos')
})

test('extrai texto de PDF local no runtime Node sem worker de browser', async () => {
  const bytes = await readFile(new URL('./fixtures/minimal-text.pdf', import.meta.url))
  const result = await createPdfJsTextExtractor().extract({
    bytes: new Uint8Array(bytes),
    fileName: 'minimal-text.pdf',
    contentType: 'application/pdf',
    size: bytes.byteLength,
    githubPath: 'fixture/minimal-text.pdf',
    sourceSha256: '0'.repeat(64),
  })
  assert.ok(result.sections.length >= 1)
  assert.match(result.sections.map((section) => section.content).join('\n'), /TESTE RAG PDF/)
})

test('PDF real preserva os termos críticos nas páginas 1, 13 e 24', { skip: process.env.RAG_REAL_PDF_TEST !== '1' }, async () => {
  const githubPath = 'concursos/trt8/2022/documentos_gerais/Guia Metodológico de gestão de processos carderno 1.pdf'
  const file = await loadMaterialFromGitHub({ githubPath }, getRagGitHubConfig())
  const result = await createPdfJsTextExtractor().extract(file)
  const page = (number: number) => result.sections.find((section) => section.page === number)?.content ?? ''
  assert.match(page(1), /Caderno 1/)
  assert.match(page(1), /Fundamentos e a Metodologia/)
  assert.match(page(1), /Gestão de Processos/)
  assert.match(page(13), /Os processos podem ser entendidos e categorizados/)
  assert.match(page(24), /Apresentação do Guia Metodológico de Gestão de Processos/)
  for (const text of [page(1), page(13), page(24)]) assert.doesNotMatch(text, /Cade o|Fu dame os|Ges ão|p ocessos/)
})
