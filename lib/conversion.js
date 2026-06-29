import fs from "node:fs/promises";
import path from "node:path";
import { TEMP_DIR, getSettings } from "./settings";
import { completeJob, updateJob } from "./jobs";
import { sendConversionEmail } from "./email";
import { parseOfxBytes } from "./ofx";
import { generateExcelReport, generatePdfReport } from "./reports";

export async function processConversionJob(jobId, filename, content) {
  const settings = getSettings();
  const outputDir = path.join(TEMP_DIR, jobId);
  const uploadPath = path.join(outputDir, "upload.ofx");
  const pdfPath = path.join(outputDir, "relatorio.pdf");
  const excelPath = path.join(outputDir, "relatorio.xlsx");
  let parsedData;

  try {
    await fs.mkdir(outputDir, { recursive: true });

    updateJob(jobId, { progress: 12, step: "Enviando arquivo", message: "Salvando arquivo recebido." });
    await fs.writeFile(uploadPath, content);

    updateJob(jobId, { progress: 24, step: "Validando OFX", message: "Validando estrutura do arquivo OFX." });
    validateContent(content, settings.maxUploadBytes);

    updateJob(jobId, { progress: 42, step: "Extraindo movimentacoes", message: "Lendo e extraindo dados do OFX." });
    parsedData = parseOfxBytes(content, filename);

    updateJob(jobId, { progress: 60, step: "Gerando PDF", message: "PDF sendo criado." });
    await generatePdfReport(pdfPath, parsedData);

    updateJob(jobId, { progress: 80, step: "Gerando Excel", message: "Planilha Excel sendo criada." });
    await generateExcelReport(excelPath, parsedData);
    await fs.rm(uploadPath, { force: true });
  } catch (error) {
    console.error("[CONVERT] Falha ao processar OFX:", error);
    updateJob(jobId, {
      status: "error",
      progress: 100,
      step: "Erro",
      message: error.message || "Erro ao processar o arquivo OFX.",
      email_status: "skipped",
      email_error: null,
      email_message_id: null,
    });
    await fs.rm(uploadPath, { force: true }).catch(() => {});
    return;
  }

  updateJob(jobId, {
    progress: 85,
    step: "Enviando e-mail",
    message: "PDF e Excel prontos. Tentando enviar os anexos por e-mail.",
    email_status: "pending",
    email_error: null,
    email_message_id: null,
  });

  let emailResult;
  try {
    emailResult = await sendConversionEmail(settings, {
      originalFilename: parsedData.originalFilename,
      banco: parsedData.banco,
      summary: parsedData.summary,
      generatedFiles: { pdfPath, excelPath },
    });
  } catch (error) {
    console.error("[EMAIL] Falha no envio:", error);
    emailResult = {
      ok: false,
      status: "failed",
      error: error.message || "Falha inesperada no envio do e-mail.",
      messageId: null,
    };
  }

  if (emailResult.status === "sent") {
    await completeJob(jobId, outputDir, {
      message: "Arquivo convertido e enviado com sucesso.",
      warning: false,
      emailStatus: "sent",
      emailError: null,
      emailMessageId: emailResult.messageId,
    });
    return;
  }

  const emailFailed = emailResult.status === "failed";
  await completeJob(jobId, outputDir, {
    message: emailFailed
      ? "Arquivos gerados com sucesso, mas houve erro no envio do e-mail. Baixe o PDF e o Excel pela tela."
      : "Arquivos gerados com sucesso, mas o envio do e-mail foi ignorado por falta de configuracao SMTP completa.",
    warning: true,
    emailStatus: emailFailed ? "failed" : "skipped",
    emailError: emailResult.error,
    emailMessageId: emailResult.messageId,
  });
}

export function sanitizeFilename(filename) {
  const baseName = path.basename(filename || "").trim();
  return baseName.replace(/[^A-Za-z0-9._-]+/g, "_") || "arquivo.ofx";
}

export function validateFilename(filename) {
  if (!filename.toLowerCase().endsWith(".ofx")) {
    throw new Error("Arquivo invalido. Envie um arquivo .ofx.");
  }
}

export function validateContent(content, maxUploadBytes) {
  if (!content || content.length === 0) {
    throw new Error("Arquivo invalido. Envie um arquivo .ofx.");
  }
  if (content.length > maxUploadBytes) {
    throw new Error("Arquivo excede o tamanho maximo permitido.");
  }
}
