import path from "node:path";

export const APP_NAME = process.env.APP_NAME || "ConvertOFX";
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
export const TEMP_DIR = path.join(STORAGE_DIR, "temp");

function toInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).toLowerCase());
}

export function getSettings() {
  const smtpPort = toInt(process.env.SMTP_PORT, 587);
  const smtpSecure = toBool(process.env.SMTP_SECURE, smtpPort === 465);

  return {
    appName: APP_NAME,
    maxUploadBytes: toInt(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
    tempRetentionMs: toInt(process.env.TEMP_FILE_TTL_MINUTES || process.env.TEMP_RETENTION_MINUTES, 30) * 60 * 1000,
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: smtpPort,
      secure: smtpSecure,
      heloName: process.env.SMTP_HELO_NAME || "localhost",
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      from: process.env.SMTP_FROM || "",
      to: process.env.SMTP_TO || "",
    },
  };
}

export function getMissingSmtpSettings(settings) {
  const required = {
    SMTP_HOST: settings.smtp.host,
    SMTP_PORT: String(settings.smtp.port || ""),
    SMTP_USER: settings.smtp.user,
    SMTP_PASS: settings.smtp.pass,
    SMTP_FROM: settings.smtp.from,
    SMTP_TO: settings.smtp.to,
  };
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function validateSmtpSettings(settings) {
  const missing = getMissingSmtpSettings(settings);
  if (missing.length > 0) {
    throw new Error(`Configuracao SMTP incompleta: faltando ${missing.join(", ")}.`);
  }

  if (settings.smtp.port === 465 && !settings.smtp.secure) {
    throw new Error("Configuracao invalida: porta 465 requer SMTP_SECURE=true.");
  }
}
