# ConvertOFX

Aplicacao web para converter extratos bancarios em formato OFX para relatorios em PDF e Excel. O usuario envia um arquivo `.ofx`, acompanha o progresso na tela e, ao final, pode baixar os arquivos gerados. A aplicacao tambem envia o PDF e a planilha por e-mail via SMTP quando a configuracao estiver completa.

Se o envio por e-mail falhar, a conversao nao e perdida: os links de download continuam disponiveis na tela.

## Principais recursos

- Upload de arquivos `.ofx`.
- Validacao de extensao, conteudo e tamanho maximo do upload.
- Leitura das movimentacoes do OFX.
- Separacao de entradas e saidas.
- Geracao de `relatorio.pdf`.
- Geracao de `relatorio.xlsx`.
- Envio automatico dos arquivos por SMTP.
- Acompanhamento de progresso por job.
- Download dos arquivos gerados.
- Limpeza automatica dos arquivos temporarios.
- Health checks para deploy.

## Stack

- Next.js 16 com App Router
- React 19
- Node.js 20
- Build standalone do Next.js com `serverExternalPackages: ["nodemailer"]`
- Docker multi-stage
- Nodemailer para SMTP
- PDFKit para PDF
- ExcelJS para Excel

## Fluxo de conversao

1. O usuario seleciona ou arrasta um arquivo `.ofx`.
2. A rota `POST /convert` cria um job de processamento.
3. O arquivo e validado e salvo temporariamente.
4. As movimentacoes sao extraidas do OFX.
5. A aplicacao gera um PDF e uma planilha Excel.
6. A aplicacao tenta enviar os arquivos por e-mail logo apos gerar o PDF e o Excel.
7. A tela acompanha o progresso por `GET /progress/{jobId}`.
8. Ao concluir, a tela exibe os links para baixar PDF e Excel.

Os arquivos gerados ficam em `storage/temp/{jobId}`. O job tambem fica registrado em `storage/temp/jobs`. A limpeza acontece quando os dois arquivos sao baixados ou quando o tempo configurado em `TEMP_FILE_TTL_MINUTES` expira.

## Variaveis de ambiente

Crie um arquivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Exemplo:

```env
SMTP_HOST=mail.seudominio.com.br
SMTP_PORT=465
SMTP_SECURE=true
SMTP_HELO_NAME=localhost
SMTP_USER=usuario@seudominio.com.br
SMTP_PASS=sua_senha
SMTP_FROM=usuario@seudominio.com.br
SMTP_TO=destino@seudominio.com.br
TEST_EMAIL_TOKEN=troque-este-token

APP_NAME=ConvertOFX
MAX_UPLOAD_MB=10
TEMP_FILE_TTL_MINUTES=30
STORAGE_DIR=/app/storage
```

Observacoes:

- `SMTP_PORT=587` normalmente usa `SMTP_SECURE=false`.
- `SMTP_PORT=465` deve usar `SMTP_SECURE=true`.
- `SMTP_HELO_NAME` permite fixar o nome usado no EHLO/HELO. O padrao do projeto e `localhost`.
- `SMTP_PASS` e a unica variavel aceita para senha SMTP.
- `MAX_UPLOAD_MB` define o tamanho maximo aceito para upload.
- `TEMP_FILE_TTL_MINUTES` define por quanto tempo os arquivos ficam disponiveis.
- `STORAGE_DIR` define onde os arquivos temporarios serao gravados.
- `TEST_EMAIL_TOKEN` protege a rota `/api/test-email`.

## Rodando com Docker

```bash
docker compose up -d --build
```

Acompanhe os logs:

```bash
docker logs -f ofx-converter-web
```

Acesse:

- Aplicacao: `http://localhost:3000`
- Health check: `http://localhost:3000/health`
- Health check alternativo: `http://localhost:3000/api/health`

Resposta esperada dos health checks:

```json
{"status":"ok","service":"ConvertOFX"}
```

O `docker-compose.yml` monta `./storage` em `/app/storage`, mantendo os arquivos temporarios fora da camada descartavel do container.

## Rodando sem Docker

Instale as dependencias:

