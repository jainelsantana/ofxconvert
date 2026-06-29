import { after, NextResponse } from "next/server";
import { createJob, cleanupExpiredJobs, ensureTempDir } from "@/lib/jobs";
import { getSettings } from "@/lib/settings";
import { processConversionJob, sanitizeFilename, validateContent, validateFilename } from "@/lib/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const settings = getSettings();
    await ensureTempDir();
    await cleanupExpiredJobs();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Arquivo invalido. Envie um arquivo .ofx.");
    }

    const filename = sanitizeFilename(file.name || "");
    validateFilename(filename);

    const content = Buffer.from(await file.arrayBuffer());
    validateContent(content, settings.maxUploadBytes);

    const job = createJob(filename);
    after(async () => {
      try {
        await processConversionJob(job.job_id, filename, content);
      } catch (error) {
        console.error("[CONVERT] Erro em background:", error);
      }
    });

    return NextResponse.json(
      {
        job_id: job.job_id,
        status: "started",
        message: "Conversao iniciada",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error.message || "Erro ao processar o arquivo OFX." },
      { status: 400 }
    );
  }
}
