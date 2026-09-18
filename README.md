# Plataforma Inteligente de Estudos para Concursos

Plataforma web moderna para estudos de concursos públicos, inicialmente voltada para concursos da EBSERH na área de Tecnologia da Informação.

## Stack Tecnológica

- **Next.js 14+** (App Router) - Framework React com SSR/SSG
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização moderna e responsiva
- **shadcn/ui** - Componentes UI modernos e acessíveis
- **Supabase** - Backend de dados e autenticação
- **n8n** - Motor de automação, IA e RAG
- **Zustand** - Gerenciamento de estado global

## Estrutura do Projeto

```
src/
├── app/              # Next.js App Router
│   ├── (auth)/       # Rotas de autenticação
│   ├── (dashboard)/  # Rotas principais autenticadas
│   └── api/          # API Routes
├── components/       # Componentes React
│   ├── ui/          # Componentes shadcn/ui
│   ├── layout/      # Sidebar, Header, etc.
│   └── ...
├── lib/             # Utilitários e configurações
│   ├── supabase/    # Client Supabase
│   └── n8n/         # Integração n8n
├── hooks/           # Custom React hooks
├── services/        # Serviços de negócio
├── stores/          # Zustand stores
└── types/           # TypeScript types
```

## Configuração Inicial

1. **Configure as variáveis de ambiente**
   - Copie `ENV_EXAMPLE.txt` para `.env.local`
   - Preencha as credenciais do Supabase e n8n
   - Veja `SETUP_ENV.md` para detalhes

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Teste a conexão com Supabase**
   ```bash
   npx tsx src/lib/supabase/test-connection.ts
   ```
   - Veja `TEST_CONNECTION.md` para detalhes

4. **Execute o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```

5. Abra [http://localhost:3000](http://localhost:3000) no navegador

## Fases de Implementação

- ✅ **FASE 1**: Estrutura do projeto e conexão Supabase
- ⏳ **FASE 2**: Autenticação
- ⏳ **FASE 3**: Layout principal
- ⏳ **FASE 4**: Dashboard
- ⏳ **FASE 5**: Banco de questões
- ⏳ **FASE 6**: Resposta de questões
- ⏳ **FASE 7**: Simulados
- ⏳ **FASE 8**: Resultados e histórico
- ⏳ **FASE 9**: Revisões
- ⏳ **FASE 10**: Desempenho
- ⏳ **FASE 11**: Estudar esta questão
- ⏳ **FASE 12**: Integração completa com n8n/RAG
- ⏳ **FASE 13**: Telegram
- ⏳ **FASE 14**: Melhorias de UX, segurança e performance

## Arquitetura

```
APP WEB
    |
    +---- Supabase
    |       |
    |       +-- autenticação
    |       +-- banco de dados
    |       +-- concursos
    |       +-- provas
    |       +-- questões
    |       +-- simulados
    |       +-- respostas
    |       +-- desempenho
    |
    +---- n8n
            |
            +-- IA
            +-- RAG
            +-- geração automática de questões
            +-- explicação de questões
            +-- geração de aulas/resumos
```

## Scripts Disponíveis

```bash
npm run dev      # Inicia servidor de desenvolvimento
npm run build    # Build para produção
npm run start    # Inicia servidor de produção
npm run lint     # Executa ESLint
npm run typecheck # Valida os tipos TypeScript
npm run verify:release # Executa todas as verificações de release
```

Consulte `DEPLOYMENT.md` para configuração, publicação, teste de saúde e rollback.

## Documentação Adicional

- `SETUP_ENV.md` - Configuração de variáveis de ambiente
- `TEST_CONNECTION.md` - Teste de conexão com Supabase
