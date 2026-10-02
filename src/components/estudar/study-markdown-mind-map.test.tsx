import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudyMarkdown } from './study-markdown'

test('mapa mental usa pre-wrap sem HTML perigoso e preserva a árvore', () => {
  const tree = 'TEMA CENTRAL\n│\n├── RAMO\n│   └── Conceito'
  const html = renderToStaticMarkup(<StudyMarkdown content={tree} mode="mapa_mental" />)
  assert.match(html, /<pre/)
  assert.match(html, /whitespace-pre-wrap/)
  assert.match(html, /├── RAMO/)
  assert.match(html, /│   └── Conceito/)
})
