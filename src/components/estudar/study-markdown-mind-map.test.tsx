import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MindMapContent, MindMapVisual } from '@/components/questoes/mind-map-visual'

test('fallback textual usa pre-wrap e preserva mapas antigos', () => {
  const tree = 'TEMA CENTRAL\n│\n├── RAMO\n│   └── Conceito'
  const html = renderToStaticMarkup(<MindMapContent content={tree} />)
  assert.match(html, /<pre/)
  assert.match(html, /whitespace-pre-wrap/)
  assert.match(html, /├── RAMO/)
  assert.match(html, /│   └── Conceito/)
})

test('MindMapVisual renderiza tema, ramos, itens e cards de memorização', () => {
  const html = renderToStaticMarkup(<MindMapVisual map={{
    titulo: 'Gestão de processos',
    descricao: 'Síntese visual.',
    ramos: [
      { titulo: 'Estratégia', icone: 'target', itens: [{ titulo: 'Objetivo', descricao: 'Direciona a atuação.' }] },
      { titulo: 'Fluxos', icone: 'workflow', itens: [{ titulo: 'Etapa', descricao: 'Organiza o trabalho.' }] },
    ],
    memorizar: ['Ponto um', 'Ponto dois', 'Ponto três'],
  }} />)
  assert.match(html, /Gestão de processos/)
  assert.match(html, /Estratégia/)
  assert.match(html, /Objetivo/)
  assert.match(html, /O que memorizar para a prova/i)
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /grid gap-5 sm:grid-cols-2/)
  assert.doesNotMatch(html, /dangerouslySetInnerHTML|overflow-x-auto/)
})
