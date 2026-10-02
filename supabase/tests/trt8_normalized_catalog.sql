-- Teste futuro da migration 20261002_028_normalize_program_catalog.sql.
-- Todos os dados de teste ficam dentro desta transacao e sao revertidos.

begin;

do $test$
declare
  v_concurso_a bigint;
  v_concurso_b bigint;
  v_prova_a1 bigint;
  v_prova_a2 bigint;
  v_prova_b bigint;
  v_conteudo_a bigint;
  v_sufixo text := pg_catalog.txid_current()::text;
begin
  insert into public.concursos (nome, orgao, banca, ano, slug)
  values ('TESTE CATALOGO A ' || v_sufixo, 'TESTE', 'TESTE', 2099, 'teste-catalogo-a-' || v_sufixo)
  returning id into v_concurso_a;

  insert into public.provas (concurso_id, nome, codigo_prova, ativo)
  values (v_concurso_a, 'Prova A1', 'TESTE-A1-' || v_sufixo, true)
  returning id into v_prova_a1;

  insert into public.provas (concurso_id, nome, codigo_prova, ativo)
  values (v_concurso_a, 'Prova A2', 'TESTE-A2-' || v_sufixo, true)
  returning id into v_prova_a2;

  insert into public.conteudos_catalogo (
    concurso_id, disciplina, assunto, subassunto,
    chave_canonica, versao_normalizacao
  ) values (
    v_concurso_a, 'Lingua Portuguesa', 'Interpretacao de texto', null,
    repeat('a', 64), 'canonical-v1'
  ) returning id into v_conteudo_a;

  insert into public.prova_conteudos (
    concurso_id, prova_id, conteudo_id, disciplina_ordem, assunto_ordem, origem
  ) values
    (v_concurso_a, v_prova_a1, v_conteudo_a, 1, 1, 'teste'),
    (v_concurso_a, v_prova_a2, v_conteudo_a, 2, 3, 'teste');

  if (select count(*) from public.conteudos_catalogo where id = v_conteudo_a) <> 1 then
    raise exception 'Esperado um unico conteudo canonico';
  end if;
  if (select count(*) from public.prova_conteudos where conteudo_id = v_conteudo_a) <> 2 then
    raise exception 'Esperados dois vinculos de prova';
  end if;

  begin
    insert into public.prova_conteudos (concurso_id, prova_id, conteudo_id)
    values (v_concurso_a, v_prova_a1, v_conteudo_a);
    raise exception 'Duplicidade prova/conteudo nao foi bloqueada';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (
      concurso_id, disciplina, assunto, chave_canonica, versao_normalizacao
    ) values (
      v_concurso_a, 'LINGUA PORTUGUESA', 'Interpretacao de texto',
      repeat('a', 64), 'canonical-v1'
    );
    raise exception 'Duplicidade canonica no concurso nao foi bloqueada';
  exception
    when unique_violation then null;
  end;

  insert into public.concursos (nome, orgao, banca, ano, slug)
  values ('TESTE CATALOGO B ' || v_sufixo, 'TESTE', 'TESTE', 2099, 'teste-catalogo-b-' || v_sufixo)
  returning id into v_concurso_b;

  insert into public.provas (concurso_id, nome, codigo_prova, ativo)
  values (v_concurso_b, 'Prova B', 'TESTE-B-' || v_sufixo, true)
  returning id into v_prova_b;

  begin
    insert into public.prova_conteudos (concurso_id, prova_id, conteudo_id)
    values (v_concurso_b, v_prova_b, v_conteudo_a);
    raise exception 'Vinculo entre concursos diferentes nao foi bloqueado';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, chave_canonica)
    values (v_concurso_a, '', repeat('b', 64));
    raise exception 'Disciplina vazia nao foi bloqueada';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, chave_canonica)
    values (v_concurso_a, '   ', repeat('b', 64));
    raise exception 'Disciplina com espacos nao foi bloqueada';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, assunto, chave_canonica)
    values (v_concurso_a, 'Direito', '', repeat('b', 64));
    raise exception 'Assunto vazio nao foi bloqueado';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, assunto, chave_canonica)
    values (v_concurso_a, 'Direito', '   ', repeat('b', 64));
    raise exception 'Assunto com espacos nao foi bloqueado';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, assunto, subassunto, chave_canonica)
    values (v_concurso_a, 'Direito', 'Constitucional', '', repeat('b', 64));
    raise exception 'Subassunto vazio nao foi bloqueado';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, assunto, subassunto, chave_canonica)
    values (v_concurso_a, 'Direito', 'Constitucional', '   ', repeat('b', 64));
    raise exception 'Subassunto com espacos nao foi bloqueado';
  exception when check_violation then null;
  end;

  begin
    insert into public.conteudos_catalogo (concurso_id, disciplina, assunto, subassunto, chave_canonica)
    values (v_concurso_a, 'Direito', null, 'Constituicao', repeat('b', 64));
    raise exception 'Subassunto sem assunto nao foi bloqueado';
  exception when check_violation then null;
  end;
end;
$test$;

rollback;
