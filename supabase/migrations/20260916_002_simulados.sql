-- FASE 7: criação, execução e finalização segura de simulados.
-- Revisar no SQL Editor do Supabase antes de aplicar. Este arquivo não é executado pelo app.

alter table public.simulados
  add column if not exists data_criacao timestamptz not null default now(),
  add column if not exists data_conclusao timestamptz,
  add column if not exists questoes_respondidas integer not null default 0,
  add column if not exists acertos integer not null default 0,
  add column if not exists erros integer not null default 0,
  add column if not exists tempo_total integer,
  add column if not exists cronometro boolean not null default false;

alter table public.respostas_simulado
  add column if not exists alternativa_selecionada text,
  add column if not exists tempo_gasto integer,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.respostas_simulado
  drop constraint if exists respostas_simulado_alternativa_check;
alter table public.respostas_simulado
  add constraint respostas_simulado_alternativa_check
  check (alternativa_selecionada is null or alternativa_selecionada in ('A', 'B', 'C', 'D', 'E'));

create index if not exists simulados_usuario_status_idx on public.simulados (usuario_id, status);
create index if not exists simulado_questoes_simulado_ordem_idx on public.simulado_questoes (simulado_id, ordem);
create index if not exists respostas_simulado_simulado_questao_idx on public.respostas_simulado (simulado_id, questao_id);

alter table public.simulados enable row level security;
alter table public.simulado_questoes enable row level security;
alter table public.respostas_simulado enable row level security;

drop policy if exists "Usuário lê os próprios simulados" on public.simulados;
create policy "Usuário lê os próprios simulados" on public.simulados for select to authenticated
  using ((select auth.uid()) = usuario_id);

drop policy if exists "Usuário lê questões dos próprios simulados" on public.simulado_questoes;
create policy "Usuário lê questões dos próprios simulados" on public.simulado_questoes for select to authenticated
  using (exists (select 1 from public.simulados s where s.id = simulado_id and s.usuario_id = (select auth.uid())));

drop policy if exists "Usuário lê respostas dos próprios simulados" on public.respostas_simulado;
create policy "Usuário lê respostas dos próprios simulados" on public.respostas_simulado for select to authenticated
  using ((select auth.uid()) = usuario_id);

create or replace function public.criar_simulado(
  p_concurso_id bigint,
  p_disciplina text,
  p_assunto text,
  p_quantidade integer,
  p_cronometro boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_simulado_id bigint;
  v_disponiveis integer;
begin
  if v_usuario_id is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;
  if p_quantidade < 1 or p_quantidade > 100 then raise exception 'Quantidade inválida' using errcode = '22023'; end if;

  select count(*) into v_disponiveis from public.questoes_estudo q
  where (p_concurso_id is null or q.concurso_id = p_concurso_id)
    and (nullif(trim(p_disciplina), '') is null or q.disciplina = p_disciplina)
    and (nullif(trim(p_assunto), '') is null or q.assunto = p_assunto);
  if v_disponiveis < p_quantidade then raise exception 'Questões insuficientes: % disponíveis', v_disponiveis using errcode = 'P0001'; end if;

  insert into public.simulados (usuario_id, concurso_id, disciplina, assunto, quantidade_questoes, status, cronometro)
  values (v_usuario_id, p_concurso_id, nullif(trim(p_disciplina), ''), nullif(trim(p_assunto), ''), p_quantidade, 'em_andamento', p_cronometro)
  returning id into v_simulado_id;

  insert into public.simulado_questoes (simulado_id, questao_id, ordem)
  select v_simulado_id, escolhidas.id, row_number() over ()::integer
  from (
    select q.id from public.questoes_estudo q
    where (p_concurso_id is null or q.concurso_id = p_concurso_id)
      and (nullif(trim(p_disciplina), '') is null or q.disciplina = p_disciplina)
      and (nullif(trim(p_assunto), '') is null or q.assunto = p_assunto)
    order by random() limit p_quantidade
  ) escolhidas;
  return v_simulado_id;
end;
$$;

create or replace function public.salvar_resposta_simulado(p_simulado_id bigint, p_questao_id bigint, p_alternativa text, p_tempo_gasto integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usuario_id uuid := auth.uid(); v_gabarito text; v_correta boolean; v_alternativa text := upper(trim(p_alternativa));
begin
  if v_usuario_id is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;
  if v_alternativa not in ('A','B','C','D','E') then raise exception 'Alternativa inválida' using errcode = '22023'; end if;
  if not exists (select 1 from public.simulados s where s.id = p_simulado_id and s.usuario_id = v_usuario_id and s.status = 'em_andamento') then raise exception 'Simulado indisponível' using errcode = '42501'; end if;
  if not exists (select 1 from public.simulado_questoes sq where sq.simulado_id = p_simulado_id and sq.questao_id = p_questao_id) then raise exception 'Questão não pertence ao simulado' using errcode = '22023'; end if;
  select upper(trim(q.gabarito)) into v_gabarito from public.questoes_estudo q where q.id = p_questao_id;
  if v_gabarito !~ '^[A-E]$' then v_gabarito := substring(v_gabarito from '([A-E])\s*$'); end if;
  v_correta := v_alternativa = v_gabarito;

  update public.respostas_simulado set alternativa_selecionada = v_alternativa, correta = v_correta, tempo_gasto = p_tempo_gasto, updated_at = now()
  where simulado_id = p_simulado_id and questao_id = p_questao_id and usuario_id = v_usuario_id;
  if not found then
    insert into public.respostas_simulado (usuario_id, simulado_id, questao_id, alternativa_selecionada, correta, tempo_gasto)
    values (v_usuario_id, p_simulado_id, p_questao_id, v_alternativa, v_correta, p_tempo_gasto);
  end if;
end;
$$;

create or replace function public.finalizar_simulado(p_simulado_id bigint, p_tempo_total integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_usuario_id uuid := auth.uid();
begin
  if v_usuario_id is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;
  if not exists (select 1 from public.simulados s where s.id = p_simulado_id and s.usuario_id = v_usuario_id and s.status = 'em_andamento') then raise exception 'Simulado indisponível' using errcode = '42501'; end if;
  update public.simulados s set
    status = 'concluido', data_conclusao = now(), tempo_total = greatest(coalesce(p_tempo_total, 0), 0),
    questoes_respondidas = (select count(*) from public.respostas_simulado r where r.simulado_id = s.id and r.usuario_id = v_usuario_id and r.alternativa_selecionada is not null),
    acertos = (select count(*) from public.respostas_simulado r where r.simulado_id = s.id and r.usuario_id = v_usuario_id and r.correta),
    erros = (select count(*) from public.respostas_simulado r where r.simulado_id = s.id and r.usuario_id = v_usuario_id and not r.correta)
  where s.id = p_simulado_id and s.usuario_id = v_usuario_id;
end;
$$;

revoke all on function public.criar_simulado(bigint, text, text, integer, boolean) from public;
revoke all on function public.salvar_resposta_simulado(bigint, bigint, text, integer) from public;
revoke all on function public.finalizar_simulado(bigint, integer) from public;
grant execute on function public.criar_simulado(bigint, text, text, integer, boolean) to authenticated;
grant execute on function public.salvar_resposta_simulado(bigint, bigint, text, integer) to authenticated;
grant execute on function public.finalizar_simulado(bigint, integer) to authenticated;
grant select on public.simulados, public.simulado_questoes, public.respostas_simulado to authenticated;
revoke insert, update, delete on public.simulados, public.simulado_questoes, public.respostas_simulado from anon, authenticated;