```bash
npm install
```

Inicie em modo desenvolvimento:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

Para gerar build de producao:

```bash
npm run build
```

Para iniciar a versao standalone:

```bash
npm run start
```

## Deploy no Coolify

Configuracao recomendada:

- Build Pack: `Dockerfile`
- Porta exposta: `3000`
- Health check: `/health` ou `/api/health`
- Comando da imagem: `node server.js`

Variaveis importantes no ambiente de producao:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
STORAGE_DIR=/app/storage
```

Depois do deploy, valide:

1. A tela principal carrega no dominio configurado.
2. `/health` retorna `{"status":"ok","service":"ConvertOFX"}`.
3. O upload de um `.ofx` inicia a conversao.
4. Os links de PDF e Excel aparecem no final.
5. O envio SMTP funciona ou, se falhar, a tela mostra o aviso e mantem os downloads.

## Teste de SMTP

Com as variaveis SMTP configuradas e `TEST_EMAIL_TOKEN` definido, envie:

```bash
curl -H "x-test-email-token: troque-este-token" http://localhost:3000/api/test-email
```

Em producao:

```bash
curl -H "x-test-email-token: troque-este-token" https://seu-dominio.com/api/test-email
```

Resposta de sucesso:

```json
{"status":"ok","message":"E-mail de teste enviado com sucesso."}
```

Essa rota envia anexos simples em memoria para validar o fluxo completo do codigo da aplicacao. Se faltar configuracao, o token estiver errado ou o servidor SMTP recusar a conexao, a rota retorna erro com detalhes.

## Logs de e-mail

Os logs da aplicacao registram:

- `[EMAIL] Iniciando envio`
- `[EMAIL] SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_FROM, SMTP_TO`
- `[EMAIL] Anexos preparados com tamanho em bytes`
- `[EMAIL] Enviado com sucesso` com `messageId`, `accepted`, `rejected` e `response`
- `[EMAIL] Falha no envio` com o erro completo

Nenhum log exibe a senha SMTP.

## Status do job

O endpoint `GET /progress/{jobId}` expone os campos:

- `email_status`: `pending`, `sent`, `failed` ou `skipped`
- `email_error`: mensagem do erro, quando houver
- `email_message_id`: identificador retornado pelo servidor SMTP, quando houver

## Rotas

| Metodo | Rota | Descricao |
| --- | --- | --- |
| `GET` | `/` | Tela principal de upload e conversao |
| `GET` | `/health` | Health check principal |
| `GET` | `/api/health` | Health check alternativo |
| `POST` | `/convert` | Inicia a conversao de um arquivo OFX |
| `GET` | `/progress/{jobId}` | Retorna o status do job |
| `GET` | `/download/{jobId}/pdf` | Baixa o PDF gerado |
| `GET` | `/download/{jobId}/excel` | Baixa a planilha Excel gerada |
| `GET` | `/api/test-email` | Envia um e-mail de teste SMTP com token |

## Estrutura principal

```text
app/
  convert/route.js                 Rota de upload e inicio do job
  progress/[jobId]/route.js         Consulta de progresso
  download/[jobId]/[fileType]/route.js
  health/route.js                   Health check
  api/health/route.js               Health check alternativo
  api/test-email/route.js           Teste SMTP com token
lib/
  conversion.js                     Orquestracao da conversao
  ofx.js                            Parser OFX
  reports.js                        Geracao de PDF e Excel
  email.js                          Envio SMTP
  jobs.js                           Controle e persistencia dos jobs
  settings.js                       Configuracoes por variaveis de ambiente
```

## Cuidados operacionais

- Nao envie arquivos que nao sejam `.ofx`.
- Configure corretamente o SMTP antes de depender do envio automatico por e-mail.
- Em caso de falha de SMTP, verifique os logs `[EMAIL]` para identificar a causa exata.
- Mantenha `storage/` persistente em producao para evitar perda de arquivos durante o processamento.
- Ajuste `TEMP_FILE_TTL_MINUTES` conforme o tempo que os usuarios precisam para baixar os relatorios.
- Em caso de falha de SMTP, use os downloads exibidos na tela.
