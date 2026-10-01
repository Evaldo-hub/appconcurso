-- APP-3.1F.1: reserva atomica para retry de materiais com historico RAG-V2
-- exclusivamente em erro/inativo. INITIAL e REPROCESS_ACTIVE permanecem separados.

create or replace function public.start_rag_ingestion_retry_v2(p_material_id bigint)
returns table (ingestion_id bigint, material_id bigint, status text)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_material public.materiais_concurso%rowtype;
  v_history_count bigint;
  v_failed_count bigint;
  v_processing_count bigint;
  v_active_completed_count bigint;
  v_ingestion_id bigint;
begin
  if p_material_id is null or p_material_id <= 0 then
    raise exception 'RAG_RETRY_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Mesmo dominio de lock de INITIAL, REPROCESS_ACTIVE e ativacao.
  perform pg_catalog.pg_advisory_xact_lock(p_material_id);

  select * into v_material
  from public.materiais_concurso
  where id = p_material_id
  for share;

  if not found then
    raise exception 'RAG_RETRY_MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_material.ativo then
    raise exception 'RAG_RETRY_MATERIAL_INACTIVE' using errcode = '55000';
  end if;

  select
    count(*),
    count(*) filter (where r.status = 'erro' and not r.ativa),
    count(*) filter (where r.status = 'processando'),
    count(*) filter (where r.status = 'concluida' and r.ativa)
  into v_history_count, v_failed_count, v_processing_count, v_active_completed_count
  from public.rag_ingestoes r
  where r.material_id = p_material_id
    and r.ingestion_version = 'rag-v2';

  if v_history_count = 0 or v_failed_count = 0 then
    raise exception 'RAG_RETRY_NO_FAILED_HISTORY' using errcode = '55000';
  end if;
  if v_processing_count > 0 then
    raise exception 'RAG_RETRY_PROCESSING_EXISTS' using errcode = '55000';
  end if;
  if v_active_completed_count > 0 then
    raise exception 'RAG_RETRY_ACTIVE_INGESTION_EXISTS' using errcode = '55000';
  end if;

  insert into public.rag_ingestoes (
    material_id, embedding_provider, embedding_model, embedding_dimensions,
    chunking_version, ingestion_version, status, ativa
  ) values (
    p_material_id, 'google', 'gemini-embedding-2', 768,
    'semantic-v1', 'rag-v2', 'processando', false
  ) returning id into v_ingestion_id;

  return query select v_ingestion_id, p_material_id, 'processando'::text;
end;
$function$;

revoke all on function public.start_rag_ingestion_retry_v2(bigint)
  from public, anon, authenticated;
grant execute on function public.start_rag_ingestion_retry_v2(bigint)
  to service_role;

notify pgrst, 'reload schema';
