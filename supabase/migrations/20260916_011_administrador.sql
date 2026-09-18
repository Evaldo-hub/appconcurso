-- Acesso administrativo. A promoção ocorre somente por migration/servidor confiável.

create table if not exists public.administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.administradores enable row level security;

drop policy if exists "Administrador identifica a própria função" on public.administradores;
create policy "Administrador identifica a própria função"
  on public.administradores
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

revoke all on table public.administradores from anon;
revoke insert, update, delete on table public.administradores from authenticated;
grant select (usuario_id, criado_em) on table public.administradores to authenticated;

create or replace function public.usuario_e_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.administradores where usuario_id = auth.uid()
  );
$$;

revoke all on function public.usuario_e_admin() from public, anon;
grant execute on function public.usuario_e_admin() to authenticated;

do $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id
  from auth.users
  where lower(email) = lower('evaldotecnico2004@gmail.com')
  limit 1;

  if v_usuario_id is null then
    raise exception 'A conta administrativa evaldotecnico2004@gmail.com ainda não existe no Supabase Auth';
  end if;

  insert into public.administradores (usuario_id)
  values (v_usuario_id)
  on conflict (usuario_id) do nothing;
end;
$$;

notify pgrst, 'reload schema';
