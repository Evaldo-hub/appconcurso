# Teste de Conexão com Supabase

Para testar a conexão com o Supabase, siga estes passos:

1. Configure as variáveis de ambiente no arquivo `.env.local` (veja SETUP_ENV.md)
2. Instale o tsx se necessário: `npm install -D tsx`
3. Execute o teste: `npx tsx src/lib/supabase/test-connection.ts`

O script irá:
- Testar a conexão com o Supabase
- Verificar se consegue acessar a tabela 'concursos'
- Retornar os dados de teste se a conexão for bem-sucedida

## Observação

Este teste requer que:
- O arquivo `.env.local` esteja configurado com as credenciais do Supabase
- A tabela 'concursos' exista no banco de dados
- O usuário tenha permissão de leitura na tabela
