import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { outlineLabel, StudyMarkdown } from './study-markdown'

test('renderiza uma lista numerada contínua mesmo com linhas vazias', () => {
  const html = renderToStaticMarkup(<StudyMarkdown content={'1. Um\n\n2. Dois\n\n3. Três'} mode="resumo" />)
  assert.equal((html.match(/<ol/g) ?? []).length, 1)
  assert.equal((html.match(/<li/g) ?? []).length, 3)
})

test('títulos especiais não inserem artefato svg', () => {
  const html = renderToStaticMarkup(<StudyMarkdown content={'## Pegadinha\n\nTexto.\n\n## Memorize\n\n- Regra'} mode="resumo" />)
  assert.doesNotMatch(html, /<svg|>svg</i)
  assert.match(html, /Pegadinha/)
  assert.match(html, /Memorize/)
})

test('renderiza comandos LaTeX conhecidos como símbolos matemáticos', () => {
  const html = renderToStaticMarkup(<StudyMarkdown content={'\\[\n\\forall x \\exists y \\neg P(x) \\land Q(y) \\rightarrow R\n\\]'} mode="resumo" />)
  assert.match(html, /role="math"/)
  assert.match(html, /∀ x ∃ y ¬ P\(x\) ∧ Q\(y\) → R/)
  assert.doesNotMatch(html, /\\forall|\\exists|\\neg|\\land|\\rightarrow/)
})

test('renderiza matemática inline, ênfase e separador Markdown sem HTML bruto', () => {
  const html = renderToStaticMarkup(<StudyMarkdown content={'Texto com **destaque**, *ênfase* e \\(\\forall x \\rightarrow P(x)\\).\n\n---'} mode="aula" />)
  assert.match(html, /<strong/)
  assert.match(html, /<em/)
  assert.match(html, /role="math"/)
  assert.match(html, /∀ x → P\(x\)/)
  assert.match(html, /<hr/)
  assert.doesNotMatch(html, /\\forall|\\rightarrow/)
})

test('sumário não duplica a numeração existente nos títulos', () => {
  const content = '## 1. Entenda o tema\n\nTexto.\n\n## 2. Conceitos fundamentais\n\nTexto.'
  const html = renderToStaticMarkup(<StudyMarkdown content={content} mode="aula" />)
  assert.doesNotMatch(html, />1\. 1\. Entenda o tema</)
  assert.match(html, />1\.<\/span><span[^>]*>Entenda o tema</)
  assert.match(html, /href="#secao-1-entenda-o-tema-0"/)
  assert.equal(outlineLabel('2. Conceitos fundamentais'), 'Conceitos fundamentais')
})

test('mantém proteção XSS ao renderizar texto da aula', () => {
  const html = renderToStaticMarkup(<StudyMarkdown content={'## Aula\n\n<script>alert("x")</script>'} mode="aula" />)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('renderiza todo o subconjunto lógico suportado sem comandos literais', () => {
  const content = '\\[\n\\forall x \\exists y \\neg P(x) \\land Q(y) \\lor A \\rightarrow B \\equiv Q\n\\]'
  const html = renderToStaticMarkup(<StudyMarkdown content={content} mode="aula" />)
  assert.match(html, /∀ x ∃ y ¬ P\(x\) ∧ Q\(y\) ∨ A → B ≡ Q/)
  assert.doesNotMatch(html, /\\(?:forall|exists|neg|land|lor|rightarrow|equiv)/)
})

test('passos em negrito não dependem de lista numerada', () => {
  const content = '## 4. Resolução passo a passo\n\n**Passo 1 — Negar a expressão inteira**\n\nExplicação.\n\n**Passo 2 — Negar o quantificador universal**\n\nExplicação.'
  const html = renderToStaticMarkup(<StudyMarkdown content={content} mode="aula" />)
  assert.equal((html.match(/<strong/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<ol/)
  assert.doesNotMatch(html, /\\-/)
})
