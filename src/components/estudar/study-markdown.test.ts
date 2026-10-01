import assert from 'node:assert/strict'
import test from 'node:test'
// Node's native TypeScript test runner requires the explicit extension.
// @ts-expect-error The project compiles with noEmit, so this import is never emitted.
import { extractStudyOutline, formatLatexExpression, parseStudyMarkdown, sectionTone } from './study-markdown-parser.ts'

test('interpreta títulos, parágrafos, listas e blocos de código', () => {
  const blocks = parseStudyMarkdown(`# Resumo\n\nTexto com **destaque**.\n\n- Regra um\n- Regra dois\n\n1. Primeiro\n2. Segundo\n\n\`\`\`ts\nconst certo = true\n\`\`\``)
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'unordered-list', 'ordered-list', 'code'])
  assert.deepEqual(blocks[2], { type: 'unordered-list', items: ['Regra um', 'Regra dois'] })
  assert.deepEqual(blocks[4], { type: 'code', code: 'const certo = true', language: 'ts' })
})

test('gera o índice somente com títulos existentes de primeiro e segundo níveis', () => {
  const outline = extractStudyOutline(parseStudyMarkdown('# Introdução\n## Regras\n### Exemplo\n## O que memorizar'))
  assert.deepEqual(outline.map((item) => item.text), ['Introdução', 'Regras', 'O que memorizar'])
  assert.equal(new Set(outline.map((item) => item.id)).size, outline.length)
})

test('identifica destaques sem depender de acentos', () => {
  assert.equal(sectionTone('O que memorizar'), 'memorize')
  assert.equal(sectionTone('Pegadinhas comuns'), 'warning')
  assert.equal(sectionTone('Conceito central'), 'default')
})

test('reconhece bloco LaTeX sem tratar barras como escapes de JSON', () => {
  const markdown = '## Resolução rápida\n\n\\[\n\\forall x\\,P(x)\n\\]'
  const blocks = parseStudyMarkdown(markdown)
  assert.equal(blocks[0].type, 'heading')
  assert.deepEqual(blocks[1], { type: 'math', expression: '\\forall x\\,P(x)' })
  assert.equal(blocks.some((block) => block.type === 'paragraph' && block.text.includes('{"resposta"')), false)
})

test('mantém itens numerados separados por linhas vazias em uma única lista', () => {
  const blocks = parseStudyMarkdown('1. Primeiro\n\n2. Segundo\n\n3. Terceiro')
  assert.deepEqual(blocks, [{ type: 'ordered-list', items: ['Primeiro', 'Segundo', 'Terceiro'] }])
})

test('formata somente comandos LaTeX matemáticos conhecidos', () => {
  assert.equal(
    formatLatexExpression('\\forall x \\exists y \\neg P(x) \\land Q(y) \\rightarrow R'),
    '∀ x ∃ y ¬ P(x) ∧ Q(y) → R',
  )
  assert.equal(formatLatexExpression('texto \\comando_desconhecido'), 'texto \\comando_desconhecido')
})

test('reconhece separadores horizontais Markdown limpos', () => {
  const blocks = parseStudyMarkdown('Texto antes.\n\n---\n\nTexto depois.')
  assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'horizontal-rule', 'paragraph'])
})
