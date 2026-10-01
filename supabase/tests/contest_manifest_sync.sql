-- Executar somente em banco descartável, depois de aplicar 20260922_016.
-- Este arquivo nunca deve ser executado contra o TRT8 de produção.
begin;

-- O executor de testes deve autenticar um administrador e substituir os fixtures
-- __MANIFESTO_NOVO__, __CONTEUDOS_NOVOS__ e __MANIFESTO_ALTERADO__ por JSON válido.
-- As chamadas abaixo documentam os testes transacionais obrigatórios da Fase 4.

-- 1/3/5/7: primeira execução cria concurso, prova e conteúdo.
-- select public.admin_sincronizar_manifesto('__MANIFESTO_NOVO__'::jsonb, '__CONTEUDOS_NOVOS__'::jsonb);
-- 4/8/13: segunda execução retorna zero inserts/updates.
-- select public.admin_sincronizar_manifesto('__MANIFESTO_NOVO__'::jsonb, '__CONTEUDOS_NOVOS__'::jsonb);
-- 6/9/11: manifesto alterado e ativo=false atualizam apenas as mesmas chaves estáveis.
-- select public.admin_sincronizar_manifesto('__MANIFESTO_ALTERADO__'::jsonb, '__CONTEUDOS_ALTERADOS__'::jsonb);
-- 10: fixtures extras ausentes do manifesto permanecem intocados.
-- 12: provocar exceção após uma inserção deve deixar todas as contagens físicas inalteradas.
-- 14: executar sem administrador deve produzir SQLSTATE 42501.

rollback;
