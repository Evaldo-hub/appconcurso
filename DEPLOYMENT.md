# Implantação e operação

## 1. Verificação antes da publicação

Execute:

```powershell
npm run verify:release
```

O comando valida ESLint, TypeScript e o build de produção. Não publique se alguma etapa falhar.

## 2. Variáveis da aplicação

Configure no provedor do Next.js:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` com a URL HTTPS final
- `NEXT_PUBLIC_AI_GATEWAY=edge` para produção
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

Use `SUPABASE_SERVICE_ROLE_KEY`, `N8N_WEBHOOK_URL` e `N8N_API_KEY` no servidor Next.js somente se o gateway local for deliberadamente usado. Nunca use o prefixo `NEXT_PUBLIC_` em segredos.

## Publicação no Render

O repositório inclui um `render.yaml` para criar um Web Service Node.js. No painel do Render:

1. Envie este projeto para um repositório GitHub/GitLab/Bitbucket.
2. Selecione **New > Blueprint** e conecte o repositório.
3. Preencha as variáveis solicitadas sem gravar segredos no Git.
4. Use em `NEXT_PUBLIC_APP_URL` a URL HTTPS final, por exemplo `https://plataforma-concursos.onrender.com`.
5. Confirme a criação e aguarde o health check em `/api/health`.

O comando `npm start` respeita automaticamente a variável `PORT` fornecida pelo Render.

## 3. Edge Functions

Configure os secrets e publique:

```powershell
supabase secrets set N8N_WEBHOOK_URL=https://n8n.exemplo/webhook/estudo-ia
supabase secrets set N8N_TELEGRAM_WEBHOOK_URL=https://n8n.exemplo/webhook/telegram
supabase secrets set N8N_API_KEY=valor-secreto
supabase secrets set ALLOWED_ORIGIN=https://app.exemplo.com
supabase secrets set TELEGRAM_BOT_TOKEN=token-do-bot
supabase secrets set TELEGRAM_WEBHOOK_SECRET=segredo-aleatorio-longo
supabase functions deploy estudo-ia
supabase functions deploy telegram-webhook
```

Cadastre o webhook do Telegram com o mesmo `TELEGRAM_WEBHOOK_SECRET` no cabeçalho secreto da API do Telegram.

## 4. Validação após a publicação

1. Acesse `https://seu-dominio/api/health` e confirme `status: ok`.
2. Cadastre um usuário de teste real e confirme login/logout.
3. Responda uma questão e valide persistência e RLS.
4. Execute um simulado curto e consulte seu resultado.
5. Teste uma solicitação de IA e o vínculo do Telegram.
6. Confirme que uma sessão anônima é redirecionada ao login nas rotas internas.

O endpoint de saúde não retorna credenciais, URLs internas ou detalhes de erro.

## 5. Rollback

Mantenha a implantação anterior disponível no provedor. Se a verificação pós-publicação falhar, restaure essa versão e investigue antes de republicar. As migrations são incrementais; não reverta tabelas ou funções em produção sem uma migration de rollback revisada.
