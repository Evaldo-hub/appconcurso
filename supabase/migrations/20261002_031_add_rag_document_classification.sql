-- FASE TRT8-5B: classificação documental aditiva para priorização controlada.
-- Revisar e aplicar isoladamente. Não usar db push/migration repair em lote.

alter table public.materiais_concurso
  add column if not exists categoria_documental text not null default 'OUTRO';

alter table public.materiais_concurso
  add constraint materiais_concurso_categoria_documental_check
  check (categoria_documental in (
    'EDITAL',
    'NORMA_OFICIAL',
    'MANUAL_OFICIAL',
    'DOCUMENTACAO_TECNICA_OFICIAL',
    'PROVA_ANTERIOR',
    'MATERIAL_EXPLICATIVO',
    'OUTRO'
  )) not valid;

alter table public.materiais_concurso
  validate constraint materiais_concurso_categoria_documental_check;

create index if not exists idx_materiais_concurso_categoria_documental
  on public.materiais_concurso (concurso_id, prova_id, categoria_documental)
  where ativo = true;

create or replace function public.match_documents_rag_v2_classified(
  p_query_embedding public.vector(768),
  p_concurso_id bigint,
  p_prova_id bigint,
  p_match_count integer default 8,
  p_similarity_threshold double precision default null,
  p_disciplina text default null,
  p_assunto text default null,
  p_subassunto text default null,
  p_query_intent text default 'CONHECIMENTO'
)
returns table (
  document_id bigint,
  material_id bigint,
  concurso_id bigint,
  prova_id bigint,
  content text,
  pagina integer,
  chunk_index integer,
  disciplina text,
  assunto text,
  subassunto text,
  arquivo_origem text,
  github_path text,
  ingestion_id bigint,
  embedding_model text,
  similarity double precision,
  categoria_documental text,
  category_priority integer
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_query_intent not in ('CERTAME', 'CONHECIMENTO') then
    raise exception 'p_query_intent deve ser CERTAME ou CONHECIMENTO' using errcode = '22023';
  end if;

  return query
  select
    r.document_id,
    r.material_id,
    r.concurso_id,
    r.prova_id,
    r.content,
    r.pagina,
    r.chunk_index,
    r.disciplina,
    r.assunto,
    r.subassunto,
    r.arquivo_origem,
    r.github_path,
    r.ingestion_id,
    r.embedding_model,
    r.similarity,
    m.categoria_documental,
    case
      when p_query_intent = 'CERTAME' and m.categoria_documental = 'EDITAL' then 0
      when p_query_intent = 'CERTAME' and m.categoria_documental in ('NORMA_OFICIAL', 'MANUAL_OFICIAL', 'DOCUMENTACAO_TECNICA_OFICIAL') then 1
      when p_query_intent = 'CERTAME' then 2
      when m.categoria_documental = 'NORMA_OFICIAL' then 0
      when m.categoria_documental in ('MANUAL_OFICIAL', 'DOCUMENTACAO_TECNICA_OFICIAL') then 1
      when m.categoria_documental in ('MATERIAL_EXPLICATIVO', 'PROVA_ANTERIOR') then 2
      when m.categoria_documental = 'OUTRO' then 3
      else 4
    end as category_priority
  from public.match_documents_rag_v2(
    p_query_embedding,
    p_concurso_id,
    p_prova_id,
    p_match_count,
    p_similarity_threshold,
    p_disciplina,
    p_assunto,
    p_subassunto
  ) r
  join public.materiais_concurso m on m.id = r.material_id
  order by category_priority, r.similarity desc, r.document_id
  limit p_match_count;
end;
$$;

revoke all on function public.match_documents_rag_v2_classified(
  public.vector, bigint, bigint, integer, double precision, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.match_documents_rag_v2_classified(
  public.vector, bigint, bigint, integer, double precision, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';
