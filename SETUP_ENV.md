# Configuração de ambiente

## Aplicação Next.js

Crie `.env.local` com valores públicos do cliente:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Nunca coloque `service_role`, senhas do banco ou chaves do n8n em variáveis `NEXT_PUBLIC_*`.

Para geração textual e embeddings no servidor Next.js, configure:

```env
GEMINI_API_KEY=sua-chave-gemini
GEMINI_MODEL=gemini-3.5-flash-lite
GROQ_API_KEY=sua-chave-groq
GROQ_MODEL=openai/gpt-oss-120b
```

`GEMINI_API_KEY` é necessária para a geração primária e para os embeddings RAG. `GEMINI_MODEL` controla somente geração textual; embeddings permanecem fixados em `gemini-embedding-2`. `GROQ_API_KEY` habilita o fallback textual. `GROQ_MODEL` é opcional porque o código possui o default `openai/gpt-oss-120b`. Nenhuma dessas chaves pode usar o prefixo `NEXT_PUBLIC_`.

## Supabase Edge Function e n8n

Configure estes valores como secrets da Edge Function:

```bash
supabase secrets set N8N_WEBHOOK_URL=https://n8n.exemplo.com/webhook/estudo-ia
supabase secrets set N8N_API_KEY=valor-secreto
supabase secrets set ALLOWED_ORIGIN=https://seu-app.exemplo.com
```

Depois implante a função mantendo a verificação JWT habilitada:

```bash
supabase functions deploy estudo-ia
```

O contrato completo está em `supabase/functions/estudo-ia/README.md`.
