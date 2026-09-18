# Project Rules for Devin

## Project Overview
Plataforma Inteligente de Estudos para Concursos - Modern web application for public exam studies.

## Stack
- Next.js 14+ (App Router) with TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth + Database)
- n8n (AI/RAG integration)
- Zustand (state management)

## Build Commands
```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

## Test Commands
```bash
npx tsx src/lib/supabase/test-connection.ts  # Test Supabase connection
```

## Project Structure
- `src/app/(auth)/` - Authentication routes (login, register, reset-password)
- `src/app/(dashboard)/` - Main authenticated routes (dashboard, questoes, simulados, etc.)
- `src/components/` - React components
- `src/lib/supabase/` - Supabase client and types
- `src/services/` - Business logic services
- `src/hooks/` - Custom React hooks
- `src/stores/` - Zustand state management

## Important Rules
- NEVER modify existing Supabase tables without analysis
- NEVER create fake data for production
- NEVER expose private keys in frontend
- All database changes must be presented as SQL migrations first
- Implement RLS (Row Level Security) for Supabase
- Use Supabase Edge Functions for n8n integration (security)
- Always test changes before committing

## Current Implementation Phase
✅ FASE 1: Estrutura do projeto e conexão Supabase (COMPLETED)
✅ FASE 2: Autenticação (COMPLETED)
⏳ FASE 3: Layout Principal (IN PROGRESS)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
