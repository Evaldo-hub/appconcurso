# Comunicação local com o n8n

O frontend usa `NEXT_PUBLIC_AI_GATEWAY` para escolher o gateway. A URL e a chave do n8n nunca são enviadas ao navegador.

## Opção 1 — Next.js local (recomendada para testar agora)

Use no `.env.local`:

```env
NEXT_PUBLIC_AI_GATEWAY=local
N8N_WEBHOOK_URL=http://127.0.0.1:5678/webhook/estudo-ia
N8N_API_KEY=sua-chave-local
SUPABASE_SERVICE_ROLE_KEY=sua-service-role
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Execute o Next.js e o n8n normalmente. O fluxo será:

```text
Navegador → /api/ai/study → n8n local → Supabase
```

A `SUPABASE_SERVICE_ROLE_KEY` é usada somente no servidor Next.js. Nunca use o prefixo `NEXT_PUBLIC_` nela e não envie seu valor pelo chat.

## Opção 2 — Edge Function local

Esta opção exige Supabase CLI e Docker. Copie `.env.local.example` para `.env.local` dentro desta pasta e execute:

```bash
supabase start
supabase functions serve estudo-ia --env-file supabase/functions/.env.local
```

No Windows/Docker, `host.docker.internal` permite que a função alcance o n8n executado no host:

```env
N8N_WEBHOOK_URL=http://host.docker.internal:5678/webhook/estudo-ia
```

Altere o frontend para:

```env
NEXT_PUBLIC_AI_GATEWAY=edge
```

O fluxo será:

```text
Navegador → Edge Function local → n8n local → Supabase local
```

Para testar a Edge Function hospedada com o n8n local, exponha o webhook por um túnel HTTPS e configure essa URL em `N8N_WEBHOOK_URL` nos secrets do Supabase.

## Contrato do webhook n8n

A requisição usa `POST`, JSON e o cabeçalho `X-API-Key`. O payload contém:

- `usuario_id` e `questao_id`;
- `acao`: `explicacao`, `resumo`, `aula` ou `pergunta`;
- `pergunta`, quando aplicável;
- dados da questão;
- somente fontes realmente vinculadas à questão.

Resposta esperada:

```json
{ "conteudo": "texto gerado" }
```

Também é aceito o campo `resposta`. O timeout é de 45 segundos.
