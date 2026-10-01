-- RAG-2.8: ativação transacional de uma ingestão RAG-V2 já validada.
-- Esta migration não executa ingestão, não altera documents e não toca no legado.

create or replace function public.activate_rag_ingestion_v2(
  p_ingestion_id bigint,
  p_material_id bigint
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ingestion public.rag_ingestoes%rowtype;
  v_document_count bigint;
begin
  if p_ingestion_id is null or p_material_id is null then
    raise exception 'p_ingestion_id e p_material_id são obrigatórios' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_material_id);

  select * into v_ingestion
    from public.rag_ingestoes
   where id = p_ingestion_id
   for update;

  if not found then
    raise exception 'ingestão RAG-V2 não encontrada' using errcode = 'P0002';
  end if;
  if v_ingestion.material_id <> p_material_id then
    raise exception 'a ingestão não pertence ao material informado' using errcode = '22023';
  end if;
  if v_ingestion.status <> 'processando' or v_ingestion.ativa then
    raise exception 'a ingestão não está apta para ativação' using errcode = '55000';
  end if;
  if v_ingestion.total_chunks <= 0 then
    raise exception 'a ingestão não possui chunks validados' using errcode = '22023';
  end if;

  select count(*) into v_document_count
    from public.documents
   where ingestion_id = p_ingestion_id
     and material_id = p_material_id;

  if v_document_count <> v_ingestion.total_chunks then
    raise exception 'a contagem de documents diverge de total_chunks' using errcode = '22023';
  end if;

  update public.rag_ingestoes
     set ativa = false
   where material_id = p_material_id
     and ativa = true
     and id <> p_ingestion_id;

  update public.rag_ingestoes
     set status = 'concluida', ativa = true,
         concluido_em = pg_catalog.now(), erro = null
   where id = p_ingestion_id;
end;
$$;

revoke all on function public.activate_rag_ingestion_v2(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.activate_rag_ingestion_v2(bigint, bigint)
  to service_role;

notify pgrst, 'reload schema';
