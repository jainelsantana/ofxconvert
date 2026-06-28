import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { validateSmtpSettings } from "./settings";

export async function sendConversionEmail(settings, payload) {
  return sendEmailWithAttachments(settings, {
    subject: "Conversao OFX realizada",
    html: buildConversionHtml(payload),
    text: buildConversionText(payload),
    attachments: [payload.generatedFiles.pdfPath, payload.generatedFiles.excelPath],
  });
}

export async function sendTestEmail(settings) {
  return sendEmailWithAttachments(settings, {
    subject: "Teste SMTP ConvertOFX",
    html: `<p>Teste SMTP do ConvertOFX enviado para <strong>${settings.smtp.to}</strong>.</p>`,
    text: "Teste SMTP do ConvertOFX.",
    attachments: [],
  });
}

async function sendEmailWithAttachments(settings, { subject, html, text, attachments }) {
  try {
    validateSmtpSettings(settings);

    const transporter = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      auth: {
        user: settings.smtp.user,
        pass: settings.smtp.pass,
      },
      requireTLS: settings.smtp.tls,
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });

    const preparedAttachments = [];
    for (const attachment of attachments) {
      await fs.access(attachment);
      preparedAttachments.push({
        filename: path.basename(attachment),
        path: attachment,
      });
    }

    await transporter.sendMail({
      from: settings.smtp.from,
      to: settings.smtp.to,
      subject,
      text,
      html,
      attachments: preparedAttachments,
    });

    return { ok: true, error: null };
  } catch (error) {
    console.error("[EMAIL] Falha no envio SMTP:", error);
    return { ok: false, error: error.message || "Falha no envio SMTP." };
  }
}

function buildConversionText(payload) {
  return [
    `Arquivo original: ${payload.originalFilename}`,
    `Banco: ${payload.banco}`,
    `Quantidade de movimentacoes: ${payload.summary.quantidade_movimentacoes}`,
    `Total de entradas: ${payload.summary.total_entradas}`,
    `Total de saidas: ${payload.summary.total_saidas}`,
    `Saldo final: ${payload.summary.saldo}`,
  ].join("\n");
}

function buildConversionHtml(payload) {
  return `
    <div style="font-family: Arial, sans-serif; color: #172033;">
      <h2>Conversao OFX realizada</h2>
      <p>Arquivo original: <strong>${payload.originalFilename}</strong></p>
      <p>Banco: <strong>${payload.banco}</strong></p>
      <p>Quantidade de movimentacoes: <strong>${payload.summary.quantidade_movimentacoes}</strong></p>
      <p>Total de entradas: <strong>${payload.summary.total_entradas}</strong></p>
      <p>Total de saidas: <strong>${payload.summary.total_saidas}</strong></p>
      <p>Saldo final: <strong>${payload.summary.saldo}</strong></p>
    </div>
  `;
}
