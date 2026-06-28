# ConvertOFX

Aplicacao web em FastAPI para receber um arquivo OFX, extrair movimentacoes financeiras, gerar um relatorio PDF e uma planilha Excel `.xlsx`, acompanhar a conversao em tempo real e enviar os arquivos por e-mail via SMTP.

## Objetivo do projeto

O ConvertOFX transforma extratos OFX em entregas prontas para uso operacional, com identidade visual inspirada na ORA Empresas e envio opcional por SMTP sem bloquear os downloads em caso de falha.

## Tecnologias usadas

- Python 3.11+
- FastAPI
- Jinja2 Templates
- HTML5, CSS puro e JavaScript puro
- OFXParse com fallback manual para OFX SGML
- ReportLab
- OpenPyXL
- SMTP com `smtplib`
- Docker e Docker Compose

## Como rodar localmente

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Como rodar com Docker

```bash
docker compose down
docker compose up -d --build --force-recreate
docker logs -f convertofx
```

## Como configurar o `.env`

```env
APP_NAME=ConvertOFX
APP_ENV=production
APP_URL=http://localhost:8000

SMTP_HOST=mail.seudominio.com.br
SMTP_PORT=465
SMTP_USER=usuario@seudominio.com.br
SMTP_PASSWORD=sua_senha
SMTP_FROM=usuario@seudominio.com.br
SMTP_TO=destino@seudominio.com.br
SMTP_USE_TLS=false
SMTP_USE_SSL=true

MAX_UPLOAD_MB=10
TEMP_FILE_TTL_MINUTES=30
```

## Configuracao SMTP

Porta `465` com SSL:

- `SMTP_PORT=465`
- `SMTP_USE_SSL=true`
- `SMTP_USE_TLS=false`

Porta `587` com STARTTLS:

- `SMTP_PORT=587`
- `SMTP_USE_SSL=false`
- `SMTP_USE_TLS=true`

O sistema valida automaticamente:

- `SMTP_USE_TLS` e `SMTP_USE_SSL` nao podem ser `true` ao mesmo tempo
- porta `465` exige SSL
- porta `587` exige STARTTLS
- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` e `SMTP_TO` sao obrigatorios

## Fluxo da conversao

1. Envie o arquivo OFX pela tela principal.
2. Acompanhe a barra de progresso.
3. Aguarde a geracao do PDF e do Excel.
4. O sistema tenta enviar os anexos por SMTP.
5. Baixe o PDF e o Excel pela tela.

## Etapas da barra de progresso

- Enviando arquivo
- Validando OFX
- Extraindo movimentacoes
- Gerando PDF
- Gerando Excel
- Enviando e-mail
- Concluido

O endpoint `GET /progress/{job_id}` tambem informa:

- `email_status`: `pending`, `sending`, `sent` ou `failed`
- `email_error`: mensagem real do SMTP quando houver falha

## Downloads

Rotas disponiveis:

- `GET /download/{job_id}/pdf`
- `GET /download/{job_id}/excel`

Mesmo que o SMTP falhe, os downloads continuam disponiveis enquanto os arquivos temporarios existirem.

## Arquivos temporarios

Os arquivos ficam em `app/storage/temp/{job_id}/`:

- `upload.ofx`
- `relatorio.pdf`
- `relatorio.xlsx`

Eles sao removidos:

- depois que PDF e Excel forem baixados
- ou automaticamente apos o TTL configurado em `TEMP_FILE_TTL_MINUTES`

## Teste de envio de e-mail

Antes de converter um OFX, valide o SMTP:

```bash
curl -X POST http://localhost:8000/test-email
```

Se retornar erro, confira:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_TO`
- `SMTP_USE_TLS`
- `SMTP_USE_SSL`

Para cPanel/webmail, teste primeiro:

```env
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USE_TLS=false
```

Se nao funcionar, teste:

```env
SMTP_PORT=587
SMTP_USE_SSL=false
SMTP_USE_TLS=true
```

## Como testar `/health`

```bash
curl http://localhost:8000/health
```

Resposta esperada:

```json
{"status":"ok","service":"ConvertOFX"}
```

## Como testar `/progress/{job_id}`

Depois de iniciar a conversao com `POST /convert`, consulte:

```bash
curl http://localhost:8000/progress/SEU_JOB_ID
```

Exemplo com sucesso:

```json
{
  "job_id": "abc123",
  "status": "done",
  "progress": 100,
  "step": "Concluído",
  "message": "Arquivo convertido e enviado com sucesso.",
  "email_status": "sent",
  "email_error": null,
  "downloads": {
    "pdf": "/download/abc123/pdf",
    "excel": "/download/abc123/excel"
  }
}
```

Exemplo com falha SMTP:

```json
{
  "job_id": "abc123",
  "status": "done",
  "progress": 100,
  "step": "Concluído com aviso",
  "message": "Arquivos gerados com sucesso, mas houve erro no envio do e-mail. Baixe o PDF e o Excel pela tela.",
  "email_status": "failed",
  "email_error": "Authentication failed",
  "downloads": {
    "pdf": "/download/abc123/pdf",
    "excel": "/download/abc123/excel"
  }
}
```

## Logs SMTP

O envio registra no `docker logs`:

- inicio da tentativa SMTP
- host, porta, SSL/TLS, remetente e destinatario
- nomes dos anexos
- sucesso do envio
- erro real retornado pelo SMTP

As senhas nunca aparecem nos logs.

## Como rodar os testes

```bash
pytest
```
