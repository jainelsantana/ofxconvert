import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { getMissingSmtpSettings, validateSmtpSettings } from "./settings";

export async function sendConversionEmail(settings, payload) {
  return sendEmailWithAttachments(settings, {
    subject: "Conversao OFX realizada",
    html: buildConversionHtml(payload),
    text: buildConversionText(payload),
    attachments: [
      {
        filename: path.basename(payload.generatedFiles.pdfPath),
        path: payload.generatedFiles.pdfPath,
        contentType: "application/pdf",
      },
      {
        filename: path.basename(payload.generatedFiles.excelPath),
        path: payload.generatedFiles.excelPath,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });
}

export async function sendTestEmail(settings) {
  const generatedAt = new Date().toISOString();
  return sendEmailWithAttachments(settings, {
    subject: "Teste SMTP ConvertOFX",
    html: `
      <div style="font-family: Arial, sans-serif; color: #172033;">
        <h2>Teste SMTP ConvertOFX</h2>
        <p>Mensagem enviada pelo codigo da aplicacao.</p>
        <p>Destino configurado: <strong>${settings.smtp.to}</strong></p>
        <p>Gerado em: <strong>${generatedAt}</strong></p>
      </div>
    `,
    text: `Teste SMTP do ConvertOFX.\nDestino: ${settings.smtp.to}\nGerado em: ${generatedAt}`,
    attachments: [
      {
        filename: "teste-convertofx.txt",
        content: Buffer.from(`Teste SMTP ConvertOFX\nGerado em: ${generatedAt}\n`),
        contentType: "text/plain; charset=utf-8",
      },
      {
        filename: "teste-convertofx.json",
        content: Buffer.from(
          JSON.stringify(
            {
              app: "ConvertOFX",
              generatedAt,
              smtp_to: settings.smtp.to,
            },
            null,
            2
          )
        ),
        contentType: "application/json",
      },
    ],
  });
}

async function sendEmailWithAttachments(settings, { subject, html, text, attachments }) {
  const missingSettings = getMissingSmtpSettings(settings);
  if (missingSettings.length > 0) {
    const reason = `Configuracao SMTP incompleta: faltando ${missingSettings.join(", ")}.`;
    console.warn("[EMAIL] Envio ignorado:", reason);
    return {
      ok: false,
      status: "skipped",
      error: reason,
      messageId: null,
      accepted: [],
      rejected: [],
      response: null,
    };
  }

  try {
    validateSmtpSettings(settings);
    console.info("[EMAIL] Iniciando envio");
    console.info("[EMAIL] SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_FROM, SMTP_TO:", {
      SMTP_HOST: settings.smtp.host,
      SMTP_PORT: settings.smtp.port,
      SMTP_SECURE: settings.smtp.secure,
      SMTP_FROM: settings.smtp.from,
      SMTP_TO: settings.smtp.to,
    });

    const transporter = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      auth: {
        user: settings.smtp.user,
        pass: settings.smtp.pass,
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });

    const preparedAttachments = await Promise.all(attachments.map((attachment) => prepareAttachment(attachment)));
    console.info(
      "[EMAIL] Anexos preparados com tamanho em bytes:",
      preparedAttachments.map((attachment) => ({
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
      }))
    );

    const info = await transporter.sendMail({
      from: settings.smtp.from,
      to: settings.smtp.to,
      subject,
      text,
      html,
      attachments: preparedAttachments.map(({ sizeBytes, ...attachment }) => attachment),
    });
    console.info("[EMAIL] Enviado com sucesso:", {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
    });

    return {
      ok: true,
      status: "sent",
      error: null,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
    };
  } catch (error) {
    console.error("[EMAIL] Falha no envio:", error);
    return {
      ok: false,
      status: "failed",
      error: error.message || "Falha no envio SMTP.",
      messageId: error?.messageId || null,
      accepted: error?.accepted || [],
      rejected: error?.rejected || [],
      response: error?.response || null,
    };
  }
}

async function prepareAttachment(attachment) {
  if (attachment?.path) {
    const stats = await fs.stat(attachment.path);
    return {
      filename: attachment.filename || path.basename(attachment.path),
      path: attachment.path,
      contentType: attachment.contentType,
      sizeBytes: stats.size,
    };
  }

  if (attachment?.content !== undefined) {
    const buffer = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(String(attachment.content));
    return {
      filename: attachment.filename || "anexo.bin",
      content: buffer,
      contentType: attachment.contentType,
      sizeBytes: buffer.length,
    };
  }

  throw new Error("Anexo invalido para envio de e-mail.");
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
