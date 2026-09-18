-- FASE 8: resultado seguro e revisão de simulados concluídos.
-- Revisar no SQL Editor do Supabase antes de aplicar. Este arquivo não é executado pelo app.

-- Durante a prova, o cliente pode recuperar a alternativa marcada, mas não a correção.
revoke select on public.respostas_simulado from authenticated;
grant select (id, usuario_id, simulado_id, questao_id, alternativa_selecionada, tempo_gasto, created_at, updated_at)
  on public.respostas_simulado to authenticated;

create or replace function public.obter_resultado_simulado_seguro(p_simulado_id bigint)
returns table (
  ordem integer,
  questao_id bigint,
  disciplina text,
  assunto text,
  subassunto text,
  dificuldade text,
  enunciado text,
  alternativa_a text,
  alternativa_b text,
  alternativa_c text,
  alternativa_d text,
  alternativa_e text,
  alternativa_selecionada text,
  correta boolean,
  alternativa_correta text,
  explicacao text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.simulados s
    where s.id = p_simulado_id
      and s.usuario_id = auth.uid()
      and s.status = 'concluido'
  ) then
    raise exception 'Resultado indisponível' using errcode = '42501';
  end if;

  return query
  select
    sq.ordem,
    q.id,
    q.disciplina,
    q.assunto,
    q.subassunto,
    q.dificuldade,
    q.enunciado,
    q.alternativa_a,
    q.alternativa_b,
    q.alternativa_c,
    q.alternativa_d,
    q.alternativa_e,
    r.alternativa_selecionada,
    coalesce(r.correta, false),
    case
      when upper(trim(q.gabarito)) ~ '^[A-E]$' then upper(trim(q.gabarito))
      else substring(upper(trim(q.gabarito)) from '([A-E])\s*$')
    end,
    q.explicacao
  from public.simulado_questoes sq
  join public.questoes_estudo q on q.id = sq.questao_id
  left join lateral (
    select rs.alternativa_selecionada, rs.correta
    from public.respostas_simulado rs
    where rs.simulado_id = sq.simulado_id
      and rs.questao_id = sq.questao_id
      and rs.usuario_id = auth.uid()
    order by rs.updated_at desc, rs.id desc
    limit 1
  ) r on true
  where sq.simulado_id = p_simulado_id
  order by sq.ordem;
end;
$$;

revoke all on function public.obter_resultado_simulado_seguro(bigint) from public;
grant execute on function public.obter_resultado_simulado_seguro(bigint) to authenticated;

create or replace function public.refazer_erros_simulado(p_simulado_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_novo_id bigint;
  v_quantidade integer;
  v_origem public.simulados%rowtype;
begin
  if v_usuario_id is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;
  select * into v_origem from public.simulados s where s.id = p_simulado_id and s.usuario_id = v_usuario_id and s.status = 'concluido';
  if not found then raise exception 'Simulado indisponível' using errcode = '42501'; end if;

  select count(distinct r.questao_id) into v_quantidade from public.respostas_simulado r
  where r.simulado_id = p_simulado_id and r.usuario_id = v_usuario_id and not r.correta;
  if v_quantidade = 0 then raise exception 'Este simulado não possui erros para refazer' using errcode = 'P0001'; end if;

  insert into public.simulados (usuario_id, concurso_id, disciplina, assunto, quantidade_questoes, status, cronometro)
  values (v_usuario_id, v_origem.concurso_id, v_origem.disciplina, v_origem.assunto, v_quantidade, 'em_andamento', v_origem.cronometro)
  returning id into v_novo_id;

  insert into public.simulado_questoes (simulado_id, questao_id, ordem)
  select v_novo_id, erros.questao_id, row_number() over (order by erros.ordem)::integer
  from (
    select distinct on (sq.questao_id) sq.questao_id, sq.ordem
    from public.simulado_questoes sq
    join public.respostas_simulado r on r.simulado_id = sq.simulado_id and r.questao_id = sq.questao_id
    where sq.simulado_id = p_simulado_id and r.usuario_id = v_usuario_id and not r.correta
    order by sq.questao_id, sq.ordem
  ) erros;
  return v_novo_id;
end;
$$;

revoke all on function public.refazer_erros_simulado(bigint) from public;
grant execute on function public.refazer_erros_simulado(bigint) to authenticated;
