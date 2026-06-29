import { handleTestEmailRequest } from "@/lib/test-email-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  return handleTestEmailRequest(request);
}

export async function POST(request) {
  return handleTestEmailRequest(request);
}
