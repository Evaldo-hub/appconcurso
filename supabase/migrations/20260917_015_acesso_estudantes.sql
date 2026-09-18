-- Controle de acesso temporal para estudantes. Administradores não expiram.

create table if not exists public.acessos_estudante (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  inicio_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '30 days'),
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  check (expira_em > inicio_em)
);

alter table public.acessos_estudante enable row level security;
drop policy if exists "Estudante consulta o próprio acesso" on public.acessos_estudante;
create policy "Estudante consulta o próprio acesso" on public.acessos_estudante
  for select to authenticated using (usuario_id = (select auth.uid()) or public.usuario_e_admin());
grant select on public.acessos_estudante to authenticated;
revoke insert, update, delete on public.acessos_estudante from anon, authenticated;

insert into public.acessos_estudante (usuario_id, inicio_em, expira_em, status)
select u.id, now(), now() + interval '30 days', 'ativo'
from auth.users u
where not exists (select 1 from public.administradores a where a.usuario_id=u.id)
on conflict (usuario_id) do nothing;

create or replace function public.criar_acesso_estudante_novo()
returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  insert into public.acessos_estudante (usuario_id, inicio_em, expira_em, status)
  values (new.id, now(), now() + interval '30 days', 'ativo')
  on conflict (usuario_id) do nothing;
  return new;
end;
$$;

drop trigger if exists criar_acesso_estudante_apos_cadastro on auth.users;
create trigger criar_acesso_estudante_apos_cadastro
  after insert on auth.users for each row execute function public.criar_acesso_estudante_novo();

create or replace function public.usuario_tem_acesso(p_usuario_id uuid default auth.uid())
returns boolean language sql security definer set search_path=public, pg_temp stable as $$
  select exists (select 1 from public.administradores a where a.usuario_id=p_usuario_id)
    or exists (select 1 from public.acessos_estudante e where e.usuario_id=p_usuario_id and e.status='ativo' and e.expira_em > now());
$$;

revoke all on function public.usuario_tem_acesso(uuid) from public, anon;
grant execute on function public.usuario_tem_acesso(uuid) to authenticated, service_role;

create or replace function public.admin_definir_acesso_estudante(p_usuario_id uuid, p_dias integer, p_status text default 'ativo')
returns timestamptz language plpgsql security definer set search_path=public, pg_temp as $$
declare v_admin uuid:=auth.uid(); v_expira timestamptz; v_anterior jsonb; v_novo jsonb;
begin
  if v_admin is null or not public.usuario_e_admin() then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_dias < 1 or p_dias > 1095 or p_status not in ('ativo','bloqueado') then raise exception 'Parâmetros inválidos' using errcode='22023'; end if;
  if exists(select 1 from public.administradores where usuario_id=p_usuario_id) then raise exception 'Administradores não possuem expiração' using errcode='22023'; end if;
  select to_jsonb(e) into v_anterior from public.acessos_estudante e where e.usuario_id=p_usuario_id;
  v_expira:=now()+make_interval(days=>p_dias);
  insert into public.acessos_estudante(usuario_id,inicio_em,expira_em,status,atualizado_em,atualizado_por)
  values(p_usuario_id,now(),v_expira,p_status,now(),v_admin)
  on conflict(usuario_id) do update set inicio_em=now(),expira_em=v_expira,status=p_status,atualizado_em=now(),atualizado_por=v_admin;
  select to_jsonb(e) into v_novo from public.acessos_estudante e where e.usuario_id=p_usuario_id;
  insert into public.admin_auditoria(administrador_id,acao,entidade,entidade_id,dados_anteriores,dados_novos)
  values(v_admin,'definir_acesso','acessos_estudante',p_usuario_id::text,v_anterior,v_novo);
  return v_expira;
end;
$$;

revoke all on function public.admin_definir_acesso_estudante(uuid, integer, text) from public, anon;
grant execute on function public.admin_definir_acesso_estudante(uuid, integer, text) to authenticated;
notify pgrst, 'reload schema';
