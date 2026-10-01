-- PROPOSTA: importador universal em dois arquivos.
-- Não executar automaticamente. A função anterior permanece intacta para compatibilidade com o TRT8.

create or replace function public.admin_importar_concurso_universal(
  p_concurso jsonb,
  p_provas jsonb,
  p_conteudos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_concurso_id bigint;
  v_quantidade integer;
  v_prova_id bigint;
  v_item jsonb;
  v_atual record;
  v_provas_inseridas integer := 0;
  v_provas_atualizadas integer := 0;
  v_provas_existentes integer := 0;
  v_conteudos_inseridos integer := 0;
  v_conteudos_atualizados integer := 0;
  v_conteudos_existentes integer := 0;
begin
  if v_admin_id is null or not public.usuario_e_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if jsonb_typeof(p_concurso) is distinct from 'object' or jsonb_typeof(p_provas) is distinct from 'array' or jsonb_typeof(p_conteudos) is distinct from 'array' then
    raise exception 'Payload de importação inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_provas) = 0 then
    raise exception 'A importação deve conter ao menos uma prova' using errcode = '22023';
  end if;
  if nullif(btrim(p_concurso->>'nome'), '') is null then
    raise exception 'nome do concurso é obrigatório' using errcode = '22023';
  end if;
  if nullif(btrim(p_concurso->>'orgao'), '') is null then
    raise exception 'orgao do concurso é obrigatório' using errcode = '22023';
  end if;
  if nullif(btrim(p_concurso->>'banca'), '') is null then
    raise exception 'banca do concurso é obrigatória' using errcode = '22023';
  end if;
  if jsonb_typeof(p_concurso->'ano') is distinct from 'number'
     or coalesce((p_concurso->>'ano') !~ '^[0-9]+$', true) then
    raise exception 'ano do concurso deve ser um inteiro entre 1900 e 2200' using errcode = '22023';
  end if;
  if (p_concurso->>'ano')::numeric < 1900 or (p_concurso->>'ano')::numeric > 2200 then
    raise exception 'ano do concurso deve ser um inteiro entre 1900 e 2200' using errcode = '22023';
  end if;
  if p_concurso ? 'concurso_id' and p_concurso->'concurso_id' <> 'null'::jsonb
     and (jsonb_typeof(p_concurso->'concurso_id') is distinct from 'number'
       or (p_concurso->>'concurso_id') !~ '^[1-9][0-9]*$') then
    raise exception 'concurso_id deve ser um inteiro positivo' using errcode = '22023';
  end if;

  if nullif(p_concurso->>'concurso_id', '') is not null then
    select c.id into v_concurso_id
      from public.concursos c
      where c.id = (p_concurso->>'concurso_id')::bigint
        and c.nome = btrim(p_concurso->>'nome')
        and c.orgao = btrim(p_concurso->>'orgao')
        and c.banca is not distinct from btrim(p_concurso->>'banca')
        and c.ano is not distinct from (p_concurso->>'ano')::integer
        and nullif(btrim(c.edital), '') is not distinct from nullif(btrim(p_concurso->>'edital'), '');
    if v_concurso_id is null then
      raise exception 'concurso_id não corresponde aos metadados informados' using errcode = '23514';
    end if;
  else
    select count(*), min(c.id) into v_quantidade, v_concurso_id
      from public.concursos c
      where c.nome = btrim(p_concurso->>'nome')
        and c.orgao = btrim(p_concurso->>'orgao')
        and c.banca is not distinct from btrim(p_concurso->>'banca')
        and c.ano is not distinct from (p_concurso->>'ano')::integer
        and nullif(btrim(c.edital), '') is not distinct from nullif(btrim(p_concurso->>'edital'), '');
    if v_quantidade = 0 then raise exception 'Concurso não encontrado pelos metadados' using errcode = 'P0002'; end if;
    if v_quantidade > 1 then raise exception 'Concurso ambíguo; informe concurso_id' using errcode = '21000'; end if;
  end if;

  perform pg_advisory_xact_lock(v_concurso_id);
  -- Repete a validação sob lock para impedir troca de identidade entre Preview e confirmação.
  if not exists (
    select 1 from public.concursos c where c.id = v_concurso_id
      and c.nome = btrim(p_concurso->>'nome') and c.orgao = btrim(p_concurso->>'orgao')
      and c.banca is not distinct from btrim(p_concurso->>'banca')
      and c.ano is not distinct from (p_concurso->>'ano')::integer
      and nullif(btrim(c.edital), '') is not distinct from nullif(btrim(p_concurso->>'edital'), '')
  ) then raise exception 'Identidade do concurso mudou após o Preview' using errcode = '40001'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_provas) a
    group by btrim(a->>'codigo_prova') having count(*) > 1
  ) then raise exception 'codigo_prova duplicado no arquivo' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_provas) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Cada prova deve ser um objeto' using errcode = '22023';
    end if;
    if nullif(btrim(v_item->>'codigo_prova'), '') is null then
      raise exception 'codigo_prova é obrigatório' using errcode = '22023';
    end if;
    if nullif(btrim(v_item->>'cargo'), '') is null then
      raise exception 'cargo é obrigatório na prova %', btrim(v_item->>'codigo_prova') using errcode = '22023';
    end if;
    select count(*), min(p.id) into v_quantidade, v_prova_id
      from public.provas p where p.concurso_id = v_concurso_id and p.codigo_prova = btrim(v_item->>'codigo_prova');
    if v_quantidade > 1 then raise exception 'Código de prova duplicado no banco: %', btrim(v_item->>'codigo_prova') using errcode = '23505'; end if;
    if v_quantidade = 0 then
      insert into public.provas (concurso_id, codigo_prova, nome, cargo, especialidade, turno, ativo)
      values (v_concurso_id, btrim(v_item->>'codigo_prova'), concat_ws(' - ', btrim(v_item->>'cargo'), nullif(btrim(v_item->>'especialidade'), '')),
        btrim(v_item->>'cargo'), nullif(btrim(v_item->>'especialidade'), ''), nullif(btrim(v_item->>'turno'), ''), true)
      returning id into v_prova_id;
      v_provas_inseridas := v_provas_inseridas + 1;
    else
      select p.* into v_atual from public.provas p where p.id = v_prova_id for update;
      if (v_atual.cargo, nullif(btrim(v_atual.especialidade), '')) is distinct from
         (btrim(v_item->>'cargo'), nullif(btrim(v_item->>'especialidade'), '')) then
        raise exception 'Conflito de cargo/especialidade na prova %', btrim(v_item->>'codigo_prova') using errcode = '23514';
      elsif nullif(btrim(v_atual.turno), '') is distinct from nullif(btrim(v_item->>'turno'), '') then
        update public.provas set turno = nullif(btrim(v_item->>'turno'), '') where id = v_prova_id;
        v_provas_atualizadas := v_provas_atualizadas + 1;
      else
        v_provas_existentes := v_provas_existentes + 1;
      end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_conteudos) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Cada conteúdo deve ser um objeto' using errcode = '22023';
    end if;
    if nullif(btrim(v_item->>'prova_codigo'), '') is null then
      raise exception 'prova_codigo é obrigatório no conteúdo' using errcode = '22023';
    end if;
    if nullif(btrim(v_item->>'disciplina'), '') is null then
      raise exception 'disciplina é obrigatória no conteúdo da prova %', btrim(v_item->>'prova_codigo') using errcode = '22023';
    end if;
    if jsonb_typeof(v_item->'disciplina_ordem') is distinct from 'number'
       or coalesce((v_item->>'disciplina_ordem') !~ '^[1-9][0-9]*$', true) then
      raise exception 'disciplina_ordem deve ser um inteiro positivo' using errcode = '22023';
    end if;
    if v_item ? 'assunto_ordem' and v_item->'assunto_ordem' <> 'null'::jsonb
       and (jsonb_typeof(v_item->'assunto_ordem') is distinct from 'number' or (v_item->>'assunto_ordem') !~ '^[1-9][0-9]*$') then
      raise exception 'assunto_ordem deve ser um inteiro positivo ou NULL' using errcode = '22023';
    end if;
    if v_item ? 'subassunto_ordem' and v_item->'subassunto_ordem' <> 'null'::jsonb
       and (jsonb_typeof(v_item->'subassunto_ordem') is distinct from 'number' or (v_item->>'subassunto_ordem') !~ '^[1-9][0-9]*$') then
      raise exception 'subassunto_ordem deve ser um inteiro positivo ou NULL' using errcode = '22023';
    end if;
    select count(*), min(p.id) into v_quantidade, v_prova_id
      from public.provas p where p.concurso_id = v_concurso_id and p.codigo_prova = btrim(v_item->>'prova_codigo');
    if v_quantidade <> 1 then raise exception 'Prova não resolvida de forma única: %', btrim(v_item->>'prova_codigo') using errcode = '23503'; end if;

    select count(*) into v_quantidade from public.conteudo_programatico c
      where c.concurso_id = v_concurso_id and c.prova_id = v_prova_id
        and c.disciplina = btrim(v_item->>'disciplina')
        and nullif(btrim(c.assunto), '') is not distinct from nullif(btrim(v_item->>'assunto'), '')
        and nullif(btrim(c.subassunto), '') is not distinct from nullif(btrim(v_item->>'subassunto'), '');
    if v_quantidade > 1 then raise exception 'Conteúdo duplicado no banco para a prova %', btrim(v_item->>'prova_codigo') using errcode = '23505'; end if;
    if v_quantidade = 0 then
      insert into public.conteudo_programatico
        (concurso_id, prova_id, disciplina, assunto, subassunto, ordem, ativo, disciplina_ordem, assunto_ordem, subassunto_ordem)
      values
        (v_concurso_id, v_prova_id, btrim(v_item->>'disciplina'), nullif(btrim(v_item->>'assunto'), ''), nullif(btrim(v_item->>'subassunto'), ''),
         coalesce(nullif(v_item->>'subassunto_ordem', '')::integer, nullif(v_item->>'assunto_ordem', '')::integer, (v_item->>'disciplina_ordem')::integer),
         true, (v_item->>'disciplina_ordem')::integer, nullif(v_item->>'assunto_ordem', '')::integer, nullif(v_item->>'subassunto_ordem', '')::integer);
      v_conteudos_inseridos := v_conteudos_inseridos + 1;
    else
      select c.* into v_atual from public.conteudo_programatico c
        where c.concurso_id = v_concurso_id and c.prova_id = v_prova_id
          and c.disciplina = btrim(v_item->>'disciplina')
          and nullif(btrim(c.assunto), '') is not distinct from nullif(btrim(v_item->>'assunto'), '')
          and nullif(btrim(c.subassunto), '') is not distinct from nullif(btrim(v_item->>'subassunto'), '') for update;
      if (v_atual.disciplina_ordem, v_atual.assunto_ordem, v_atual.subassunto_ordem) is distinct from
         ((v_item->>'disciplina_ordem')::integer, nullif(v_item->>'assunto_ordem', '')::integer, nullif(v_item->>'subassunto_ordem', '')::integer) then
        update public.conteudo_programatico set
          ordem = coalesce(nullif(v_item->>'subassunto_ordem', '')::integer, nullif(v_item->>'assunto_ordem', '')::integer, (v_item->>'disciplina_ordem')::integer),
          disciplina_ordem = (v_item->>'disciplina_ordem')::integer,
          assunto_ordem = nullif(v_item->>'assunto_ordem', '')::integer,
          subassunto_ordem = nullif(v_item->>'subassunto_ordem', '')::integer
        where id = v_atual.id;
        v_conteudos_atualizados := v_conteudos_atualizados + 1;
      else
        v_conteudos_existentes := v_conteudos_existentes + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'concurso_id', v_concurso_id, 'executado_em', now(),
    'provas', jsonb_build_object('inseridos', v_provas_inseridas, 'atualizados', v_provas_atualizadas, 'existentes', v_provas_existentes),
    'conteudos', jsonb_build_object('inseridos', v_conteudos_inseridos, 'atualizados', v_conteudos_atualizados, 'existentes', v_conteudos_existentes)
  );
end;
$$;

revoke all on function public.admin_importar_concurso_universal(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_importar_concurso_universal(jsonb, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
