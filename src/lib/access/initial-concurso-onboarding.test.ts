import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assertInitialConcursoId } from '../auth/initial-concurso'

const migrationPath = 'supabase/migrations/20260930_027_add_initial_concurso_onboarding.sql'
const sql = readFile(migrationPath, 'utf8')

test('catalogo anonimo retorna somente campos permitidos e ordenacao deterministica', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.listar_concursos_onboarding[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /returns table \([\s\S]*id bigint,[\s\S]*nome text,[\s\S]*orgao text,[\s\S]*banca text,[\s\S]*ano integer,[\s\S]*cargo text,[\s\S]*especialidade text/i)
  assert.doesNotMatch(block, /quest|prova|material|document|gabarito|administrador/i)
  assert.match(block, /order by c\.ano desc nulls last, c\.nome asc, c\.id asc/i)
  assert.match(source, /grant execute on function public\.listar_concursos_onboarding\(\) to anon, authenticated/i)
})

test('concurso inicial obrigatorio aceita somente inteiro positivo seguro', () => {
  assert.equal(assertInitialConcursoId(7), 7)
  for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertInitialConcursoId(value), /concurso válido/)
  }
})

test('trigger valida metadata e existencia do concurso antes das insercoes', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.criar_acesso_estudante_novo[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /new\.raw_user_meta_data ->> 'concurso_inicial_id'/i)
  assert.match(block, /CONCURSO_INICIAL_INVALIDO/)
  assert.match(block, /exists \(select 1 from public\.concursos/)
  assert.match(block, /CONCURSO_INICIAL_NAO_ENCONTRADO/)
  assert.ok(block.indexOf('CONCURSO_INICIAL_NAO_ENCONTRADO') < block.indexOf('insert into public.acessos_estudante'))
})

test('novo usuario recebe acesso temporal, um vinculo principal ativo e preferencia atual', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.criar_acesso_estudante_novo[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /insert into public\.acessos_estudante[\s\S]*interval '30 days'[\s\S]*'ativo'/i)
  assert.match(block, /insert into public\.usuario_concursos[\s\S]*new\.id, v_concurso_id, 'ativo', true, null/i)
  assert.match(block, /insert into public\.usuario_preferencias[\s\S]*new\.id, v_concurso_id/i)
  assert.equal((block.match(/insert into public\.usuario_concursos/gi) ?? []).length, 1)
})

test('funcao de trigger nao fica exposta e nao muda grants de escrita', async () => {
  const source = await sql
  assert.match(source, /revoke all on function public\.criar_acesso_estudante_novo\(\) from public, anon, authenticated/i)
  assert.doesNotMatch(source, /grant execute on function public\.criar_acesso_estudante_novo/i)
  assert.doesNotMatch(source, /grant (insert|update|delete|all) on (table )?public\.usuario_concursos to authenticated/i)
})

test('frontend envia somente metadata e nunca grava tabelas de autorizacao', async () => {
  const [service, page] = await Promise.all([
    readFile('src/services/auth.service.ts', 'utf8'),
    readFile('src/app/(auth)/register/page.tsx', 'utf8'),
  ])
  assert.match(service, /concursoInicialId: number/)
  assert.match(service, /concurso_inicial_id: concursoInicialId/)
  assert.match(page, /listar_concursos_onboarding/)
  assert.match(page, /concursoInicialId/)
  assert.doesNotMatch(`${service}\n${page}`, /from\(['"]usuario_(?:concursos|preferencias)['"]\)|insert\s*\(/i)
})

test('metadata nao participa de nenhuma autorizacao futura e RAG/catalogo ficam intactos', async () => {
  const source = await sql
  assert.doesNotMatch(source, /usuario_pode_acessar_concurso[\s\S]*raw_user_meta_data|alter table public\.(concursos|provas|questoes_estudo|conteudo_programatico)|match_documents_rag_v2/i)
})
