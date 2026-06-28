import { NextResponse } from "next/server";
import { cleanupExpiredJobs, getJob, publicJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { jobId } = await params;
  await cleanupExpiredJobs();
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ message: "Processo nao encontrado." }, { status: 404 });
  }

  return NextResponse.json(publicJob(job));
}
