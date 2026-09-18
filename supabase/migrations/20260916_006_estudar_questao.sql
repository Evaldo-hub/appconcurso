-- FASE 11: leitura segura de conteúdo em cache e fontes de uma questão respondida.
-- A geração via n8n/RAG será adicionada na Fase 12.

create or replace function public.obter_estudo_questao_seguro(p_questao_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado' using errcode = '42501'; end if;

  if not exists (
    select 1 from public.respostas_questoes r where r.usuario_id = auth.uid() and r.questao_id = p_questao_id
    union all
    select 1 from public.respostas_simulado r join public.simulados s on s.id = r.simulado_id
      where r.usuario_id = auth.uid() and r.questao_id = p_questao_id and s.status = 'concluido'
  ) then
    raise exception 'Responda à questão antes de estudá-la' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'questao', jsonb_build_object('id', q.id, 'disciplina', q.disciplina, 'assunto', q.assunto, 'subassunto', q.subassunto, 'enunciado', q.enunciado),
    'conteudos', jsonb_build_object(
      'explicacao', coalesce((select e.conteudo from public.estudo_questao e where e.questao_id=q.id and e.tipo='explicacao' order by e.id desc limit 1), q.explicacao),
      'resumo', (select e.conteudo from public.estudo_questao e where e.questao_id=q.id and e.tipo='resumo' order by e.id desc limit 1),
      'aula', (select e.conteudo from public.estudo_questao e where e.questao_id=q.id and e.tipo='aula' order by e.id desc limit 1)
    ),
    'fontes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'arquivo', f.arquivo_origem, 'pagina', f.pagina) order by f.id) from public.questao_fontes f where f.questao_id=q.id), '[]'::jsonb)
  ) into v_result
  from public.questoes_estudo q where q.id = p_questao_id;

  if v_result is null then raise exception 'Questão não encontrada' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

revoke all on function public.obter_estudo_questao_seguro(bigint) from public;
grant execute on function public.obter_estudo_questao_seguro(bigint) to authenticated;
