# ConvertOFX

Aplicacao web em Next.js para converter arquivos OFX em relatorios PDF e Excel, com envio SMTP opcional. O download dos arquivos continua disponivel mesmo quando o SMTP falha.

## Stack atual

- Next.js 14 com App Router
- Build standalone (`output: "standalone"`)
- Node.js 20
- Dockerfile multi-stage
- Nodemailer para SMTP
- PDFKit para PDF
- SheetJS `xlsx` para Excel

## Deploy definitivo no Coolify

Configure a aplicacao no Coolify com:

- Build Pack: `Dockerfile`
- Porta exposta: `3000`
- Health check: `/health` ou `/api/health`
- Comando final da imagem: `node server.js`

O container escuta em `0.0.0.0:3000` por meio das variaveis:

```env
PORT=3000
HOSTNAME=0.0.0.0
```

## Variaveis de ambiente

Cadastre no Coolify:

```env
SMTP_HOST=mail.seudominio.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario@seudominio.com.br
SMTP_PASS=sua_senha
SMTP_FROM=usuario@seudominio.com.br
SMTP_TO=destino@seudominio.com.br

APP_NAME=ConvertOFX
MAX_UPLOAD_MB=10
TEMP_FILE_TTL_MINUTES=30
```

Para SMTP na porta `465`, use:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

## Como rodar localmente com Docker

```bash
cp .env.example .env
docker compose down
docker compose up -d --build
docker logs -f ofx-converter-web
```

Acesse:

- Tela principal: `http://localhost:3000`
- Health check: `http://localhost:3000/health`
- Health check alternativo: `http://localhost:3000/api/health`

Resposta esperada:

```json
{"status":"ok","service":"ConvertOFX"}
```

## Teste de dominio no Coolify

Depois do deploy, abra o dominio configurado e confirme:

1. A tela principal do ConvertOFX carrega.
2. `https://seu-dominio.com/health` retorna `{"status":"ok","service":"ConvertOFX"}`.
3. O upload de um arquivo `.ofx` inicia a conversao.
4. Os links de PDF e Excel aparecem ao final.

## Teste de SMTP

Com as variaveis SMTP configuradas:

```bash
curl -X POST https://seu-dominio.com/test-email
```

Em ambiente local:

```bash
curl -X POST http://localhost:3000/test-email
```

Se o SMTP falhar durante uma conversao, a aplicacao mostra o erro na tela como aviso e mantem os downloads do PDF e Excel.

## Fluxo da conversao

1. Envie um arquivo `.ofx`.
2. Acompanhe o progresso.
3. A aplicacao gera `relatorio.pdf` e `relatorio.xlsx`.
4. A aplicacao tenta enviar os arquivos por SMTP.
5. Se o SMTP funcionar, o job termina com sucesso.
6. Se o SMTP falhar, o job termina com aviso e os downloads continuam disponiveis.

## Rotas principais

- `GET /`
- `GET /health`
- `GET /api/health`
- `POST /convert`
- `GET /progress/{job_id}`
- `GET /download/{job_id}/pdf`
- `GET /download/{job_id}/excel`
- `POST /test-email`

## Desenvolvimento local sem Docker

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:3000`.
