import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { IndividualValidationResults, SemanticValidationSummary } from './semantic-validation-summary'

const render = (validation: Parameters<typeof SemanticValidationSummary>[0]['validation']) =>
  renderToStaticMarkup(<SemanticValidationSummary validation={validation} />)

test('response com validação renderiza os indicadores e correção', () => {
  const html = render({
    analisadas: 5,
    aprovadas_primeira_validacao: 3,
    enviadas_correcao: 2,
    corrigidas_e_aprovadas: 1,
    rejeitadas_validacao: 1,
  })
  assert.match(html, /Validação semântica/)
  assert.match(html, /Aprovadas diretamente/)
  assert.match(html, /Corrigidas e aprovadas/)
  assert.match(html, /2 questão\(ões\) precisou\(aram\)/)
})

test('response sem validação não renderiza a seção adicional', () => {
  assert.equal(render(undefined), '')
  assert.equal(render(null), '')
})

test('valores zero são renderizados corretamente', () => {
  const html = render({
    analisadas: 1,
    aprovadas_primeira_validacao: 1,
    enviadas_correcao: 0,
    corrigidas_e_aprovadas: 0,
    rejeitadas_validacao: 0,
  })
  assert.match(html, />0<\/p>/)
  assert.doesNotMatch(html, /precisou\(aram\)/)
})

test('rejeição é apresentada como bloqueio sem classificá-la como erro técnico', () => {
  const html = render({
    analisadas: 1,
    aprovadas_primeira_validacao: 0,
    enviadas_correcao: 1,
    corrigidas_e_aprovadas: 0,
    rejeitadas_validacao: 1,
  })
  assert.match(html, /bloqueada\(s\) pela validação/)
  assert.doesNotMatch(html, /erro técnico/i)
})

test('resultado individual mostra aprovação direta, correção, motivo traduzido e rejeição', () => {
  const html = renderToStaticMarkup(<IndividualValidationResults results={[
    { numero_questao: 1, questao_id: 10, status: 'cadastrada', status_validacao: 'aprovada_diretamente' },
    { numero_questao: 2, questao_id: 11, status: 'cadastrada', status_validacao: 'corrigida_e_aprovada', problemas_correcao: ['gabarito_inconsistente'] },
    { numero_questao: 3, questao_id: null, status_validacao: 'rejeitada_validacao', problemas: ['multiplas_alternativas_corretas'] },
  ]} />)
  assert.match(html, /Aprovada diretamente/)
  assert.match(html, /Corrigida e aprovada/)
  assert.match(html, /Gabarito inconsistente/)
  assert.match(html, /Rejeitada pelo validador/)
  assert.match(html, /Mais de uma alternativa correta/)
  assert.match(html, /href="\/questoes\/11"/)
})

test('resultado legado sem status de validação continua renderizável com texto', () => {
  const html = renderToStaticMarkup(<IndividualValidationResults results={[
    { numero_questao: 1, questao_id: 10, status: 'cadastrada' },
  ]} />)
  assert.match(html, /Status de validação não informado/)
  assert.match(html, /Persistência: Cadastrada/)
})
