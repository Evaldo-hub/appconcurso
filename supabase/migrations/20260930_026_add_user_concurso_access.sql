-- APP-3.3B: fundacao do controle de acesso por concurso.
-- Nao altera policies dos catalogos e nao realiza backfill.

create table public.usuario_concursos (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  concurso_id bigint not null references public.concursos(id) on delete restrict,
  status text not null default 'ativo' check (status in ('ativo', 'revogado')),
  principal boolean not null default false,
  liberado_por uuid references auth.users(id) on delete set null,
  liberado_em timestamptz not null default pg_catalog.now(),
  criado_em timestamptz not null default pg_catalog.now(),
  atualizado_em timestamptz not null default pg_catalog.now(),
  primary key (usuario_id, concurso_id),
  constraint usuario_concursos_revogado_nao_principal_check
    check (status <> 'revogado' or principal = false)
);

create index usuario_concursos_usuario_status_idx
  on public.usuario_concursos (usuario_id, status);
create index usuario_concursos_concurso_status_idx
  on public.usuario_concursos (concurso_id, status);
create unique index usuario_concursos_um_principal_ativo_idx
  on public.usuario_concursos (usuario_id)
  where principal = true and status = 'ativo';

create table public.usuario_preferencias (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  concurso_atual_id bigint references public.concursos(id) on delete set null,
  atualizado_em timestamptz not null default pg_catalog.now()
);

alter table public.usuario_concursos enable row level security;
alter table public.usuario_preferencias enable row level security;

create policy "Usuario consulta os proprios concursos"
  on public.usuario_concursos
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

create policy "Usuario consulta a propria preferencia"
  on public.usuario_preferencias
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on table public.usuario_concursos from public, anon, authenticated;
revoke all on table public.usuario_preferencias from public, anon, authenticated;
grant select on table public.usuario_concursos to authenticated;
grant select on table public.usuario_preferencias to authenticated;

create or replace function public.usuario_pode_acessar_concurso(p_concurso_id bigint)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select (select auth.uid()) is not null
    and p_concurso_id is not null
    and (
      public.usuario_e_admin()
      or exists (
        select 1
        from public.usuario_concursos uc
        where uc.usuario_id = (select auth.uid())
          and uc.concurso_id = p_concurso_id
          and uc.status = 'ativo'
      )
    );
$function$;

create or replace function public.listar_concursos_autorizados()
returns table (
  concurso_id bigint,
  nome text,
  orgao text,
  banca text,
  ano integer,
  cargo text,
  especialidade text,
  principal boolean,
  atual boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select
    c.id,
    c.nome,
    c.orgao,
    c.banca,
    c.ano,
    c.cargo,
    c.especialidade,
    coalesce(uc.principal and uc.status = 'ativo', false),
    coalesce(up.concurso_atual_id = c.id, false)
  from public.concursos c
  left join public.usuario_concursos uc
    on uc.usuario_id = (select auth.uid())
   and uc.concurso_id = c.id
  left join public.usuario_preferencias up
    on up.usuario_id = (select auth.uid())
  where (select auth.uid()) is not null
    and (public.usuario_e_admin() or uc.status = 'ativo')
  order by c.nome, c.id;
$function$;

create or replace function public.definir_concurso_atual(p_concurso_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_usuario_id uuid := auth.uid();
begin
  if v_usuario_id is null then
    raise exception 'USUARIO_NAO_AUTENTICADO' using errcode = '42501';
  end if;
  if p_concurso_id is null
    or not exists (select 1 from public.concursos c where c.id = p_concurso_id)
    or not public.usuario_pode_acessar_concurso(p_concurso_id) then
    raise exception 'CONCURSO_NAO_AUTORIZADO' using errcode = '42501';
  end if;

  insert into public.usuario_preferencias (usuario_id, concurso_atual_id, atualizado_em)
  values (v_usuario_id, p_concurso_id, pg_catalog.now())
  on conflict (usuario_id) do update
    set concurso_atual_id = excluded.concurso_atual_id,
        atualizado_em = excluded.atualizado_em;
end;
$function$;

create or replace function public.admin_definir_acesso_concurso(
  p_usuario_id uuid,
  p_concurso_id bigint,
  p_status text,
  p_principal boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not public.usuario_e_admin() then
    raise exception 'ACESSO_ADMINISTRATIVO_NECESSARIO' using errcode = '42501';
  end if;
  if p_usuario_id is null or not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if p_concurso_id is null or not exists (select 1 from public.concursos c where c.id = p_concurso_id) then
    raise exception 'CONCURSO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if p_status is null or p_status not in ('ativo', 'revogado')
    or (p_status = 'revogado' and coalesce(p_principal, false)) then
    raise exception 'PARAMETROS_DE_ACESSO_INVALIDOS' using errcode = '22023';
  end if;

  -- Serializa concessoes do mesmo usuario e protege o principal unico.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_usuario_id::text, 0));

  if p_status = 'ativo' then
    if coalesce(p_principal, false) then
      update public.usuario_concursos
      set principal = false,
          atualizado_em = pg_catalog.now()
      where usuario_id = p_usuario_id
        and principal = true;
    end if;

    insert into public.usuario_concursos (
      usuario_id, concurso_id, status, principal, liberado_por,
      liberado_em, criado_em, atualizado_em
    ) values (
      p_usuario_id, p_concurso_id, 'ativo', coalesce(p_principal, false), v_admin_id,
      pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
    )
    on conflict (usuario_id, concurso_id) do update
      set status = 'ativo',
          principal = excluded.principal,
          liberado_por = v_admin_id,
          liberado_em = pg_catalog.now(),
          atualizado_em = pg_catalog.now();
  else
    insert into public.usuario_concursos (
      usuario_id, concurso_id, status, principal, liberado_por,
      liberado_em, criado_em, atualizado_em
    ) values (
      p_usuario_id, p_concurso_id, 'revogado', false, v_admin_id,
      pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
    )
    on conflict (usuario_id, concurso_id) do update
      set status = 'revogado',
          principal = false,
          atualizado_em = pg_catalog.now();

    update public.usuario_preferencias
    set concurso_atual_id = null,
        atualizado_em = pg_catalog.now()
    where usuario_id = p_usuario_id
      and concurso_atual_id = p_concurso_id;
  end if;
end;
$function$;

revoke all on function public.usuario_pode_acessar_concurso(bigint) from public, anon;
revoke all on function public.listar_concursos_autorizados() from public, anon;
revoke all on function public.definir_concurso_atual(bigint) from public, anon;
revoke all on function public.admin_definir_acesso_concurso(uuid, bigint, text, boolean) from public, anon;

grant execute on function public.usuario_pode_acessar_concurso(bigint) to authenticated;
grant execute on function public.listar_concursos_autorizados() to authenticated;
grant execute on function public.definir_concurso_atual(bigint) to authenticated;
grant execute on function public.admin_definir_acesso_concurso(uuid, bigint, text, boolean) to authenticated;

notify pgrst, 'reload schema';
