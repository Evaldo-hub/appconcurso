import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../../supabase/migrations/20260924_017_importador_universal_concursos.sql', import.meta.url), 'utf8').toLowerCase()

test('RPC exige administrador e valida novamente a identidade do concurso', () => {
  assert.match(sql, /not public\.usuario_e_admin\(\)/)
  assert.match(sql, /concurso_id não corresponde aos metadados/)
  assert.match(sql, /identidade do concurso mudou após o preview/)
})
test('RPC usa chave concurso e codigo_prova e bloqueia conflito', () => {
  assert.match(sql, /p\.concurso_id = v_concurso_id and p\.codigo_prova/)
  assert.match(sql, /conflito de cargo\/especialidade/)
})
test('RPC preserva todas as ordens, inclusive subassunto', () => {
  assert.match(sql, /disciplina_ordem, assunto_ordem, subassunto_ordem/)
  assert.match(sql, /nullif\(v_item->>'subassunto_ordem', ''\)::integer/)
})
test('advisory lock e comparação antes de insert garantem repetição idempotente', () => {
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /if v_quantidade = 0 then\s+insert into public\.provas/)
  assert.match(sql, /if v_quantidade = 0 then\s+insert into public\.conteudo_programatico/)
})
test('função é transacional, security definer e não altera a RPC legada', () => {
  assert.match(sql, /security definer\s+set search_path = pg_catalog, pg_temp/)
  assert.doesNotMatch(sql, /admin_sincronizar_manifesto/)
  assert.doesNotMatch(sql, /delete\s+from/)
})
test('RPC normaliza opcionais nos dois lados sem atualizar ausências equivalentes', () => {
  assert.match(sql, /nullif\(btrim\(c\.edital\), ''\) is not distinct from nullif\(btrim\(p_concurso->>'edital'\), ''\)/)
  assert.match(sql, /nullif\(btrim\(v_atual\.especialidade\), ''\)/)
  assert.match(sql, /nullif\(btrim\(v_atual\.turno\), ''\) is distinct from nullif\(btrim\(v_item->>'turno'\), ''\)/)
  assert.match(sql, /nullif\(btrim\(c\.assunto\), ''\) is not distinct from nullif\(btrim\(v_item->>'assunto'\), ''\)/)
  assert.match(sql, /nullif\(btrim\(c\.subassunto\), ''\) is not distinct from nullif\(btrim\(v_item->>'subassunto'\), ''\)/)
})
test('RPC rejeita prova sem codigo_prova ou cargo', () => {
  assert.match(sql, /if nullif\(btrim\(v_item->>'codigo_prova'\), ''\) is null then[\s\S]*raise exception 'codigo_prova é obrigatório'/)
  assert.match(sql, /if nullif\(btrim\(v_item->>'cargo'\), ''\) is null then[\s\S]*raise exception 'cargo é obrigatório/)
})
test('RPC rejeita conteúdo sem disciplina e ordens não positivas', () => {
  assert.match(sql, /if nullif\(btrim\(v_item->>'disciplina'\), ''\) is null then[\s\S]*raise exception 'disciplina é obrigatória/)
  assert.match(sql, /disciplina_ordem'[\s\S]*!~ '\^\[1-9\]\[0-9\]\*\$'/)
  assert.match(sql, /assunto_ordem deve ser um inteiro positivo ou null/)
  assert.match(sql, /subassunto_ordem deve ser um inteiro positivo ou null/)
})
