import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { cleanupExpiredJobs, getJob, markDownloadCompleted } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const files = {
  pdf: {
    name: "relatorio.pdf",
    type: "application/pdf",
  },
  excel: {
    name: "relatorio.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

export async function GET(_request, { params }) {
  const { jobId, fileType } = await params;
  await cleanupExpiredJobs();
  const job = getJob(jobId);
  const target = files[fileType];

  if (!job?.outputDir || !target) {
    return NextResponse.json({ detail: "Arquivo nao encontrado para este processo." }, { status: 404 });
  }

  const filePath = path.join(job.outputDir, target.name);

  try {
    const file = await fs.readFile(filePath);
    const response = new NextResponse(file, {
      headers: {
        "Content-Type": target.type,
        "Content-Disposition": `attachment; filename="${target.name}"`,
      },
    });
    markDownloadCompleted(jobId, fileType).catch(() => {});
    return response;
  } catch {
    return NextResponse.json({ detail: "Arquivo ainda nao foi gerado." }, { status: 404 });
  }
}
