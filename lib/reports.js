import fs from "node:fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

export async function generatePdfReport(filePath, parsedData) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const stream = fs.createWriteStream(filePath);

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(20).fillColor("#0b1d35").text("ConvertOFX", { continued: true });
    doc.fontSize(12).fillColor("#009ec3").text("  Relatorio de movimentacoes");
    doc.moveDown();

    doc.fontSize(10).fillColor("#172033");
    doc.text(`Arquivo original: ${parsedData.originalFilename}`);
    doc.text(`Banco: ${parsedData.banco}`);
    doc.text(`Processado em: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsedData.processedAt)}`);
    doc.moveDown();

    doc.fontSize(11).fillColor("#0b1d35").text("Resumo", { underline: true });
    doc.fontSize(10).fillColor("#172033");
    doc.text(`Entradas: R$ ${parsedData.summary.total_entradas}`);
    doc.text(`Saidas: R$ ${parsedData.summary.total_saidas}`);
    doc.text(`Saldo: R$ ${parsedData.summary.saldo}`);
    doc.text(`Movimentacoes: ${parsedData.summary.quantidade_movimentacoes}`);
    doc.moveDown();

    doc.fontSize(11).fillColor("#0b1d35").text("Movimentacoes", { underline: true });
    doc.moveDown(0.5);

    parsedData.records.forEach((record, index) => {
      if (doc.y > 735) doc.addPage();
      doc.fontSize(9).fillColor("#172033");
      doc.text(`${index + 1}. ${record.data} | ${record.item}`, { continued: false });
      doc.fillColor("#4a5568").text(`Entrada: ${record.entrada || "-"}   Saida: ${record.saida || "-"}   Banco: ${record.banco}`);
      doc.moveDown(0.45);
    });

    doc.end();
  });
}

export async function generateExcelReport(filePath, parsedData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConvertOFX";
  workbook.created = new Date();

  const movementSheet = workbook.addWorksheet("Movimentacoes");
  movementSheet.columns = [
    { header: "Data", key: "data", width: 14 },
    { header: "Item", key: "item", width: 52 },
    { header: "Entrada", key: "entrada", width: 16 },
    { header: "Saida", key: "saida", width: 16 },
    { header: "Banco", key: "banco", width: 26 },
  ];

  parsedData.records.forEach((record) => movementSheet.addRow(record));
  styleHeader(movementSheet);

  const summarySheet = workbook.addWorksheet("Resumo");
  summarySheet.columns = [
    { header: "Campo", key: "campo", width: 34 },
    { header: "Valor", key: "valor", width: 38 },
  ];
  [
    ["Arquivo original", parsedData.originalFilename],
    ["Banco", parsedData.banco],
    ["Total de entradas", parsedData.summary.total_entradas],
    ["Total de saidas", parsedData.summary.total_saidas],
    ["Saldo", parsedData.summary.saldo],
    ["Quantidade de movimentacoes", parsedData.summary.quantidade_movimentacoes],
  ].forEach(([campo, valor]) => summarySheet.addRow({ campo, valor }));
  styleHeader(summarySheet);

  await workbook.xlsx.writeFile(filePath);
}

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B1D35" },
  };
  row.alignment = { vertical: "middle" };
}
