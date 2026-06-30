import fs from "node:fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

const REPORT_COLUMNS = [
  { header: "Entrada", key: "entrada", width: 16, pdfWidth: 72, align: "right" },
  { header: "Item", key: "item", width: 52, pdfWidth: 205, align: "left" },
  { header: "Sainda", key: "sainda", width: 16, pdfWidth: 72, align: "right" },
  { header: "Data", key: "data", width: 14, pdfWidth: 65, align: "left" },
  { header: "Banco", key: "banco", width: 26, pdfWidth: 97, align: "left" },
];

const PDF_HEADER_HEIGHT = 22;
const PDF_CELL_PADDING = 5;

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
    doc.text(`Sainda: R$ ${parsedData.summary.total_saidas}`);
    doc.text(`Saldo: R$ ${parsedData.summary.saldo}`);
    doc.text(`Movimentacoes: ${parsedData.summary.quantidade_movimentacoes}`);
    doc.moveDown();

    doc.fontSize(11).fillColor("#0b1d35").text("Movimentacoes", { underline: true });
    doc.moveDown(0.5);

    drawMovementTable(doc, parsedData.records);

    doc.end();
  });
}

export async function generateExcelReport(filePath, parsedData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ConvertOFX";
  workbook.created = new Date();

  const movementSheet = workbook.addWorksheet("Movimentacoes");
  movementSheet.columns = REPORT_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));

  parsedData.records.forEach((record) => movementSheet.addRow(normalizeReportRecord(record)));
  movementSheet.getColumn("entrada").numFmt = "#,##0.00";
  movementSheet.getColumn("sainda").numFmt = "#,##0.00";
  movementSheet.views = [{ state: "frozen", ySplit: 1 }];
  styleHeader(movementSheet);

  const summarySheet = workbook.addWorksheet("Resumo");
  summarySheet.columns = [
    { header: "Campo", key: "campo", width: 34 },
    { header: "Dado", key: "dado", width: 38 },
  ];
  [
    ["Arquivo original", parsedData.originalFilename],
    ["Banco", parsedData.banco],
    ["Total de entradas", parsedData.summary.total_entradas],
    ["Total Sainda", parsedData.summary.total_saidas],
    ["Saldo", parsedData.summary.saldo],
    ["Quantidade de movimentacoes", parsedData.summary.quantidade_movimentacoes],
  ].forEach(([campo, dado]) => summarySheet.addRow({ campo, dado }));
  styleHeader(summarySheet);

  await workbook.xlsx.writeFile(filePath);
}

function drawMovementTable(doc, records) {
  const tableX = doc.page.margins.left;
  drawTableHeader(doc, tableX, doc.y);

  records.forEach((record, index) => {
    const normalized = normalizeReportRecord(record);
    const rowHeight = measureRowHeight(doc, normalized);

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawTableHeader(doc, tableX, doc.page.margins.top);
    }

    drawTableRow(doc, tableX, doc.y, normalized, rowHeight, index);
    doc.y += rowHeight;
  });
}

function drawTableHeader(doc, x, y) {
  let currentX = x;
  doc.lineWidth(0.5).fontSize(8).font("Helvetica-Bold");

  REPORT_COLUMNS.forEach((column) => {
    doc.rect(currentX, y, column.pdfWidth, PDF_HEADER_HEIGHT).fillAndStroke("#0b1d35", "#0b1d35");
    doc
      .fillColor("#ffffff")
      .text(column.header, currentX + PDF_CELL_PADDING, y + 7, {
        width: column.pdfWidth - PDF_CELL_PADDING * 2,
        align: column.align,
      });
    currentX += column.pdfWidth;
  });

  doc.font("Helvetica");
  doc.y = y + PDF_HEADER_HEIGHT;
}

function drawTableRow(doc, x, y, record, rowHeight, index) {
  let currentX = x;
  const background = index % 2 === 0 ? "#ffffff" : "#f8fafc";

  doc.lineWidth(0.5).fontSize(8).font("Helvetica");
  REPORT_COLUMNS.forEach((column) => {
    doc.rect(currentX, y, column.pdfWidth, rowHeight).fillAndStroke(background, "#d9e2ec");
    doc
      .fillColor("#172033")
      .text(formatCellValue(record, column.key), currentX + PDF_CELL_PADDING, y + PDF_CELL_PADDING, {
        width: column.pdfWidth - PDF_CELL_PADDING * 2,
        align: column.align,
      });
    currentX += column.pdfWidth;
  });
}

function measureRowHeight(doc, record) {
  doc.fontSize(8).font("Helvetica");
  const contentHeight = REPORT_COLUMNS.reduce((maxHeight, column) => {
    const text = formatCellValue(record, column.key) || " ";
    const height = doc.heightOfString(text, {
      width: column.pdfWidth - PDF_CELL_PADDING * 2,
      align: column.align,
    });
    return Math.max(maxHeight, height);
  }, 0);

  return Math.max(24, contentHeight + PDF_CELL_PADDING * 2);
}

function normalizeReportRecord(record) {
  return {
    entrada: normalizeAmountValue(record.entrada),
    item: record.item || "",
    sainda: normalizeAmountValue(record.sainda),
    data: record.data || "",
    banco: record.banco || "",
  };
}

function normalizeAmountValue(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : "";
}

function formatCellValue(record, key) {
  if (key === "entrada" || key === "sainda") {
    return formatAmountValue(record[key]);
  }
  return String(record[key] || "");
}

function formatAmountValue(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
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
