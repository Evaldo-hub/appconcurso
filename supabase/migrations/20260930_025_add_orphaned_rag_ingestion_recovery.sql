-- APP-3.1F.3: transicao administrativa explicita de uma ingestao RAG-V2
-- comprovadamente orfa. Nao detecta abandono por idade e nao remove documents.

create or replace function public.fail_orphaned_rag_ingestion_v2(
  p_ingestion_id bigint,
  p_reason text
)
returns table (ingestion_id bigint, material_id bigint, status text, ativa boolean, erro text)
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_material_id bigint;
  v_ingestion public.rag_ingestoes%rowtype;
begin
  if p_ingestion_id is null or p_ingestion_id <= 0 then
    raise exception 'RAG_ORPHAN_INGESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_reason is null or p_reason <> 'ORPHANED_INGESTION_EXECUTOR_TERMINATED' then
    raise exception 'RAG_ORPHAN_REASON_INVALID' using errcode = '22023';
  end if;

  select r.material_id into v_material_id
  from public.rag_ingestoes r
  where r.id = p_ingestion_id;

  if not found then
    raise exception 'RAG_ORPHAN_INGESTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Serializa com INITIAL, RETRY_FAILED, REPROCESS_ACTIVE e ativacao.
  perform pg_catalog.pg_advisory_xact_lock(v_material_id);

  select * into v_ingestion
  from public.rag_ingestoes
  where id = p_ingestion_id
  for update;

  if not found then
    raise exception 'RAG_ORPHAN_INGESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ingestion.material_id <> v_material_id
    or v_ingestion.status <> 'processando'
    or v_ingestion.ativa then
    raise exception 'RAG_ORPHAN_STATE_CHANGED' using errcode = '55000';
  end if;

  update public.rag_ingestoes
  set status = 'erro',
      ativa = false,
      erro = p_reason,
      concluido_em = pg_catalog.now()
  where id = p_ingestion_id;

  return query select p_ingestion_id, v_material_id, 'erro'::text, false,
    'ORPHANED_INGESTION_EXECUTOR_TERMINATED'::text;
end;
$function$;

revoke all on function public.fail_orphaned_rag_ingestion_v2(bigint, text)
  from public, anon, authenticated;
grant execute on function public.fail_orphaned_rag_ingestion_v2(bigint, text)
  to service_role;

notify pgrst, 'reload schema';
