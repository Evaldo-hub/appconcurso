import assert from 'node:assert/strict'
import test from 'node:test'
import { parseContestManifestText } from './schema'
import type { ContestManifest } from './types'

const validManifest = (): ContestManifest => ({
  schema_version: 1,
  slug: 'trt8-2022-c336',
  nome: 'TRT8 - Concurso C-336/2022',
  orgao: 'TRT8',
  banca: 'Cebraspe',
  ano: 2022,
  edital: 'C-336/2022',
  data_prova: '2022-12-11',
  descricao: null,
  conteudos_comuns: [{ codigo: 'BASICOS', nome: 'Conhecimentos básicos', ativo: true, disciplinas: [{ disciplina: 'Língua Portuguesa', ordem: 1, ativo: true, assuntos: [{ assunto: 'Ortografia oficial', ordem: 1, ativo: true, subassuntos: [{ subassunto: 'Acentuação gráfica', ordem: 1, ativo: true }] }] }] }],
  provas: [{ codigo: 'C01', nome: 'TRT8 2022 - Cargo 1', cargo: 'Analista Judiciário', especialidade: 'Área Administrativa', turno: null, arquivo_origem: 'cargos/C01/prova.pdf', ativo: true, conteudos_comuns: ['BASICOS'], conteudo_programatico: [{ disciplina: 'Direito Constitucional', ordem: 2, ativo: true, assuntos: [] }] }],
  materiais: [{ tipo_fonte: 'edital', tipo_arquivo: 'pdf', titulo: 'Edital', arquivo: 'edital/abertura.pdf', prova_codigo: null, disciplina: null, assunto: null, subassunto: null, ativo: true }],
})

const parse = (value: unknown) => parseContestManifestText(JSON.stringify(value))
const expectInvalidPath = (value: unknown, path: string) => { const result = parse(value); assert.equal(result.success, false); if (!result.success) assert.ok(result.errors.some((error) => error.path.includes(path)), JSON.stringify(result.errors)) }

test('aceita manifesto TRT8 válido', () => assert.equal(parse(validManifest()).success, true))
test('rejeita schema_version inválido', () => { const value = validManifest() as unknown as { schema_version: number }; value.schema_version = 2; expectInvalidPath(value, 'schema_version') })
test('rejeita slug inválido', () => { const value = validManifest(); value.slug = 'TRT8 C336'; expectInvalidPath(value, 'slug') })
test('rejeita prova duplicada', () => { const value = validManifest(); value.provas.push(structuredClone(value.provas[0])); expectInvalidPath(value, 'provas[1].codigo') })
test('rejeita conteúdo comum inexistente', () => { const value = validManifest(); value.provas[0].conteudos_comuns = ['INEXISTENTE']; expectInvalidPath(value, 'provas[0].conteudos_comuns[0]') })
test('rejeita disciplina duplicada após expansão', () => { const value = validManifest(); value.provas[0].conteudo_programatico.push(structuredClone(value.conteudos_comuns[0].disciplinas[0])); expectInvalidPath(value, 'provas[0].conteudo_programatico[1].disciplina') })
test('rejeita material apontando para prova inexistente', () => { const value = validManifest(); value.materiais[0].prova_codigo = 'C99'; expectInvalidPath(value, 'materiais[0].prova_codigo') })
test('rejeita assunto sem disciplina', () => { const value = validManifest(); value.materiais[0] = { ...value.materiais[0], prova_codigo: 'C01', assunto: 'Ortografia oficial' }; expectInvalidPath(value, 'materiais[0].assunto') })
test('rejeita caminho com ..', () => { const value = validManifest(); value.materiais[0].arquivo = '../arquivo.pdf'; expectInvalidPath(value, 'materiais[0].arquivo') })
test('rejeita data inválida', () => { const value = validManifest(); value.data_prova = '2022-02-30'; expectInvalidPath(value, 'data_prova') })
test('rejeita campo desconhecido', () => { const value = { ...validManifest(), desconhecido: true }; expectInvalidPath(value, 'manifesto') })
test('rejeita JSON sintaticamente inválido', () => { const result = parseContestManifestText('{'); assert.equal(result.success, false); if (!result.success) assert.equal(result.errors[0].path, 'manifesto') })
