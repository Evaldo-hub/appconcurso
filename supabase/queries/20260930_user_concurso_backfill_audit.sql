-- APP-3.3B: auditoria read-only para planejar o backfill futuro.
-- Nao atribui concursos e nao modifica dados.
select
  (select count(*) from auth.users) as total_auth_users,
  (select count(*) from public.administradores) as total_administradores,
  (select count(*) from auth.users u
    where not exists (select 1 from public.administradores a where a.usuario_id = u.id)
  ) as total_estudantes,
  (select count(*) from auth.users u
    where not exists (select 1 from public.administradores a where a.usuario_id = u.id)
      and not exists (
        select 1 from public.usuario_concursos uc
        where uc.usuario_id = u.id and uc.status = 'ativo'
      )
  ) as estudantes_sem_concurso_ativo;
