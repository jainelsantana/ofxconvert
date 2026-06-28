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

  try {
    await fs.mkdir(outputDir, { recursive: true });

    updateJob(jobId, { progress: 12, step: "Enviando arquivo", message: "Salvando arquivo recebido." });
    await fs.writeFile(uploadPath, content);

    updateJob(jobId, { progress: 24, step: "Validando OFX", message: "Validando estrutura do arquivo OFX." });
    validateContent(content, settings.maxUploadBytes);

    updateJob(jobId, { progress: 42, step: "Extraindo movimentacoes", message: "Lendo e extraindo dados do OFX." });
    const parsedData = parseOfxBytes(content, filename);

    updateJob(jobId, { progress: 60, step: "Gerando PDF", message: "PDF sendo criado." });
    await generatePdfReport(pdfPath, parsedData);

    updateJob(jobId, { progress: 80, step: "Gerando Excel", message: "Planilha Excel sendo criada." });
    await generateExcelReport(excelPath, parsedData);
    await fs.rm(uploadPath, { force: true });

    updateJob(jobId, {
      progress: 85,
      step: "Enviando e-mail",
      message: "Enviando PDF e Excel por SMTP.",
      email_status: "sending",
      email_error: null,
    });

    const emailResult = await sendConversionEmail(settings, {
      originalFilename: parsedData.originalFilename,
      banco: parsedData.banco,
      summary: parsedData.summary,
      generatedFiles: { pdfPath, excelPath },
    });

    if (emailResult.ok) {
      await completeJob(jobId, outputDir, {
        message: "Arquivo convertido e enviado com sucesso.",
        warning: false,
        emailStatus: "sent",
        emailError: null,
      });
      return;
    }

    await completeJob(jobId, outputDir, {
      message: "Arquivos gerados com sucesso, mas houve erro no envio do e-mail. Baixe o PDF e o Excel pela tela.",
      warning: true,
      emailStatus: "failed",
      emailError: emailResult.error,
    });
  } catch (error) {
    console.error("[CONVERT] Falha ao processar OFX:", error);
    updateJob(jobId, {
      status: "error",
      progress: 100,
      step: "Erro",
      message: error.message || "Erro ao processar o arquivo OFX.",
      email_status: "failed",
      email_error: error.message || "Erro interno ao processar o arquivo OFX.",
    });
    await fs.rm(uploadPath, { force: true }).catch(() => {});
  }
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
