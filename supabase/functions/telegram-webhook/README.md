# Telegram webhook

Configure como secrets da Edge Function:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` — valor aleatório usado pelo Telegram no cabeçalho de autenticação;
- `N8N_TELEGRAM_WEBHOOK_URL`
- `N8N_API_KEY`

Implante a função com a verificação JWT desabilitada, pois a autenticação é feita pelo secret oficial do webhook:

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

Depois registre o webhook na API do Telegram usando:

- URL: `https://PROJECT_REF.supabase.co/functions/v1/telegram-webhook`
- `secret_token`: o mesmo `TELEGRAM_WEBHOOK_SECRET`.

Não coloque o token do bot em arquivos do frontend ou no n8n enviado ao navegador.

## Contrato encaminhado ao n8n

```json
{
  "canal": "telegram",
  "usuario_id": "uuid",
  "telegram_chat_id": 123,
  "telegram_message_id": 456,
  "mensagem": "Quero 5 questões de banco de dados"
}
```

Resposta esperada: `{ "resposta": "texto" }` ou `{ "conteudo": "texto" }`.
