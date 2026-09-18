-- Correção da tela de Concursos: amplia somente as colunas públicas do catálogo.
-- Não concede acesso a gabaritos, respostas, documentos RAG ou dados de usuários.

grant select (
  id,
  nome,
  orgao,
  banca,
  ano,
  edital,
  cargo,
  especialidade,
  data_prova,
  descricao
) on public.concursos to authenticated;

grant select (
  id,
  concurso_id,
  nome,
  cargo,
  especialidade,
  codigo_prova,
  turno
) on public.provas to authenticated;

notify pgrst, 'reload schema';
