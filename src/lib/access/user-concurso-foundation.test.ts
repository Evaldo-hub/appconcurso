import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = 'supabase/migrations/20260930_026_add_user_concurso_access.sql'
const sql = readFile(migrationPath, 'utf8')

test('schema cria vinculo, preferencia e principal ativo unico', async () => {
  const source = await sql
  assert.match(source, /create table public\.usuario_concursos[\s\S]*primary key \(usuario_id, concurso_id\)/i)
  assert.match(source, /usuario_id uuid not null references auth\.users\(id\) on delete cascade/i)
  assert.match(source, /concurso_id bigint not null references public\.concursos\(id\) on delete restrict/i)
  assert.match(source, /check \(status <> 'revogado' or principal = false\)/i)
  assert.match(source, /unique index usuario_concursos_um_principal_ativo_idx[\s\S]*where principal = true and status = 'ativo'/i)
  assert.match(source, /create table public\.usuario_preferencias[\s\S]*concurso_atual_id bigint references public\.concursos\(id\) on delete set null/i)
})

test('acesso cobre sem vinculo, ativo, revogado e administrador sem confiar em usuario parametrizado', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.usuario_pode_acessar_concurso[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /auth\.uid\(\)/)
  assert.match(block, /public\.usuario_e_admin\(\)/)
  assert.match(block, /uc\.status = 'ativo'/)
  assert.doesNotMatch(block, /p_usuario_id/)
  assert.match(block, /security invoker[\s\S]*search_path = pg_catalog, pg_temp/i)
})

test('concurso atual exige autorizacao e nao concede acesso', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.definir_concurso_atual[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /not public\.usuario_pode_acessar_concurso\(p_concurso_id\)/)
  assert.match(block, /CONCURSO_NAO_AUTORIZADO/)
  assert.match(block, /insert into public\.usuario_preferencias/)
  assert.doesNotMatch(block, /insert into public\.usuario_concursos|update public\.usuario_concursos/)
})

test('admin concede segundo concurso, troca principal atomicamente e revogacao limpa principal e atual', async () => {
  const source = await sql
  const block = source.match(/create or replace function public\.admin_definir_acesso_concurso[\s\S]*?\$function\$;/i)?.[0] ?? ''
  assert.match(block, /v_admin_id is null or not public\.usuario_e_admin\(\)/)
  assert.match(block, /pg_advisory_xact_lock/)
  assert.match(block, /update public\.usuario_concursos[\s\S]*set principal = false/)
  assert.match(block, /on conflict \(usuario_id, concurso_id\) do update/)
  assert.match(block, /set status = 'revogado',[\s\S]*principal = false/)
  assert.match(block, /update public\.usuario_preferencias[\s\S]*concurso_atual_id = null/)
})

test('RLS permite apenas leitura propria e bloqueia escrita direta authenticated', async () => {
  const source = await sql
  assert.match(source, /alter table public\.usuario_concursos enable row level security/)
  assert.match(source, /using \(usuario_id = \(select auth\.uid\(\)\)\)/)
  assert.match(source, /revoke all on table public\.usuario_concursos from public, anon, authenticated/)
  assert.match(source, /revoke all on table public\.usuario_preferencias from public, anon, authenticated/)
  assert.match(source, /grant select on table public\.usuario_concursos to authenticated/)
  assert.match(source, /grant select on table public\.usuario_preferencias to authenticated/)
  assert.doesNotMatch(source, /grant (insert|update|delete|all) on table public\.usuario_(concursos|preferencias) to authenticated/i)
})

test('migration nao altera catalogo, RAG, cadastro nem faz backfill', async () => {
  const source = await sql
  assert.doesNotMatch(source, /alter table public\.(concursos|provas|questoes_estudo|conteudo_programatico)/i)
  assert.doesNotMatch(source, /match_documents_rag_v2|retrieveRagContext/i)
  assert.doesNotMatch(source, /insert into public\.usuario_concursos\s*(?:\([^;]*?\))?\s*select/i)
})

test('consulta de compatibilidade e estritamente read-only', async () => {
  const source = await readFile('supabase/queries/20260930_user_concurso_backfill_audit.sql', 'utf8')
  assert.match(source, /total_auth_users/)
  assert.match(source, /total_administradores/)
  assert.match(source, /total_estudantes/)
  assert.match(source, /estudantes_sem_concurso_ativo/)
  assert.doesNotMatch(source, /\b(insert|update|delete|alter|create|drop|truncate)\b/i)
})
