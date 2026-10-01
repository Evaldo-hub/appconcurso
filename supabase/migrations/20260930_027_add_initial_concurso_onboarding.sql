-- APP-3.3C: primeiro concurso no onboarding de novos estudantes.
-- Mantem o trigger temporal existente e torna todo o onboarding atomico.

create or replace function public.listar_concursos_onboarding()
returns table (
  id bigint,
  nome text,
  orgao text,
  banca text,
  ano integer,
  cargo text,
  especialidade text
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $function$
  select c.id, c.nome, c.orgao, c.banca, c.ano, c.cargo, c.especialidade
  from public.concursos c
  order by c.ano desc nulls last, c.nome asc, c.id asc;
$function$;

revoke all on function public.listar_concursos_onboarding() from public;
grant execute on function public.listar_concursos_onboarding() to anon, authenticated;

create or replace function public.criar_acesso_estudante_novo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_concurso_texto text := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'concurso_inicial_id'), '');
  v_concurso_id bigint;
begin
  if v_concurso_texto is null or v_concurso_texto !~ '^[1-9][0-9]*$' then
    raise exception 'CONCURSO_INICIAL_INVALIDO' using errcode = '22023';
  end if;

  begin
    v_concurso_id := v_concurso_texto::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'CONCURSO_INICIAL_INVALIDO' using errcode = '22023';
  end;

  if not exists (select 1 from public.concursos c where c.id = v_concurso_id) then
    raise exception 'CONCURSO_INICIAL_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  -- Preserva integralmente o acesso temporal criado pelo trigger anterior.
  insert into public.acessos_estudante (usuario_id, inicio_em, expira_em, status)
  values (new.id, pg_catalog.now(), pg_catalog.now() + interval '30 days', 'ativo')
  on conflict (usuario_id) do nothing;

  -- O trigger ocorre somente no INSERT de auth.users e cria um unico vinculo inicial.
  insert into public.usuario_concursos (
    usuario_id, concurso_id, status, principal, liberado_por,
    liberado_em, criado_em, atualizado_em
  ) values (
    new.id, v_concurso_id, 'ativo', true, null,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  );

  insert into public.usuario_preferencias (usuario_id, concurso_atual_id, atualizado_em)
  values (new.id, v_concurso_id, pg_catalog.now());

  return new;
end;
$function$;

-- A funcao e executada apenas pelo trigger existente em auth.users.
revoke all on function public.criar_acesso_estudante_novo() from public, anon, authenticated;

notify pgrst, 'reload schema';
