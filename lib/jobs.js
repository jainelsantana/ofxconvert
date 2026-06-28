import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TEMP_DIR, getSettings } from "./settings";

const globalStore = globalThis.__convertofxJobs || {
  jobs: new Map(),
};

globalThis.__convertofxJobs = globalStore;

const JOBS_DIR = path.join(TEMP_DIR, "jobs");

function jobFile(jobId) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

function serializeJob(job) {
  return JSON.stringify(job, null, 2);
}

function parseJob(raw) {
  const job = JSON.parse(raw);
  return {
    ...job,
    createdAt: job.createdAt ? new Date(job.createdAt) : null,
    completedAt: job.completedAt ? new Date(job.completedAt) : null,
    expiresAt: job.expiresAt ? new Date(job.expiresAt) : null,
  };
}

function persistJob(job) {
  fsSync.mkdirSync(JOBS_DIR, { recursive: true });
  fsSync.writeFileSync(jobFile(job.job_id), serializeJob(job));
}

function loadJob(jobId) {
  try {
    const job = parseJob(fsSync.readFileSync(jobFile(jobId), "utf8"));
    globalStore.jobs.set(jobId, job);
    return job;
  } catch {
    return null;
  }
}

export function createJob(originalFilename) {
  const jobId = randomUUID().replaceAll("-", "");
  const job = {
    job_id: jobId,
    status: "processing",
    progress: 5,
    step: "Enviando arquivo",
    message: "Arquivo recebido. Iniciando conversao.",
    downloads: {},
    warning: false,
    email_status: "pending",
    email_error: null,
    originalFilename,
    outputDir: null,
    requiredDownloads: ["pdf", "excel"],
    downloadedFiles: [],
    createdAt: new Date(),
    completedAt: null,
    expiresAt: null,
  };
  globalStore.jobs.set(jobId, job);
  persistJob(job);
  return job;
}

export function getJob(jobId) {
  const job = globalStore.jobs.get(jobId) || loadJob(jobId);
  return job ? { ...job, downloads: { ...job.downloads }, downloadedFiles: [...job.downloadedFiles] } : null;
}

export function updateJob(jobId, changes) {
  const job = globalStore.jobs.get(jobId) || loadJob(jobId);
  if (!job) return null;
  const updated = { ...job, ...changes };
  globalStore.jobs.set(jobId, updated);
  persistJob(updated);
  return updated;
}

export function publicJob(job) {
  return {
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    step: job.step,
    message: job.message,
    downloads: job.downloads,
    warning: job.warning,
    email_status: job.email_status,
    email_error: job.email_error,
  };
}

export async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

export async function cleanupExpiredJobs() {
  const now = Date.now();
  await ensureTempDir();
  const files = await fs.readdir(JOBS_DIR).catch(() => []);
  for (const file of files) {
    if (file.endsWith(".json")) {
      loadJob(file.replace(/\.json$/, ""));
    }
  }
  for (const [jobId, job] of globalStore.jobs.entries()) {
    if (job.expiresAt && job.expiresAt.getTime() <= now) {
      await cleanupJob(jobId);
    }
  }
}

export async function cleanupJob(jobId) {
  const job = globalStore.jobs.get(jobId) || loadJob(jobId);
  globalStore.jobs.delete(jobId);
  if (job?.outputDir) {
    await fs.rm(job.outputDir, { recursive: true, force: true });
  }
  await fs.rm(jobFile(jobId), { force: true });
}

export async function completeJob(jobId, outputDir, { message, warning, emailStatus, emailError }) {
  const settings = getSettings();
  const completedAt = new Date();
  const updated = updateJob(jobId, {
    status: "done",
    progress: 100,
    step: warning ? "Concluido com aviso" : "Concluido",
    message,
    downloads: {
      pdf: `/download/${jobId}/pdf`,
      excel: `/download/${jobId}/excel`,
    },
    warning,
    email_status: emailStatus,
    email_error: emailError,
    outputDir,
    completedAt,
    expiresAt: new Date(completedAt.getTime() + settings.tempRetentionMs),
  });

  setTimeout(() => {
    cleanupJob(jobId).catch(() => {});
  }, settings.tempRetentionMs).unref?.();

  return updated;
}

export async function markDownloadCompleted(jobId, fileType) {
  const job = globalStore.jobs.get(jobId) || loadJob(jobId);
  if (!job) return;

  const downloadedFiles = job.downloadedFiles.includes(fileType)
    ? job.downloadedFiles
    : [...job.downloadedFiles, fileType];

  const updated = updateJob(jobId, { downloadedFiles });
  if (updated.requiredDownloads.every((item) => downloadedFiles.includes(item))) {
    await cleanupJob(jobId);
  }
}
