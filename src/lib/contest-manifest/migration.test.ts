import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../../supabase/migrations/20260922_016_sincronizacao_manifesto.sql', import.meta.url), 'utf8').toLowerCase()
const position = (fragment: string) => {
  const index = sql.indexOf(fragment)
  assert.notEqual(index, -1, `Trecho não encontrado: ${fragment}`)
  return index
}

test('concurso novo usa slug e INSERT sem campos legados de cargo', () => {
  assert.match(sql, /where slug = p_manifesto->>'slug'/)
  assert.match(sql, /insert into public\.concursos \(slug, nome, orgao, banca, ano, edital, data_prova, descricao\)/)
})

test('concurso existente igual não recebe UPDATE desnecessário', () => {
  assert.match(sql, /is distinct from[\s\S]*update public\.concursos/)
  assert.match(sql, /v_concurso_iguais := 1/)
})

test('prova nova usa a chave concurso e codigo_prova', () => {
  assert.match(sql, /public\.provas where concurso_id=v_concurso_id and codigo_prova=v_item->>'codigo'/)
  assert.match(sql, /insert into public\.provas/)
})

test('prova existente alterada é atualizada', () => {
  assert.match(sql, /update public\.provas set nome=/)
  assert.match(sql, /v_provas_atualizadas := v_provas_atualizadas \+ 1/)
})

test('conteúdo novo usa a chave estável completa', () => {
  assert.match(sql, /concurso_id=v_concurso_id and prova_id=v_prova_id and disciplina=/)
  assert.match(sql, /assunto is not distinct from/)
  assert.match(sql, /subassunto is not distinct from/)
})

test('conteúdo existente igual não é regravado', () => {
  assert.match(sql, /v_conteudos_iguais := v_conteudos_iguais \+ 1/)
})

test('conteúdo alterado compara hierarquia nova e ignora ordem legado', () => {
  assert.match(sql, /v_atual\.ativo, v_atual\.disciplina_ordem, v_atual\.assunto_ordem, v_atual\.subassunto_ordem/)
  assert.doesNotMatch(sql, /v_atual\.ordem/)
})

test('advisory lock transacional usa o slug e precede qualquer acesso ao concurso', () => {
  const lock = position("perform pg_advisory_xact_lock(\n    hashtextextended(p_manifesto->>'slug', 0)\n  )")
  assert.ok(lock > position('sincronização de materiais bloqueada'))
  assert.ok(lock > position('sincronização de novos subassuntos bloqueada'))
  assert.ok(lock < position('select * into v_atual from public.concursos'))
  assert.ok(lock < position('insert into public.concursos'))
  assert.ok(lock < position('update public.concursos'))
})

test('registro somente Supabase não é excluído nem inativado', () => {
  assert.doesNotMatch(sql, /delete\s+from/)
  assert.doesNotMatch(sql, /not\s+in[\s\S]*ativo\s*=\s*false/)
})

test('ativo=false explícito atualiza a mesma chave', () => {
  assert.match(sql, /update public\.conteudo_programatico set ordem=case[\s\S]*ativo=\(v_item->>'ativo'\)::boolean/)
  assert.match(sql, /update public\.provas set[\s\S]*ativo=\(v_item->>'ativo'\)::boolean/)
})

test('falha intermediária aborta a função transacional inteira', () => {
  assert.match(sql, /create or replace function public\.admin_sincronizar_manifesto/)
  assert.match(sql, /raise exception/)
  assert.doesNotMatch(sql, /exception\s+when[\s\S]*commit/)
})

test('execução repetida é idempotente por escrever apenas quando distinto', () => {
  assert.ok((sql.match(/is distinct from/g) ?? []).length >= 3)
})

test('usuário não administrador é bloqueado no banco', () => {
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /not public\.usuario_e_admin\(\)/)
  assert.match(sql, /errcode = '42501'/)
})

test('materiais permanecem bloqueados e apenas contabilizados', () => {
  assert.match(sql, /sincronização de materiais bloqueada/)
  assert.doesNotMatch(sql, /insert into public\.materiais_concurso/)
  assert.match(sql, /from public\.materiais_concurso where concurso_id=v_concurso_id/)
})

test('ordem legado é determinística para linha-base e assunto', () => {
  const formulas = sql.match(/case when nullif\(v_item->>'assunto', ''\) is null[\s\S]*?then \(v_item->>'disciplina_ordem'\)::integer else \(v_item->>'disciplina_ordem'\)::integer \* 100 \+ \(v_item->>'assunto_ordem'\)::integer end/g) ?? []
  assert.equal(formulas.length, 2, 'A fórmula deve existir no INSERT e no UPDATE')
  assert.match(sql, /sincronização de novos subassuntos bloqueada/)
})

test('alterações de disciplina_ordem ou assunto_ordem recalculam ordem sem compará-la', () => {
  assert.match(sql, /elsif \(v_atual\.ativo, v_atual\.disciplina_ordem, v_atual\.assunto_ordem, v_atual\.subassunto_ordem\)[\s\S]*update public\.conteudo_programatico set ordem=case/)
  assert.doesNotMatch(sql, /v_atual\.ordem/)
})

test('bloqueios de materiais e subassuntos precedem lock e toda escrita', () => {
  const lock = position('perform pg_advisory_xact_lock')
  assert.ok(position('sincronização de materiais bloqueada') < lock)
  assert.ok(position('sincronização de novos subassuntos bloqueada') < lock)
  assert.ok(lock < position('insert into public.concursos'))
})

test('security definer usa search_path endurecido e permissões restritas', () => {
  assert.match(sql, /security definer\s+set search_path = pg_catalog, pg_temp/)
  assert.match(sql, /v_admin_id uuid := auth\.uid\(\)/)
  assert.match(sql, /not public\.usuario_e_admin\(\)/)
  assert.match(sql, /revoke all on function public\.admin_sincronizar_manifesto\(jsonb, jsonb\) from public, anon/)
  assert.match(sql, /grant execute on function public\.admin_sincronizar_manifesto\(jsonb, jsonb\) to authenticated/)
})
