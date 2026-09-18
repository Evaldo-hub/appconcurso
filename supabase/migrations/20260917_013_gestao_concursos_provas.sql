-- Fase 18: gestão administrativa de concursos e provas, sem exclusão física.

create or replace function public.admin_salvar_concurso(
  p_id bigint,
  p_nome text,
  p_orgao text,
  p_banca text,
  p_ano integer,
  p_edital text,
  p_cargo text,
  p_especialidade text,
  p_data_prova date,
  p_descricao text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_id bigint;
  v_anterior jsonb;
  v_novo jsonb;
begin
  if v_admin_id is null or not public.usuario_e_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null or nullif(trim(p_orgao), '') is null then
    raise exception 'Nome e órgão são obrigatórios' using errcode = '22023';
  end if;
  if p_ano is not null and (p_ano < 1900 or p_ano > 2200) then
    raise exception 'Ano inválido' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.concursos (nome, orgao, banca, ano, edital, cargo, especialidade, data_prova, descricao)
    values (trim(p_nome), trim(p_orgao), nullif(trim(p_banca), ''), p_ano, nullif(trim(p_edital), ''), nullif(trim(p_cargo), ''), nullif(trim(p_especialidade), ''), p_data_prova, nullif(trim(p_descricao), ''))
    returning id into v_id;
  else
    select to_jsonb(c) into v_anterior from public.concursos c where c.id = p_id for update;
    if v_anterior is null then raise exception 'Concurso não encontrado' using errcode = 'P0002'; end if;
    update public.concursos set nome=trim(p_nome), orgao=trim(p_orgao), banca=nullif(trim(p_banca), ''), ano=p_ano,
      edital=nullif(trim(p_edital), ''), cargo=nullif(trim(p_cargo), ''), especialidade=nullif(trim(p_especialidade), ''),
      data_prova=p_data_prova, descricao=nullif(trim(p_descricao), '') where id=p_id;
    v_id := p_id;
  end if;

  select to_jsonb(c) into v_novo from public.concursos c where c.id=v_id;
  insert into public.admin_auditoria (administrador_id, acao, entidade, entidade_id, dados_anteriores, dados_novos)
  values (v_admin_id, case when p_id is null then 'criar' else 'atualizar' end, 'concursos', v_id::text, v_anterior, v_novo);
  return v_id;
end;
$$;

create or replace function public.admin_salvar_prova(
  p_id bigint,
  p_concurso_id bigint,
  p_nome text,
  p_cargo text,
  p_especialidade text,
  p_codigo_prova text,
  p_turno text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_id bigint;
  v_anterior jsonb;
  v_novo jsonb;
begin
  if v_admin_id is null or not public.usuario_e_admin() then
    raise exception 'Acesso administrativo necessário' using errcode = '42501';
  end if;
  if p_concurso_id is null or nullif(trim(p_nome), '') is null then
    raise exception 'Concurso e nome são obrigatórios' using errcode = '22023';
  end if;
  if not exists (select 1 from public.concursos where id=p_concurso_id) then
    raise exception 'Concurso não encontrado' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.provas (concurso_id, nome, cargo, especialidade, codigo_prova, turno)
    values (p_concurso_id, trim(p_nome), nullif(trim(p_cargo), ''), nullif(trim(p_especialidade), ''), nullif(trim(p_codigo_prova), ''), nullif(trim(p_turno), ''))
    returning id into v_id;
  else
    select to_jsonb(p) into v_anterior from public.provas p where p.id=p_id for update;
    if v_anterior is null then raise exception 'Prova não encontrada' using errcode = 'P0002'; end if;
    update public.provas set concurso_id=p_concurso_id, nome=trim(p_nome), cargo=nullif(trim(p_cargo), ''),
      especialidade=nullif(trim(p_especialidade), ''), codigo_prova=nullif(trim(p_codigo_prova), ''), turno=nullif(trim(p_turno), '') where id=p_id;
    v_id := p_id;
  end if;

  select to_jsonb(p) into v_novo from public.provas p where p.id=v_id;
  insert into public.admin_auditoria (administrador_id, acao, entidade, entidade_id, dados_anteriores, dados_novos)
  values (v_admin_id, case when p_id is null then 'criar' else 'atualizar' end, 'provas', v_id::text, v_anterior, v_novo);
  return v_id;
end;
$$;

revoke all on function public.admin_salvar_concurso(bigint, text, text, text, integer, text, text, text, date, text) from public, anon;
grant execute on function public.admin_salvar_concurso(bigint, text, text, text, integer, text, text, text, date, text) to authenticated;
revoke all on function public.admin_salvar_prova(bigint, bigint, text, text, text, text, text) from public, anon;
grant execute on function public.admin_salvar_prova(bigint, bigint, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
