import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email";
import { getSettings, validateSmtpSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const settings = getSettings();

  try {
    validateSmtpSettings(settings);
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: "Falha ao enviar e-mail de teste.", detail: error.message },
      { status: 400 }
    );
  }

  const result = await sendTestEmail(settings);
  if (result.ok) {
    return NextResponse.json({ status: "ok", message: "E-mail de teste enviado com sucesso." });
  }

  return NextResponse.json(
    { status: "error", message: "Falha ao enviar e-mail de teste.", detail: result.error },
    { status: 502 }
  );
}
