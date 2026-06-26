import { NextResponse } from "next/server";
import { parseOFX } from "@/lib/ofx-parser";
import { generateExcel } from "@/lib/excel-generator";
import { generatePDF } from "@/lib/pdf-generator";
import { EmailConfigurationError, sendConversionEmail } from "@/lib/email-service";
import { z } from "zod";

export const runtime = "nodejs";

// Zod schema to validate request files
const convertSchema = z.object({
  file: z.instanceof(File).refine((file) => {
    // Validate file extension is indeed .ofx
    return file.name.toLowerCase().endsWith(".ofx");
  }, "Arquivo inválido. Selecione um arquivo OFX.")
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo inválido. Selecione um arquivo OFX." },
        { status: 400 }
      );
    }

    // Validate request using Zod
    const validationResult = convertSchema.safeParse({ file });
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    // Read the file as ArrayBuffer first to handle multiple encodings.
    // Brazilian banks (Banco do Brasil, Bradesco, Itaú) export OFX in
    // Windows-1252 / ISO-8859-1 encoding rather than UTF-8.
    let fileText = "";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Detect if the content is valid UTF-8; if not, decode as latin1 (covers Windows-1252)
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        fileText = decoder.decode(bytes);
      } catch {
        // Fallback: decode as Windows-1252 / ISO-8859-1
        const decoder = new TextDecoder("windows-1252");
        fileText = decoder.decode(bytes);
      }
    } catch {
      return NextResponse.json(
        { error: "Não foi possível ler o arquivo." },
        { status: 400 }
      );
    }

    // Parse the OFX content
    let parsedResult;
    try {
      parsedResult = parseOFX(fileText);
    } catch {
      return NextResponse.json(
        { error: "Não foi possível ler o arquivo." },
        { status: 400 }
      );
    }

    // Validate we have at least one transaction
    if (!parsedResult || parsedResult.transactions.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma movimentação encontrada." },
        { status: 400 }
      );
    }

    // Generate output formats in-memory
    let excelBuffer: Buffer;
    let pdfBuffer: Buffer;
    try {
      excelBuffer = await generateExcel(parsedResult.transactions);
      pdfBuffer = await generatePDF(parsedResult.transactions, parsedResult.banco);
    } catch (e) {
      return NextResponse.json(
        { error: "Erro ao converter o arquivo." },
        { status: 500 }
      );
    }

    let emailDelivery;
    try {
      emailDelivery = await sendConversionEmail({
        bankName: parsedResult.banco,
        transactions: parsedResult.transactions,
        excelBuffer,
        pdfBuffer,
        originalFileName: file.name,
      });
    } catch (error) {
      excelBuffer = Buffer.alloc(0);
      pdfBuffer = Buffer.alloc(0);
      fileText = "";

      const message =
        error instanceof EmailConfigurationError
          ? error.message
          : "Conversão realizada, mas não foi possível enviar o e-mail.";

      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }

    // Encode to base64 to send in a single JSON payload
    const excelBase64 = excelBuffer.toString("base64");
    const pdfBase64 = pdfBuffer.toString("base64");

    // Security: explicitly empty and overwrite memory buffers
    excelBuffer = Buffer.alloc(0);
    pdfBuffer = Buffer.alloc(0);
    fileText = "";

    return NextResponse.json({
      success: true,
      banco: parsedResult.banco,
      totalTransactions: parsedResult.transactions.length,
      emailSent: true,
      emailRecipient: emailDelivery.recipient,
      emailMessageId: emailDelivery.messageId,
      emailAccepted: emailDelivery.accepted,
      emailRejected: emailDelivery.rejected,
      emailResponse: emailDelivery.response,
      excel: excelBase64,
      pdf: pdfBase64
    });
  } catch (error) {
    // Avoid writing detailed bank credentials or personal details in server-side logs
    return NextResponse.json(
      { error: "Erro ao converter o arquivo." },
      { status: 500 }
    );
  }
}
