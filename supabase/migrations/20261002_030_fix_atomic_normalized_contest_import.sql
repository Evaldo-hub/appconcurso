-- FASE TRT8-2G: corrige qualificacoes SQL invalidas na RPC normalizada.
-- Reaplica a mesma assinatura com CREATE OR REPLACE; nao executa bootstrap.

begin;

create or replace function public.importar_concurso_normalizado_atomico(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_concurso jsonb;
  v_provas jsonb;
  v_conteudos jsonb;
  v_vinculos jsonb;
  v_esperadas jsonb;
  v_item jsonb;
  v_atual record;
  v_concurso_id bigint;
  v_prova_id bigint;
  v_conteudo_id bigint;
  v_provas_total integer;
  v_conteudos_total integer;
  v_vinculos_total integer;
  v_provas_inseridas integer := 0;
  v_provas_reutilizadas integer := 0;
  v_conteudos_inseridos integer := 0;
  v_conteudos_reutilizados integer := 0;
  v_vinculos_inseridos integer := 0;
  v_vinculos_reutilizados integer := 0;
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'IMPORT_PAYLOAD_INVALIDO: objeto JSON esperado' using errcode = '22023';
  end if;

  v_concurso := p_payload->'concurso';
  v_provas := p_payload->'provas';
  v_conteudos := p_payload->'conteudos';
  v_vinculos := p_payload->'vinculos';
  v_esperadas := p_payload->'contagens_esperadas';
  if pg_catalog.jsonb_typeof(v_concurso) is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_provas) is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_conteudos) is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_vinculos) is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_esperadas) is distinct from 'object' then
    raise exception 'IMPORT_PAYLOAD_INVALIDO: concurso, provas, conteudos, vinculos e contagens_esperadas sao obrigatorios' using errcode = '22023';
  end if;

  if not (v_concurso ?& array['slug','nome','orgao','banca','ano','edital','data_prova','descricao'])
     or nullif(pg_catalog.btrim(v_concurso->>'slug'), '') is null
     or (v_concurso->>'slug') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'IMPORT_CONCURSO_SLUG_INVALIDO' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_concurso->'slug') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_concurso->'nome') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_concurso->'orgao') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_concurso->'banca') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_concurso->'ano') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_concurso->'edital') not in ('string', 'null')
     or pg_catalog.jsonb_typeof(v_concurso->'data_prova') not in ('string', 'null')
     or pg_catalog.jsonb_typeof(v_concurso->'descricao') not in ('string', 'null')
     or nullif(pg_catalog.btrim(v_concurso->>'nome'), '') is null
     or nullif(pg_catalog.btrim(v_concurso->>'orgao'), '') is null
     or nullif(pg_catalog.btrim(v_concurso->>'banca'), '') is null
     or (v_concurso->>'ano') !~ '^[0-9]+$'
     or (v_concurso->>'ano')::integer not between 1900 and 2200
     or (v_concurso->'data_prova' <> 'null'::jsonb and coalesce((v_concurso->>'data_prova') !~ '^\d{4}-\d{2}-\d{2}$', true)) then
    raise exception 'IMPORT_CONCURSO_IDENTIDADE_INVALIDA' using errcode = '22023';
  end if;

  v_provas_total := pg_catalog.jsonb_array_length(v_provas);
  v_conteudos_total := pg_catalog.jsonb_array_length(v_conteudos);
  v_vinculos_total := pg_catalog.jsonb_array_length(v_vinculos);
  if v_provas_total = 0 or v_conteudos_total = 0 or v_vinculos_total = 0 then
    raise exception 'IMPORT_COLECAO_VAZIA' using errcode = '22023';
  end if;
  if not (v_esperadas ?& array['provas','conteudos','vinculos'])
     or pg_catalog.jsonb_typeof(v_esperadas->'provas') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_esperadas->'conteudos') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_esperadas->'vinculos') is distinct from 'number'
     or coalesce(v_esperadas->>'provas', '') !~ '^[0-9]+$'
     or coalesce(v_esperadas->>'conteudos', '') !~ '^[0-9]+$'
     or coalesce(v_esperadas->>'vinculos', '') !~ '^[0-9]+$'
     or (v_esperadas->>'provas')::integer <> v_provas_total
     or (v_esperadas->>'conteudos')::integer <> v_conteudos_total
     or (v_esperadas->>'vinculos')::integer <> v_vinculos_total then
    raise exception 'IMPORT_CONTAGENS_DIVERGENTES' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_provas) p(value)
    where pg_catalog.jsonb_typeof(p.value) is distinct from 'object'
       or not (p.value ?& array['codigo_prova','nome','cargo','especialidade','turno','arquivo_origem','ativo'])
       or pg_catalog.jsonb_typeof(p.value->'codigo_prova') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p.value->'nome') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p.value->'cargo') not in ('string', 'null')
       or pg_catalog.jsonb_typeof(p.value->'especialidade') not in ('string', 'null')
       or pg_catalog.jsonb_typeof(p.value->'turno') not in ('string', 'null')
       or pg_catalog.jsonb_typeof(p.value->'arquivo_origem') not in ('string', 'null')
       or nullif(pg_catalog.btrim(p.value->>'codigo_prova'), '') is null
       or nullif(pg_catalog.btrim(p.value->>'nome'), '') is null
       or pg_catalog.jsonb_typeof(p.value->'ativo') is distinct from 'boolean'
  ) then raise exception 'IMPORT_PROVA_INVALIDA' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_provas) p(value)
    group by pg_catalog.btrim(p.value->>'codigo_prova') having count(*) > 1
  ) then raise exception 'IMPORT_CODIGO_PROVA_DUPLICADO' using errcode = '22023'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_conteudos) c(value)
    where pg_catalog.jsonb_typeof(c.value) is distinct from 'object'
       or not (c.value ?& array['disciplina','assunto','subassunto','chave_canonica','versao_normalizacao','ativo'])
       or pg_catalog.jsonb_typeof(c.value->'disciplina') is distinct from 'string'
       or pg_catalog.jsonb_typeof(c.value->'assunto') not in ('string', 'null')
       or pg_catalog.jsonb_typeof(c.value->'subassunto') not in ('string', 'null')
       or pg_catalog.jsonb_typeof(c.value->'chave_canonica') is distinct from 'string'
       or pg_catalog.jsonb_typeof(c.value->'versao_normalizacao') is distinct from 'string'
       or nullif(pg_catalog.btrim(c.value->>'disciplina'), '') is null
       or coalesce(c.value->>'chave_canonica', '') !~ '^[0-9a-f]{64}$'
       or c.value->>'versao_normalizacao' is distinct from 'canonical-v1'
       or pg_catalog.jsonb_typeof(c.value->'ativo') is distinct from 'boolean'
       or (c.value->'assunto' <> 'null'::jsonb and nullif(pg_catalog.btrim(c.value->>'assunto'), '') is null)
       or (c.value->'subassunto' <> 'null'::jsonb and nullif(pg_catalog.btrim(c.value->>'subassunto'), '') is null)
       or (nullif(pg_catalog.btrim(c.value->>'subassunto'), '') is not null
           and nullif(pg_catalog.btrim(c.value->>'assunto'), '') is null)
  ) then raise exception 'IMPORT_CONTEUDO_INVALIDO' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_conteudos) c(value)
    group by c.value->>'chave_canonica' having count(*) > 1
  ) then raise exception 'IMPORT_CHAVE_CANONICA_DUPLICADA' using errcode = '22023'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_vinculos) l(value)
    where pg_catalog.jsonb_typeof(l.value) is distinct from 'object'
       or not (l.value ?& array['codigo_prova','chave_canonica','ativo','disciplina_ordem','assunto_ordem','subassunto_ordem','ordem','origem'])
       or pg_catalog.jsonb_typeof(l.value->'codigo_prova') is distinct from 'string'
       or pg_catalog.jsonb_typeof(l.value->'chave_canonica') is distinct from 'string'
       or pg_catalog.jsonb_typeof(l.value->'origem') is distinct from 'string'
       or nullif(pg_catalog.btrim(l.value->>'codigo_prova'), '') is null
       or coalesce(l.value->>'chave_canonica', '') !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(l.value->'ativo') is distinct from 'boolean'
       or l.value->>'origem' is distinct from 'trt8-2026-manifest-v1'
       or pg_catalog.jsonb_typeof(l.value->'disciplina_ordem') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(l.value->'assunto_ordem') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(l.value->'subassunto_ordem') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(l.value->'ordem') not in ('number', 'null')
       or (l.value->'disciplina_ordem' <> 'null'::jsonb and coalesce(l.value->>'disciplina_ordem', '') !~ '^[0-9]+$')
       or (l.value->'assunto_ordem' <> 'null'::jsonb and coalesce(l.value->>'assunto_ordem', '') !~ '^[0-9]+$')
       or (l.value->'subassunto_ordem' <> 'null'::jsonb and coalesce(l.value->>'subassunto_ordem', '') !~ '^[0-9]+$')
       or (l.value->'ordem' <> 'null'::jsonb and coalesce(l.value->>'ordem', '') !~ '^[0-9]+$')
  ) then raise exception 'IMPORT_VINCULO_INVALIDO' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_vinculos) l(value)
    group by l.value->>'codigo_prova', l.value->>'chave_canonica' having count(*) > 1
  ) then raise exception 'IMPORT_VINCULO_DUPLICADO' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_vinculos) l(value)
    where not exists (select 1 from pg_catalog.jsonb_array_elements(v_provas) p(value) where p.value->>'codigo_prova' = l.value->>'codigo_prova')
  ) then raise exception 'IMPORT_VINCULO_PROVA_NAO_REFERENCIADA' using errcode = '23503'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_vinculos) l(value)
    where not exists (select 1 from pg_catalog.jsonb_array_elements(v_conteudos) c(value) where c.value->>'chave_canonica' = l.value->>'chave_canonica')
  ) then raise exception 'IMPORT_VINCULO_CONTEUDO_NAO_REFERENCIADO' using errcode = '23503'; end if;

  -- Serializa concorrentes pelo slug antes de resolver/criar a identidade real.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_concurso->>'slug', 0));
  select c.* into v_atual from public.concursos c where c.slug = v_concurso->>'slug' for update;
  if not found then
    insert into public.concursos (slug, nome, orgao, banca, ano, edital, data_prova, descricao)
    values (
      v_concurso->>'slug', pg_catalog.btrim(v_concurso->>'nome'), pg_catalog.btrim(v_concurso->>'orgao'),
      pg_catalog.btrim(v_concurso->>'banca'), (v_concurso->>'ano')::integer,
      nullif(pg_catalog.btrim(v_concurso->>'edital'), ''),
      nullif(v_concurso->>'data_prova', '')::date,
      nullif(pg_catalog.btrim(v_concurso->>'descricao'), '')
    ) returning id into v_concurso_id;
  else
    v_concurso_id := v_atual.id;
    if (v_atual.nome, v_atual.orgao, v_atual.banca, v_atual.ano, v_atual.edital, v_atual.data_prova, v_atual.descricao)
       is distinct from (
         pg_catalog.btrim(v_concurso->>'nome'), pg_catalog.btrim(v_concurso->>'orgao'), pg_catalog.btrim(v_concurso->>'banca'),
         (v_concurso->>'ano')::integer, nullif(pg_catalog.btrim(v_concurso->>'edital'), ''),
         nullif(v_concurso->>'data_prova', '')::date, nullif(pg_catalog.btrim(v_concurso->>'descricao'), '')
       ) then raise exception 'IMPORT_CONCURSO_CONFLITO: slug %', v_concurso->>'slug' using errcode = '23514'; end if;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(v_provas) loop
    select p.* into v_atual from public.provas p
      where p.concurso_id = v_concurso_id and p.codigo_prova = pg_catalog.btrim(v_item->>'codigo_prova') for update;
    if not found then
      insert into public.provas (concurso_id, codigo_prova, nome, cargo, especialidade, turno, arquivo_origem, ativo)
      values (
        v_concurso_id, pg_catalog.btrim(v_item->>'codigo_prova'), pg_catalog.btrim(v_item->>'nome'), nullif(pg_catalog.btrim(v_item->>'cargo'), ''),
        nullif(pg_catalog.btrim(v_item->>'especialidade'), ''), nullif(pg_catalog.btrim(v_item->>'turno'), ''),
        nullif(pg_catalog.btrim(v_item->>'arquivo_origem'), ''), (v_item->>'ativo')::boolean
      ) returning id into v_prova_id;
      v_provas_inseridas := v_provas_inseridas + 1;
    else
      v_prova_id := v_atual.id;
      if (v_atual.nome, v_atual.cargo, v_atual.especialidade, v_atual.turno, v_atual.arquivo_origem, v_atual.ativo)
         is distinct from (
           pg_catalog.btrim(v_item->>'nome'), nullif(pg_catalog.btrim(v_item->>'cargo'), ''), nullif(pg_catalog.btrim(v_item->>'especialidade'), ''),
           nullif(pg_catalog.btrim(v_item->>'turno'), ''), nullif(pg_catalog.btrim(v_item->>'arquivo_origem'), ''),
           (v_item->>'ativo')::boolean
         ) then raise exception 'IMPORT_PROVA_CONFLITO: codigo %', v_item->>'codigo_prova' using errcode = '23514'; end if;
      v_provas_reutilizadas := v_provas_reutilizadas + 1;
    end if;
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(v_conteudos) loop
    select c.* into v_atual from public.conteudos_catalogo c
      where c.concurso_id = v_concurso_id and c.chave_canonica = v_item->>'chave_canonica' for update;
    if not found then
      insert into public.conteudos_catalogo
        (concurso_id, disciplina, assunto, subassunto, chave_canonica, versao_normalizacao, ativo)
      values (
        v_concurso_id, pg_catalog.btrim(v_item->>'disciplina'), nullif(pg_catalog.btrim(v_item->>'assunto'), ''),
        nullif(pg_catalog.btrim(v_item->>'subassunto'), ''), v_item->>'chave_canonica',
        v_item->>'versao_normalizacao', (v_item->>'ativo')::boolean
      ) returning id into v_conteudo_id;
      v_conteudos_inseridos := v_conteudos_inseridos + 1;
    else
      v_conteudo_id := v_atual.id;
      if (v_atual.disciplina, v_atual.assunto, v_atual.subassunto, v_atual.versao_normalizacao, v_atual.ativo)
         is distinct from (
           pg_catalog.btrim(v_item->>'disciplina'), nullif(pg_catalog.btrim(v_item->>'assunto'), ''),
           nullif(pg_catalog.btrim(v_item->>'subassunto'), ''), v_item->>'versao_normalizacao', (v_item->>'ativo')::boolean
         ) then raise exception 'IMPORT_CATALOGO_CONFLITO: chave %', v_item->>'chave_canonica' using errcode = '23514'; end if;
      v_conteudos_reutilizados := v_conteudos_reutilizados + 1;
    end if;
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(v_vinculos) loop
    select p.id into strict v_prova_id from public.provas p
      where p.concurso_id = v_concurso_id and p.codigo_prova = v_item->>'codigo_prova';
    select c.id into strict v_conteudo_id from public.conteudos_catalogo c
      where c.concurso_id = v_concurso_id and c.chave_canonica = v_item->>'chave_canonica';
    select pc.* into v_atual from public.prova_conteudos pc
      where pc.prova_id = v_prova_id and pc.conteudo_id = v_conteudo_id for update;
    if not found then
      insert into public.prova_conteudos
        (prova_id, conteudo_id, concurso_id, ativo, disciplina_ordem, assunto_ordem, subassunto_ordem, ordem, origem)
      values (
        v_prova_id, v_conteudo_id, v_concurso_id, (v_item->>'ativo')::boolean,
        (v_item->>'disciplina_ordem')::integer, (v_item->>'assunto_ordem')::integer,
        (v_item->>'subassunto_ordem')::integer, (v_item->>'ordem')::integer, v_item->>'origem'
      );
      v_vinculos_inseridos := v_vinculos_inseridos + 1;
    else
      if (v_atual.concurso_id, v_atual.ativo, v_atual.disciplina_ordem, v_atual.assunto_ordem,
          v_atual.subassunto_ordem, v_atual.ordem, v_atual.origem)
         is distinct from (
           v_concurso_id, (v_item->>'ativo')::boolean, (v_item->>'disciplina_ordem')::integer,
           (v_item->>'assunto_ordem')::integer, (v_item->>'subassunto_ordem')::integer,
           (v_item->>'ordem')::integer, v_item->>'origem'
         ) then raise exception 'IMPORT_VINCULO_CONFLITO: prova %, chave %', v_item->>'codigo_prova', v_item->>'chave_canonica' using errcode = '23514'; end if;
      v_vinculos_reutilizados := v_vinculos_reutilizados + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'concurso_id', v_concurso_id,
    'provas_total', v_provas_total, 'provas_inseridas', v_provas_inseridas, 'provas_reutilizadas', v_provas_reutilizadas,
    'conteudos_total', v_conteudos_total, 'conteudos_inseridos', v_conteudos_inseridos, 'conteudos_reutilizados', v_conteudos_reutilizados,
    'vinculos_total', v_vinculos_total, 'vinculos_inseridos', v_vinculos_inseridos, 'vinculos_reutilizados', v_vinculos_reutilizados
  );
exception
  when invalid_text_representation or numeric_value_out_of_range
       or invalid_datetime_format or datetime_field_overflow then
    raise exception 'IMPORT_VALOR_ESCALAR_INVALIDO' using errcode = '22023';
  when no_data_found then
    raise exception 'IMPORT_REFERENCIA_NAO_RESOLVIDA' using errcode = '23503';
  when too_many_rows then
    raise exception 'IMPORT_IDENTIDADE_AMBIGUA' using errcode = '23505';
end;
$function$;

revoke all on function public.importar_concurso_normalizado_atomico(jsonb) from public, anon, authenticated;
grant execute on function public.importar_concurso_normalizado_atomico(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
