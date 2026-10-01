-- RAG-2.25B: reserva atomica e versionada de reprocessamento RAG-V2.
-- A ingestao ativa anterior permanece intocada ate activate_rag_ingestion_v2.

create or replace function public.start_rag_reprocessing_v2(p_material_id bigint)
returns table (ingestion_id bigint, material_id bigint, status text)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_material public.materiais_concurso%rowtype;
  v_active_count bigint;
  v_active_completed_count bigint;
  v_processing_count bigint;
  v_ingestion_id bigint;
begin
  if p_material_id is null or p_material_id <= 0 then
    raise exception 'MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Mesmo dominio de lock da primeira reserva e da ativacao.
  perform pg_catalog.pg_advisory_xact_lock(p_material_id);

  select * into v_material
  from public.materiais_concurso
  where id = p_material_id
  for share;

  if not found then
    raise exception 'MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_material.ativo then
    raise exception 'MATERIAL_INACTIVE' using errcode = '55000';
  end if;

  select
    count(*) filter (where r.ativa),
    count(*) filter (where r.ativa and r.status = 'concluida'),
    count(*) filter (where r.status = 'processando')
  into v_active_count, v_active_completed_count, v_processing_count
  from public.rag_ingestoes r
  where r.material_id = p_material_id
    and r.ingestion_version = 'rag-v2';

  if v_processing_count > 0 then
    raise exception 'INGESTION_ALREADY_PROCESSING' using errcode = '55000';
  end if;
  if v_active_count = 0 then
    raise exception 'REPROCESSING_REQUIRES_ACTIVE_INGESTION' using errcode = '55000';
  end if;
  if v_active_count <> 1 or v_active_completed_count <> 1 then
    raise exception 'REPROCESSING_ACTIVE_STATE_INCONSISTENT' using errcode = '55000';
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

revoke all on function public.start_rag_reprocessing_v2(bigint)
  from public, anon, authenticated;
grant execute on function public.start_rag_reprocessing_v2(bigint) to service_role;

notify pgrst, 'reload schema';
