-- Fase 15: leitura segura do catálogo pelo aplicativo.
-- Libera somente as colunas necessárias e mantém gabarito/explicação fora do frontend.

alter table public.concursos enable row level security;
alter table public.provas enable row level security;
alter table public.questoes_estudo enable row level security;

drop policy if exists "Usuários autenticados leem concursos" on public.concursos;
create policy "Usuários autenticados leem concursos"
  on public.concursos for select to authenticated using (true);

drop policy if exists "Usuários autenticados leem provas" on public.provas;
create policy "Usuários autenticados leem provas"
  on public.provas for select to authenticated using (true);

drop policy if exists "Usuários autenticados leem questões" on public.questoes_estudo;
create policy "Usuários autenticados leem questões"
  on public.questoes_estudo for select to authenticated using (true);

-- Visitantes anônimos não acessam o catálogo diretamente.
revoke all on table public.concursos from anon;
revoke all on table public.provas from anon;
revoke all on table public.questoes_estudo from anon;

-- Remove eventuais permissões amplas antes de conceder acesso por coluna.
revoke select on table public.concursos from authenticated;
revoke select on table public.provas from authenticated;
revoke select on table public.questoes_estudo from authenticated;

grant select (id, nome, orgao, ano)
  on public.concursos to authenticated;

grant select (id, concurso_id, nome, cargo)
  on public.provas to authenticated;

grant select (
  id,
  concurso_id,
  prova_id,
  banca,
  disciplina,
  assunto,
  subassunto,
  dificuldade,
  enunciado,
  alternativa_a,
  alternativa_b,
  alternativa_c,
  alternativa_d,
  alternativa_e
) on public.questoes_estudo to authenticated;

-- O gabarito e a explicação continuam acessíveis apenas pelas funções seguras
-- responder_questao() e obter_estudo_questao_seguro().

notify pgrst, 'reload schema';
