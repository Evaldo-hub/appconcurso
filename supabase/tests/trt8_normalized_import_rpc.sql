-- Teste transacional da RPC da FASE TRT8-2D. Executar somente apos aplicar a 029.
begin;

do $test$
declare
  v_key constant text := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  v_base jsonb;
  v_result jsonb;
  v_concurso_id bigint;
  v_conteudo_id bigint;
begin
  v_base := pg_catalog.jsonb_build_object(
    'concurso', pg_catalog.jsonb_build_object(
      'slug', 'rpc-normalizado-teste', 'nome', 'Concurso RPC Teste', 'orgao', 'Orgao Teste',
      'banca', 'Banca Teste', 'ano', 2026, 'edital', 'Edital Teste',
      'data_prova', '2027-01-17', 'descricao', 'Fixture transacional'
    ),
    'provas', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('codigo_prova', 'T01', 'nome', 'Prova T01', 'cargo', 'Cargo 1', 'especialidade', null, 'turno', null, 'arquivo_origem', null, 'ativo', true),
      pg_catalog.jsonb_build_object('codigo_prova', 'T02', 'nome', 'Prova T02', 'cargo', 'Cargo 2', 'especialidade', null, 'turno', null, 'arquivo_origem', null, 'ativo', true)
    ),
    'conteudos', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('disciplina', 'Disciplina comum', 'assunto', null, 'subassunto', null,
        'chave_canonica', v_key, 'versao_normalizacao', 'canonical-v1', 'ativo', true)
    ),
    'vinculos', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('codigo_prova', 'T01', 'chave_canonica', v_key, 'ativo', true,
        'disciplina_ordem', 1, 'assunto_ordem', null, 'subassunto_ordem', null, 'ordem', 1, 'origem', 'trt8-2026-manifest-v1'),
      pg_catalog.jsonb_build_object('codigo_prova', 'T02', 'chave_canonica', v_key, 'ativo', true,
        'disciplina_ordem', 1, 'assunto_ordem', null, 'subassunto_ordem', null, 'ordem', 1, 'origem', 'trt8-2026-manifest-v1')
    ),
    'contagens_esperadas', pg_catalog.jsonb_build_object('provas', 2, 'conteudos', 1, 'vinculos', 2)
  );

  v_result := public.importar_concurso_normalizado_atomico(v_base);
  if (v_result->>'provas_inseridas')::integer <> 2
     or (v_result->>'conteudos_inseridos')::integer <> 1
     or (v_result->>'vinculos_inseridos')::integer <> 2 then
    raise exception 'TESTE_FALHOU: contagens da criacao';
  end if;
  v_concurso_id := (v_result->>'concurso_id')::bigint;
  select id into strict v_conteudo_id from public.conteudos_catalogo
    where concurso_id = v_concurso_id and chave_canonica = v_key;
  if (select count(*) from public.prova_conteudos where concurso_id = v_concurso_id and conteudo_id = v_conteudo_id) <> 2 then
    raise exception 'TESTE_FALHOU: compartilhamento/vinculos';
  end if;

  v_result := public.importar_concurso_normalizado_atomico(v_base);
  if (v_result->>'provas_reutilizadas')::integer <> 2
     or (v_result->>'conteudos_reutilizados')::integer <> 1
     or (v_result->>'vinculos_reutilizados')::integer <> 2 then
    raise exception 'TESTE_FALHOU: idempotencia';
  end if;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{concurso,orgao}', '"Outro orgao"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: conflito de concurso nao detectado';
  exception when sqlstate '23514' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{provas,0,nome}', '"Nome divergente"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: conflito de prova nao detectado';
  exception when sqlstate '23514' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{conteudos,0,disciplina}', '"Outra disciplina"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: conflito de catalogo nao detectado';
  exception when sqlstate '23514' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{vinculos,0,ordem}', '2'::jsonb)
    );
    raise exception 'TESTE_FALHOU: conflito de vinculo nao detectado';
  exception when sqlstate '23514' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{vinculos,0,codigo_prova}', '"INEXISTENTE"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: referencia invalida nao detectada';
  exception when foreign_key_violation then null; end;

  -- A primeira prova seria inserida antes do conflito da segunda. A excecao
  -- capturada cria uma subtransacao PL/pgSQL e deve desfazer essa insercao.
  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(v_base, '{provas,0,codigo_prova}', '"T00"'::jsonb),
          '{vinculos,0,codigo_prova}', '"T00"'::jsonb
        ),
        '{provas,1,nome}', '"Conflito apos insercao"'::jsonb
      )
    );
    raise exception 'TESTE_FALHOU: conflito para teste de rollback nao detectado';
  exception when sqlstate '23514' then null; end;
  if exists (select 1 from public.provas where concurso_id = v_concurso_id and codigo_prova = 'T00') then
    raise exception 'TESTE_FALHOU: estado parcial apos erro';
  end if;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{contagens_esperadas,provas}', '"2"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: contagem string aceita';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{vinculos,0,ordem}', '"1"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: ordem string aceita';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{provas,0,ativo}', '"true"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: boolean string aceito';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{concurso,nome}', '123'::jsonb)
    );
    raise exception 'TESTE_FALHOU: numero aceito como texto';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{provas,0}', '"nao-e-objeto"'::jsonb)
    );
    raise exception 'TESTE_FALHOU: elemento nao-object aceito';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{vinculos,0,ordem}', '1.5'::jsonb)
    );
    raise exception 'TESTE_FALHOU: decimal aceito como inteiro';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(v_base #- '{concurso,nome}');
    raise exception 'TESTE_FALHOU: campo obrigatorio ausente aceito';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.importar_concurso_normalizado_atomico(
      pg_catalog.jsonb_set(v_base, '{concurso,slug}', 'null'::jsonb)
    );
    raise exception 'TESTE_FALHOU: null indevido aceito';
  exception when sqlstate '22023' then null; end;
end;
$test$;

rollback;
