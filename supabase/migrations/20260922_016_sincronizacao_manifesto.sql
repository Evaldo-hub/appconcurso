-- PROPOSTA Fase 4. Aplicar somente após revisão explícita.
-- Uma chamada de função PostgreSQL é uma única transação: qualquer exceção reverte tudo.

create or replace function public.admin_sincronizar_manifesto(
  p_manifesto jsonb,
  p_conteudos jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_concurso_id bigint;
  v_prova_id bigint;
  v_item jsonb;
  v_atual record;
  v_concurso_inseridos integer := 0;
  v_concurso_atualizados integer := 0;
  v_concurso_iguais integer := 0;
  v_provas_inseridas integer := 0;
  v_provas_atualizadas integer := 0;
  v_provas_iguais integer := 0;
  v_conteudos_inseridos integer := 0;
  v_conteudos_atualizados integer := 0;
  v_conteudos_iguais integer := 0;
  v_materiais_somente_supabase integer := 0;
begin
  if v_admin_id is null or not public.usuario_e_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if jsonb_typeof(p_manifesto) <> 'object' or jsonb_typeof(p_conteudos) <> 'array' then
    raise exception 'Payload de manifesto inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_manifesto->'materiais', '[]'::jsonb)) > 0 then
    raise exception 'Sincronização de materiais bloqueada até separar tipo de armazenamento e natureza documental' using errcode = '0A000';
  end if;
  if exists (select 1 from jsonb_array_elements(p_conteudos) c where nullif(c->>'subassunto', '') is not null) then
    raise exception 'Sincronização de novos subassuntos bloqueada: campo legado ordem não possui regra segura' using errcode = '0A000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_manifesto->>'slug', 0)
  );

  select * into v_atual from public.concursos where slug = p_manifesto->>'slug' for update;
  if not found then
    insert into public.concursos (slug, nome, orgao, banca, ano, edital, data_prova, descricao)
    values (p_manifesto->>'slug', p_manifesto->>'nome', p_manifesto->>'orgao', p_manifesto->>'banca', (p_manifesto->>'ano')::integer,
      nullif(p_manifesto->>'edital', ''), nullif(p_manifesto->>'data_prova', '')::date, nullif(p_manifesto->>'descricao', ''))
    returning id into v_concurso_id;
    v_concurso_inseridos := 1;
  else
    v_concurso_id := v_atual.id;
    if (v_atual.nome, v_atual.orgao, v_atual.banca, v_atual.ano, v_atual.edital, v_atual.data_prova, v_atual.descricao)
      is distinct from (p_manifesto->>'nome', p_manifesto->>'orgao', p_manifesto->>'banca', (p_manifesto->>'ano')::integer,
        nullif(p_manifesto->>'edital', ''), nullif(p_manifesto->>'data_prova', '')::date, nullif(p_manifesto->>'descricao', '')) then
      update public.concursos set nome=p_manifesto->>'nome', orgao=p_manifesto->>'orgao', banca=p_manifesto->>'banca', ano=(p_manifesto->>'ano')::integer,
        edital=nullif(p_manifesto->>'edital', ''), data_prova=nullif(p_manifesto->>'data_prova', '')::date, descricao=nullif(p_manifesto->>'descricao', '')
      where id=v_concurso_id;
      v_concurso_atualizados := 1;
    else v_concurso_iguais := 1;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_manifesto->'provas') loop
    select * into v_atual from public.provas where concurso_id=v_concurso_id and codigo_prova=v_item->>'codigo' for update;
    if not found then
      insert into public.provas (concurso_id, codigo_prova, nome, cargo, especialidade, turno, arquivo_origem, ativo)
      values (v_concurso_id, v_item->>'codigo', v_item->>'nome', v_item->>'cargo', nullif(v_item->>'especialidade', ''), nullif(v_item->>'turno', ''), nullif(v_item->>'arquivo_origem', ''), (v_item->>'ativo')::boolean)
      returning id into v_prova_id;
      v_provas_inseridas := v_provas_inseridas + 1;
    else
      v_prova_id := v_atual.id;
      if (v_atual.nome, v_atual.cargo, v_atual.especialidade, v_atual.turno, v_atual.arquivo_origem, v_atual.ativo)
        is distinct from (v_item->>'nome', v_item->>'cargo', nullif(v_item->>'especialidade', ''), nullif(v_item->>'turno', ''), nullif(v_item->>'arquivo_origem', ''), (v_item->>'ativo')::boolean) then
        update public.provas set nome=v_item->>'nome', cargo=v_item->>'cargo', especialidade=nullif(v_item->>'especialidade', ''), turno=nullif(v_item->>'turno', ''),
          arquivo_origem=nullif(v_item->>'arquivo_origem', ''), ativo=(v_item->>'ativo')::boolean where id=v_prova_id;
        v_provas_atualizadas := v_provas_atualizadas + 1;
      else v_provas_iguais := v_provas_iguais + 1;
      end if;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_conteudos) loop
    select p.id into v_prova_id from public.provas p where p.concurso_id=v_concurso_id and p.codigo_prova=v_item->>'prova_codigo';
    if v_prova_id is null then raise exception 'Prova não resolvida: %', v_item->>'prova_codigo' using errcode = '23503'; end if;
    select * into v_atual from public.conteudo_programatico
      where concurso_id=v_concurso_id and prova_id=v_prova_id and disciplina=v_item->>'disciplina'
        and assunto is not distinct from nullif(v_item->>'assunto', '') and subassunto is not distinct from nullif(v_item->>'subassunto', '') for update;
    if not found then
      insert into public.conteudo_programatico (concurso_id, prova_id, disciplina, assunto, subassunto, ordem, ativo, disciplina_ordem, assunto_ordem, subassunto_ordem)
      values (v_concurso_id, v_prova_id, v_item->>'disciplina', nullif(v_item->>'assunto', ''), null, case when nullif(v_item->>'assunto', '') is null
        then (v_item->>'disciplina_ordem')::integer else (v_item->>'disciplina_ordem')::integer * 100 + (v_item->>'assunto_ordem')::integer end,
        (v_item->>'ativo')::boolean, (v_item->>'disciplina_ordem')::integer, nullif(v_item->>'assunto_ordem', '')::integer, null)
      returning id into v_prova_id;
      v_conteudos_inseridos := v_conteudos_inseridos + 1;
    elsif (v_atual.ativo, v_atual.disciplina_ordem, v_atual.assunto_ordem, v_atual.subassunto_ordem)
      is distinct from ((v_item->>'ativo')::boolean, (v_item->>'disciplina_ordem')::integer, nullif(v_item->>'assunto_ordem', '')::integer, nullif(v_item->>'subassunto_ordem', '')::integer) then
      update public.conteudo_programatico set ordem=case when nullif(v_item->>'assunto', '') is null
          then (v_item->>'disciplina_ordem')::integer else (v_item->>'disciplina_ordem')::integer * 100 + (v_item->>'assunto_ordem')::integer end,
        ativo=(v_item->>'ativo')::boolean, disciplina_ordem=(v_item->>'disciplina_ordem')::integer,
        assunto_ordem=nullif(v_item->>'assunto_ordem', '')::integer, subassunto_ordem=nullif(v_item->>'subassunto_ordem', '')::integer where id=v_atual.id;
      v_conteudos_atualizados := v_conteudos_atualizados + 1;
    else v_conteudos_iguais := v_conteudos_iguais + 1;
    end if;
  end loop;

  select count(*) into v_materiais_somente_supabase from public.materiais_concurso where concurso_id=v_concurso_id;
  return jsonb_build_object('slug', p_manifesto->>'slug', 'executado_em', now(),
    'concurso', jsonb_build_object('inseridos',v_concurso_inseridos,'atualizados',v_concurso_atualizados,'sem_alteracao',v_concurso_iguais),
    'provas', jsonb_build_object('inseridos',v_provas_inseridas,'atualizados',v_provas_atualizadas,'sem_alteracao',v_provas_iguais),
    'conteudos', jsonb_build_object('inseridos',v_conteudos_inseridos,'atualizados',v_conteudos_atualizados,'sem_alteracao',v_conteudos_iguais),
    'materiais', jsonb_build_object('inseridos',0,'atualizados',0,'sem_alteracao',0,'somente_supabase',v_materiais_somente_supabase));
end;
$$;

revoke all on function public.admin_sincronizar_manifesto(jsonb, jsonb) from public, anon;
grant execute on function public.admin_sincronizar_manifesto(jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
