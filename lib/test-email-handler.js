import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";

function getTestEmailToken(request) {
  const headerToken = request.headers.get("x-test-email-token");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const queryToken = request.nextUrl.searchParams.get("token");

  return headerToken || bearerToken || queryToken || "";
}

export async function handleTestEmailRequest(request) {
  const configuredToken = process.env.TEST_EMAIL_TOKEN || "";
  if (!configuredToken) {
    return NextResponse.json(
      { status: "error", message: "TEST_EMAIL_TOKEN nao configurado." },
      { status: 503 }
    );
  }

  if (getTestEmailToken(request) !== configuredToken) {
    return NextResponse.json(
      { status: "error", message: "Nao autorizado para testar o envio de e-mail." },
      { status: 401 }
    );
  }

  const settings = getSettings();
  const result = await sendTestEmail(settings);

  if (result.status === "sent") {
    return NextResponse.json({
      status: "ok",
      message: "E-mail de teste enviado com sucesso.",
      email_status: result.status,
      email_message_id: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
    });
  }

  const statusCode = result.status === "skipped" ? 400 : 502;
  return NextResponse.json(
    {
      status: "error",
      message: "Falha ao enviar e-mail de teste.",
      email_status: result.status,
      email_error: result.error,
      email_message_id: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
    },
    { status: statusCode }
  );
}
