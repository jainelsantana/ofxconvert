# Conversor de OFX para Excel e PDF

Este é um sistema moderno, rápido e seguro para conversão de arquivos de extrato bancário no formato **OFX** para planilhas Excel (`.xlsx`) e documentos PDF. A aplicação foi desenvolvida com foco em privacidade, processando todas as informações **estritamente em memória** (sem salvar arquivos temporários, banco de dados ou históricos).

---

## 🚀 Tecnologias Utilizadas

### Frontend
- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4** (Design moderno e responsivo)
- **Shadcn/UI** (Componentes de interface limpos e manuais)
- **React Dropzone** (Área de upload drag-and-drop inteligente)
- **Lucide React** (Pacote de ícones modernos)

### Backend
- **Node.js 22**
- **Next.js API Routes**
- **exceljs** (Geração de planilhas Excel ricas com formatação, congelamento e autofiltros)
- **pdf-lib** (Geração de relatórios PDF com suporte a quebras de linha e paginação dinâmica)
- **date-fns** (Manipulação de datas)
- **zod** (Validação estrita de arquivos e dados no backend)

---

## 🔒 Princípios de Segurança

1. **Privacidade Absoluta:** O processamento ocorre exclusivamente em memória RAM.
2. **Sem Persistência:** Nenhum arquivo temporário é escrito no disco do container.
3. **Sem Bancos de Dados:** Não existem bancos de dados, logins, cookies ou históricos de transações.
4. **Sem Vazamento de Logs:** As rotas do servidor e o parser foram projetados para omitir logs contendo dados confidenciais (valores, descrições ou identificadores bancários).
5. **Autolimpeza de Memória:** Após a codificação em Base64 e resposta para download, os buffers e variáveis contendo dados das transações são explicitamente limpos para permitir a coleta imediata pelo Garbage Collector do Node.js.

---

## 🛠️ Como Executar

A aplicação está totalmente dockerizada utilizando **Multi-stage builds** e roda sob usuário não-root por motivos de segurança.

Certifique-se de ter o Docker instalado e execute:

```bash
docker compose up --build
```

A aplicação estará disponível em:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## Configuração de E-mail

Após converter o OFX, a API envia automaticamente um e-mail com o resumo do extrato e os anexos Excel (`.xlsx`) e PDF.

Preencha a senha da conta SMTP no arquivo `.env` antes de usar em produção:

```env
SMTP_HOST=mail.empresa.com.br
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mail@mail.com.br
SMTP_PASS=
SMTP_FROM=mail@mail.com.br
SMTP_TO=mail@mail.com.br

```

Se `SMTP_PASS` estiver vazio, a conversão é interrompida com uma mensagem de configuração para evitar falso sucesso no envio.

---

## 📁 Estrutura do Projeto

```text
/
├── app/
│   ├── api/
│   │   └── convert/
│   │       └── route.ts         # Endpoint de conversão (Zod + exceljs + pdf-lib)
│   ├── layout.tsx               # Layout principal com fonte Geist/Inter
│   ├── page.tsx                 # Página única do conversor (Upload, progresso, links)
│   └── globals.css              # Estilos globais e Tailwind v4
├── components/
│   ├── ui/
│   │   ├── button.tsx           # Componente de botão Shadcn style
│   │   ├── card.tsx             # Componentes de Card Shadcn style
│   │   └── progress.tsx         # Barra de progresso animada
│   └── ofx-converter.tsx        # Container principal do frontend
├── lib/
│   ├── ofx-parser.ts            # Parser OFX personalizado e robusto (TypeScript puro)
│   ├── excel-generator.ts       # Gerador de planilha Excel (exceljs)
│   ├── pdf-generator.ts         # Gerador de PDF (pdf-lib)
│   └── email-service.ts         # Envio SMTP com resumo e anexos da conversão
├── public/                      # Assets públicos
├── Dockerfile                   # Dockerfile multi-stage com Node 22-alpine
├── docker-compose.yml           # docker-compose com healthcheck e restart policy
├── .dockerignore                # Arquivos ignorados pelo Docker
├── .env.example                 # Exemplo de variáveis de ambiente
├── package.json                 # Dependências e scripts
├── tsconfig.json                # Configuração do TypeScript em modo strict
└── README.md
```

---

## 🧪 Tratamento de Erros e Validações

O conversor valida os seguintes cenários e retorna respostas legíveis:
- **Arquivo Inválido:** Caso o arquivo não seja do formato `.ofx`.
- **OFX Corrompido:** Falha estrutural ao tentar ler as tags básicas do arquivo.
- **Nenhuma Movimentação:** Arquivo OFX válido mas sem nenhuma transação cadastrada no bloco `<BANKTRANLIST>`.
- **Erro Interno:** Qualquer falha inesperada na geração das planilhas ou PDFs é interceptada de forma segura.
