-- Fase 14: limite transacional para integrações externas.
create table if not exists public.integracao_rate_limits (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  chave text not null check (char_length(chave) between 1 and 80),
  janela_inicio timestamptz not null default now(),
  quantidade integer not null default 1 check (quantidade > 0),
  primary key (usuario_id, chave)
);

alter table public.integracao_rate_limits enable row level security;
revoke all on public.integracao_rate_limits from anon, authenticated;

create or replace function public.consumir_limite_integracao(
  p_usuario_id uuid,
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quantidade integer;
begin
  if p_usuario_id is null or p_chave is null or p_limite < 1 or p_janela_segundos < 1 then
    raise exception 'Parâmetros de limite inválidos' using errcode = '22023';
  end if;

  insert into public.integracao_rate_limits (usuario_id, chave, janela_inicio, quantidade)
  values (p_usuario_id, left(p_chave, 80), now(), 1)
  on conflict (usuario_id, chave) do update
  set janela_inicio = case
        when integracao_rate_limits.janela_inicio <= now() - make_interval(secs => p_janela_segundos) then now()
        else integracao_rate_limits.janela_inicio
      end,
      quantidade = case
        when integracao_rate_limits.janela_inicio <= now() - make_interval(secs => p_janela_segundos) then 1
        else integracao_rate_limits.quantidade + 1
      end
  returning quantidade into v_quantidade;

  return v_quantidade <= p_limite;
end;
$$;

revoke all on function public.consumir_limite_integracao(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite_integracao(uuid, text, integer, integer) to service_role;
