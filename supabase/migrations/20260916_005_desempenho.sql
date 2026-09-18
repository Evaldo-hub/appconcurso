-- FASE 10: painel analítico consolidado do usuário.
-- Revisar no SQL Editor do Supabase antes de aplicar.

create or replace function public.obter_painel_desempenho_seguro()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;

  with tentativas as (
    select r.created_at as data, q.disciplina::text, q.assunto::text, coalesce(q.dificuldade::text, 'Não informada') as dificuldade, r.correta
    from public.respostas_questoes r join public.questoes_estudo q on q.id = r.questao_id
    where r.usuario_id = auth.uid()
    union all
    select r.created_at, q.disciplina::text, q.assunto::text, coalesce(q.dificuldade::text, 'Não informada'), r.correta
    from public.respostas_simulado r
    join public.simulados s on s.id = r.simulado_id and s.status = 'concluido'
    join public.questoes_estudo q on q.id = r.questao_id
    where r.usuario_id = auth.uid()
  ), por_disciplina as (
    select coalesce(disciplina, 'Não informada') label, count(*) total, count(*) filter(where correta) acertos from tentativas group by disciplina
  ), por_assunto as (
    select coalesce(assunto, 'Não informado') label, count(*) total, count(*) filter(where correta) acertos from tentativas group by assunto
  ), diario as (
    select data::date dia, count(*) total, count(*) filter(where correta) acertos from tentativas where data >= current_date - interval '29 days' group by data::date
  ), erros_dificuldade as (
    select dificuldade label, count(*) total from tentativas where not correta group by dificuldade
  ), evolucao_simulados as (
    select s.id, s.data_conclusao, s.questoes_respondidas, s.acertos,
      case when s.quantidade_questoes > 0 then round((s.acertos::numeric / s.quantidade_questoes) * 100, 1) else 0 end percentual
    from public.simulados s where s.usuario_id = auth.uid() and s.status = 'concluido' order by s.data_conclusao desc limit 20
  ), totais as (
    select count(*) total, count(*) filter(where correta) acertos, count(*) filter(where not correta) erros from tentativas
  )
  select jsonb_build_object(
    'metricas', (select jsonb_build_object('respondidas', total, 'acertos', acertos, 'erros', erros, 'percentual', case when total > 0 then round((acertos::numeric/total)*100,1) else 0 end) from totais),
    'evolucao_diaria', coalesce((select jsonb_agg(jsonb_build_object('data', dia, 'total', total, 'acertos', acertos, 'percentual', case when total>0 then round((acertos::numeric/total)*100,1) else 0 end) order by dia) from diario), '[]'::jsonb),
    'por_disciplina', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'total', total, 'acertos', acertos, 'percentual', round((acertos::numeric/total)*100,1)) order by total desc) from por_disciplina), '[]'::jsonb),
    'por_assunto', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'total', total, 'acertos', acertos, 'percentual', round((acertos::numeric/total)*100,1)) order by total desc) from por_assunto), '[]'::jsonb),
    'erros_por_dificuldade', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'total', total) order by total desc) from erros_dificuldade), '[]'::jsonb),
    'evolucao_simulados', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data_conclusao, 'respondidas', questoes_respondidas, 'acertos', acertos, 'percentual', percentual) order by data_conclusao) from evolucao_simulados), '[]'::jsonb),
    'melhores_assuntos', coalesce((select jsonb_agg(item) from (select jsonb_build_object('label', label, 'total', total, 'acertos', acertos, 'percentual', round((acertos::numeric/total)*100,1)) item from por_assunto where total >= 3 order by (acertos::numeric/total) desc, total desc limit 5) x), '[]'::jsonb),
    'assuntos_atencao', coalesce((select jsonb_agg(item) from (select jsonb_build_object('label', label, 'total', total, 'acertos', acertos, 'percentual', round((acertos::numeric/total)*100,1)) item from por_assunto where total >= 3 order by (acertos::numeric/total), total desc limit 5) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.obter_painel_desempenho_seguro() from public;
grant execute on function public.obter_painel_desempenho_seguro() to authenticated;
