-- RAG-2.12E.2: persistência atômica mínima de questão RAG aprovada.
-- Esta migration não altera tabelas e não valida a FK histórica de questao_fontes.

create or replace function public.persistir_questao_rag_aprovada(
  p_concurso_id bigint,
  p_prova_id bigint,
  p_numero_questao integer,
  p_disciplina text,
  p_assunto text,
  p_subassunto text,
  p_banca text,
  p_dificuldade text,
  p_enunciado text,
  p_alternativa_a text,
  p_alternativa_b text,
  p_alternativa_c text,
  p_alternativa_d text,
  p_alternativa_e text,
  p_gabarito text,
  p_explicacao text,
  p_hash_questao text,
  p_document_ids bigint[]
) returns table (
  questao_id bigint,
  status text,
  fontes_inseridas integer
)
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_questao_id bigint;
  v_document_count integer;
  v_inserted_count integer;
begin
  if p_concurso_id is null or p_concurso_id <= 0
    or (p_prova_id is not null and p_prova_id <= 0)
    or p_numero_questao is null or p_numero_questao <= 0
    or nullif(trim(p_disciplina), '') is null
    or nullif(trim(p_assunto), '') is null
    or nullif(trim(p_banca), '') is null
    or nullif(trim(p_dificuldade), '') is null
    or nullif(trim(p_enunciado), '') is null
    or nullif(trim(p_alternativa_a), '') is null
    or nullif(trim(p_alternativa_b), '') is null
    or nullif(trim(p_alternativa_c), '') is null
    or nullif(trim(p_alternativa_d), '') is null
    or nullif(trim(p_alternativa_e), '') is null
    or upper(trim(p_gabarito)) not in ('A', 'B', 'C', 'D', 'E')
    or nullif(trim(p_explicacao), '') is null
    or p_hash_questao !~ '^[0-9a-f]{64}$'
    or p_document_ids is null
    or cardinality(p_document_ids) = 0 then
    raise exception 'Parâmetros inválidos para persistência RAG' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(p_document_ids) as x(document_id) where x.document_id is null or x.document_id <= 0)
    or cardinality(p_document_ids) <> (select count(distinct x.document_id) from unnest(p_document_ids) as x(document_id)) then
    raise exception 'Document IDs inválidos ou duplicados' using errcode = '22023';
  end if;

  -- Mesmos critérios de elegibilidade e escopo usados pelo retrieval RAG-V2.
  select count(*) into v_document_count
  from unnest(p_document_ids) as requested(document_id)
  join public.documents d on d.id = requested.document_id
  join public.materiais_concurso m on m.id = d.material_id
  join public.rag_ingestoes r on r.id = d.ingestion_id
  where d.concurso_id = p_concurso_id
    and m.concurso_id = p_concurso_id
    and m.ativo = true
    and r.material_id = m.id
    and r.status = 'concluida'
    and r.ativa = true
    and r.ingestion_version = 'rag-v2'
    and r.embedding_provider = 'google'
    and r.embedding_model = 'gemini-embedding-2'
    and r.embedding_dimensions = 768
    and d.ingestion_version = 'rag-v2'
    and d.embedding_provider = r.embedding_provider
    and d.embedding_model = r.embedding_model
    and d.embedding_dimensions = r.embedding_dimensions
    and d.embedding is not null
    and (
      (p_prova_id is null and m.prova_id is null)
      or (p_prova_id is not null and (m.prova_id is null or m.prova_id = p_prova_id))
    );

  if v_document_count <> cardinality(p_document_ids) then
    raise exception 'Um ou mais documents não pertencem ao escopo RAG-V2 válido' using errcode = '22023';
  end if;

  begin
    insert into public.questoes_estudo (
      concurso_id, prova_id, disciplina, assunto, subassunto, banca,
      dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c,
      alternativa_d, alternativa_e, gabarito, explicacao, numero_questao,
      resposta_id, arquivo_origem, tipo_origem, hash_questao
    ) values (
      p_concurso_id, p_prova_id, trim(p_disciplina), trim(p_assunto),
      nullif(trim(p_subassunto), ''), trim(p_banca), trim(p_dificuldade),
      trim(p_enunciado), trim(p_alternativa_a), trim(p_alternativa_b),
      trim(p_alternativa_c), trim(p_alternativa_d), trim(p_alternativa_e),
      upper(trim(p_gabarito)), trim(p_explicacao), p_numero_questao,
      null, null, 'ia_gerada', p_hash_questao
    ) returning id into v_questao_id;
  exception when unique_violation then
    select q.id into v_questao_id
    from public.questoes_estudo q
    where q.hash_questao = p_hash_questao
    order by q.id
    limit 1;

    if v_questao_id is null and p_prova_id is not null then
      select q.id into v_questao_id
      from public.questoes_estudo q
      where q.prova_id = p_prova_id
        and q.enunciado = trim(p_enunciado)
      order by q.id
      limit 1;
    end if;

    if v_questao_id is null then raise; end if;
    return query select v_questao_id, 'duplicada'::text, 0;
    return;
  end;

  insert into public.questao_fontes (questao_id, document_id, pagina)
  select v_questao_id, d.id, d.pagina
  from unnest(p_document_ids) with ordinality as requested(document_id, position)
  join public.documents d on d.id = requested.document_id
  order by requested.position;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> cardinality(p_document_ids) then
    raise exception 'Quantidade de fontes inseridas divergente' using errcode = '22023';
  end if;

  return query select v_questao_id, 'cadastrada'::text, v_inserted_count;
end;
$$;

revoke all on function public.persistir_questao_rag_aprovada(
  bigint, bigint, integer, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint[]
) from public, anon, authenticated;

grant execute on function public.persistir_questao_rag_aprovada(
  bigint, bigint, integer, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, bigint[]
) to service_role;

notify pgrst, 'reload schema';
