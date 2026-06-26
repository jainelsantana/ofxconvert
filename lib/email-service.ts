import nodemailer from "nodemailer";
import tls from "tls";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { OFXTransaction } from "./ofx-parser";

interface SendConversionEmailInput {
  bankName: string;
  transactions: OFXTransaction[];
  excelBuffer: Buffer;
  pdfBuffer: Buffer;
  originalFileName: string;
}

export interface SendConversionEmailResult {
  recipient: string;
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export class EmailConfigurationError extends Error {
  constructor(message = "Serviço de e-mail não configurado.") {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

const DEFAULT_SMTP_HOST = "mail.oraempresas.com.br";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_USER = "convertofx@oraempresas.com.br";
const DEFAULT_RECIPIENT = "jainel.santana@oratelecom.com.br";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const user = process.env.SMTP_USER?.trim() || DEFAULT_SMTP_USER;
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  const to = process.env.SMTP_TO?.trim() || DEFAULT_RECIPIENT;
  const port = Number(process.env.SMTP_PORT || DEFAULT_SMTP_PORT);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() !== "false"
    : true;

  if (!pass) {
    throw new EmailConfigurationError("Configure SMTP_PASS com a senha da conta de e-mail.");
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new EmailConfigurationError("SMTP_PORT inválida.");
  }

  return { host, port, secure, user, pass, from, to };
}

function getSummary(transactions: OFXTransaction[]) {
  const totalEntrada = transactions.reduce((sum, tx) => sum + (tx.entrada ?? 0), 0);
  const totalSaida = transactions.reduce((sum, tx) => sum + (tx.saida ?? 0), 0);
  const saldo = totalEntrada - totalSaida;
  const dates = transactions
    .map((tx) => tx.dateValue)
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    totalEntrada,
    totalSaida,
    saldo,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAttachmentBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return sanitized || "extrato";
}

function buildEmailBody(input: SendConversionEmailInput) {
  const summary = getSummary(input.transactions);
  const period =
    summary.firstDate && summary.lastDate
      ? `${dateFormatter.format(summary.firstDate)} a ${dateFormatter.format(summary.lastDate)}`
      : "Não informado";

  const text = [
    "Conversão OFX concluída.",
    "",
    `Banco: ${input.bankName}`,
    `Arquivo original: ${input.originalFileName}`,
    `Período: ${period}`,
    `Movimentações: ${input.transactions.length}`,
    `Total de entradas: ${currencyFormatter.format(summary.totalEntrada)}`,
    `Total de saídas: ${currencyFormatter.format(summary.totalSaida)}`,
    `Saldo do período: ${currencyFormatter.format(summary.saldo)}`,
    "",
    "Os arquivos Excel e PDF seguem anexos.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #061223; line-height: 1.5;">
      <h2 style="margin: 0 0 16px; color: #061223;">Conversão OFX concluída</h2>
      <p style="margin: 0 0 18px;">Segue o resumo do extrato convertido. Os arquivos Excel e PDF estão anexos.</p>
      <table style="border-collapse: collapse; min-width: 420px;">
        <tbody>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Banco</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${escapeHtml(input.bankName)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Arquivo original</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${escapeHtml(input.originalFileName)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Período</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${escapeHtml(period)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Movimentações</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${input.transactions.length}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Entradas</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${currencyFormatter.format(summary.totalEntrada)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Saídas</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${currencyFormatter.format(summary.totalSaida)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #D8E6EF; font-weight: 700;">Saldo</td><td style="padding: 8px 12px; border: 1px solid #D8E6EF;">${currencyFormatter.format(summary.saldo)}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 18px; color: #4A6080; font-size: 12px;">E-mail gerado automaticamente pelo Conversor OFX ORA Empresas.</p>
    </div>
  `;

  return { text, html };
}

async function appendToImapSent(config: EmailConfig, mailOptions: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const composer = new MailComposer(mailOptions);
    composer.compile().build((err, rawMessage) => {
      if (err) {
        return reject(err);
      }

      const socket = tls.connect(
        {
          host: config.host,
          port: 993,
          rejectUnauthorized: false,
        },
        () => {}
      );

      let step = 0;
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("IMAP Timeout"));
      }, 15000);

      socket.on("data", (data) => {
        const str = data.toString();
        if (step === 0 && str.includes("* OK")) {
          step = 1;
          socket.write(`A1 LOGIN "${config.user}" "${config.pass}"\r\n`);
        } else if (step === 1 && str.includes("A1 OK")) {
          step = 2;
          socket.write(`A2 APPEND INBOX.Sent (\\Seen) {${rawMessage.length}}\r\n`);
        } else if (step === 2 && str.includes("+")) {
          step = 3;
          socket.write(rawMessage);
          socket.write("\r\n");
        } else if (step === 3 && str.includes("A2 OK")) {
          step = 4;
          socket.write("A3 LOGOUT\r\n");
          clearTimeout(timeout);
          resolve();
        } else if (str.includes("BAD") || str.includes("NO")) {
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error("IMAP command failed: " + str));
        }
      });

      socket.on("error", (socketErr) => {
        clearTimeout(timeout);
        reject(socketErr);
      });
    });
  });
}

export async function sendConversionEmail(input: SendConversionEmailInput): Promise<SendConversionEmailResult> {
  const config = getEmailConfig();
  const { text, html } = buildEmailBody(input);
  const baseName = getAttachmentBaseName(input.originalFileName);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const mailOptions = {
    from: {
      name: "Conversor OFX ORA Empresas",
      address: config.from,
    },
    to: config.to,
    subject: `Extrato OFX convertido - ${input.bankName}`,
    text,
    html,
    attachments: [
      {
        filename: `${baseName}.xlsx`,
        content: input.excelBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      {
        filename: `${baseName}.pdf`,
        content: input.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);

  // Salva uma copia do email enviado na pasta Sent do IMAP de forma assincrona
  appendToImapSent(config, mailOptions).catch((err) => {
    console.error("Erro ao salvar copia do email enviado no IMAP Sent:", err.message);
  });

  return {
    recipient: config.to,
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String),
    response: info.response,
  };
}
