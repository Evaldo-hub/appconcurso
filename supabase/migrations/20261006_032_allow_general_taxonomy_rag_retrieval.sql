-- Permite que chunks gerais da disciplina, sem assunto/subassunto, participem
-- do retrieval de selecoes taxonomicas especificas. Mantem inalterados os
-- demais filtros, o threshold, o candidate pool e o contrato da RPC RAG-V2.
create or replace function public.match_documents_rag_v2(
  p_query_embedding public.vector(768),
  p_concurso_id bigint,
  p_prova_id bigint,
  p_match_count integer default 8,
  p_similarity_threshold double precision default null,
  p_disciplina text default null,
  p_assunto text default null,
  p_subassunto text default null
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
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_query_embedding is null then
    raise exception 'p_query_embedding é obrigatório' using errcode = '22004';
  end if;

  if p_concurso_id is null then
    raise exception 'p_concurso_id é obrigatório' using errcode = '22004';
  end if;

  if p_match_count is null or p_match_count < 1 or p_match_count > 50 then
    raise exception 'p_match_count deve estar entre 1 e 50' using errcode = '22023';
  end if;

  if p_similarity_threshold is not null
     and (p_similarity_threshold < 0 or p_similarity_threshold > 1) then
    raise exception 'p_similarity_threshold deve estar entre 0 e 1' using errcode = '22023';
  end if;

  return query
  select
    d.id as document_id,
    m.id as material_id,
    d.concurso_id,
    m.prova_id,
    d.content,
    d.pagina,
    d.chunk_index,
    d.disciplina,
    d.assunto,
    d.subassunto,
    coalesce(d.arquivo_origem, m.arquivo_origem) as arquivo_origem,
    m.github_path,
    i.id as ingestion_id,
    d.embedding_model,
    1 - (d.embedding operator(public.<=>) p_query_embedding) as similarity
  from public.documents d
  join public.materiais_concurso m
    on m.id = d.material_id
  join public.rag_ingestoes i
    on i.id = d.ingestion_id
  where d.concurso_id = p_concurso_id
    and m.concurso_id = p_concurso_id
    and m.ativo = true
    and (
      (p_prova_id is null and m.prova_id is null)
      or
      (
        p_prova_id is not null
        and (
          m.prova_id is null
          or m.prova_id = p_prova_id
        )
      )
    )
    and i.status = 'concluida'
    and i.ativa = true
    and i.material_id = m.id
    and i.ingestion_version = 'rag-v2'
    and i.embedding_provider = 'google'
    and i.embedding_model = 'gemini-embedding-2'
    and i.embedding_dimensions = 768
    and d.ingestion_version = 'rag-v2'
    and d.embedding_provider = i.embedding_provider
    and d.embedding_model = i.embedding_model
    and d.embedding_dimensions = i.embedding_dimensions
    and d.embedding is not null
    and (p_disciplina is null or d.disciplina = p_disciplina)
    and (p_assunto is null or d.assunto is null or d.assunto = p_assunto)
    and (p_subassunto is null or d.subassunto is null or d.subassunto = p_subassunto)
    and (
      p_similarity_threshold is null
      or 1 - (d.embedding operator(public.<=>) p_query_embedding) >= p_similarity_threshold
    )
  order by d.embedding operator(public.<=>) p_query_embedding
  limit p_match_count;
end;
$$;

revoke all on function public.match_documents_rag_v2(
  public.vector,
  bigint,
  bigint,
  integer,
  double precision,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.match_documents_rag_v2(
  public.vector,
  bigint,
  bigint,
  integer,
  double precision,
  text,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';
