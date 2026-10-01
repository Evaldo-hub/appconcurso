-- RAG-2.23B: reserva atomica da primeira ingestao RAG-V2.
-- Nao ingere materiais, nao altera registros historicos e nao chama providers.

do $audit$
begin
  if exists (
    select 1 from public.rag_ingestoes
    where status = 'processando' and ingestion_version = 'rag-v2'
    group by material_id
    having count(*) > 1
  ) then
    raise exception 'RAG_INGESTION_RESERVATION_MIGRATION_NEEDS_DATA_REVIEW'
      using errcode = 'P0001';
  end if;
end;
$audit$;

create unique index uq_rag_ingestoes_material_rag_v2_processando
  on public.rag_ingestoes (material_id)
  where status = 'processando' and ingestion_version = 'rag-v2';

create or replace function public.start_rag_ingestion_v2(p_material_id bigint)
returns table (ingestion_id bigint, material_id bigint, status text)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_material public.materiais_concurso%rowtype;
  v_existing_status text;
  v_ingestion_id bigint;
begin
  if p_material_id is null or p_material_id <= 0 then
    raise exception 'MATERIAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Reutiliza a mesma chave por material adotada pela ativacao RAG-V2.
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

  select r.status into v_existing_status
  from public.rag_ingestoes r
  where r.material_id = p_material_id and r.ingestion_version = 'rag-v2'
  order by case r.status when 'processando' then 1 when 'concluida' then 2 else 3 end, r.id desc
  limit 1;

  if found then
    if v_existing_status = 'processando' then
      raise exception 'INGESTION_ALREADY_PROCESSING' using errcode = '55000';
    elsif v_existing_status = 'concluida' then
      raise exception 'INITIAL_INGESTION_ALREADY_COMPLETED' using errcode = '55000';
    else
      raise exception 'INITIAL_INGESTION_REQUIRES_RETRY_FLOW' using errcode = '55000';
    end if;
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

revoke all on function public.start_rag_ingestion_v2(bigint)
  from public, anon, authenticated;
grant execute on function public.start_rag_ingestion_v2(bigint) to service_role;

notify pgrst, 'reload schema';
