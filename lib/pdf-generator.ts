import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { OFXTransaction } from "./ofx-parser";

/**
 * Generates a PDF document buffer from OFX transactions.
 * Assumes strict requirements: In-memory only, professional layout,
 * page-numbering, auto-wrap text, BRL currency format.
 */
export async function generatePDF(transactions: OFXTransaction[], bankName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 size definitions: 595.27 x 841.89 points
  const pageHeight = 841.89;
  const pageWidth = 595.27;
  const marginX = 40;
  const marginY = 50;
  const tableWidth = pageWidth - marginX * 2; // 515.27 points printable area

  // Exact column width distribution (adds up to 515)
  const colWidths = {
    entrada: 85,
    item: 175,
    saida: 85,
    data: 70,
    banco: 100
  };

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginY;

  /**
   * Helper function to draw title, bank subtitle, and table header row.
   */
  const drawPageHeader = (page: any, isFirstPage: boolean): number => {
    let y = pageHeight - marginY;

    if (isFirstPage) {
      // Main Document Title
      page.drawText("Extrato Bancário Convertido", {
        x: marginX,
        y: y,
        size: 18,
        font: fontBold,
        color: rgb(15 / 255, 23 / 255, 42 / 255) // slate-900
      });
      y -= 22;

      // Subtitle with Bank Name
      page.drawText(`Banco de Origem: ${bankName}`, {
        x: marginX,
        y: y,
        size: 10,
        font: font,
        color: rgb(100 / 255, 116 / 255, 139 / 255) // slate-500
      });
      y -= 25;
    } else {
      // Small margin at the top of subsequent pages
      y -= 10;
    }

    // Draw Table Header Background (slate-900 theme)
    const headerHeight = 24;
    page.drawRectangle({
      x: marginX,
      y: y - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: rgb(15 / 255, 23 / 255, 42 / 255)
    });

    // Draw Table Header Text
    const headers = [
      { text: "Entrada", x: marginX, w: colWidths.entrada, align: "right" },
      { text: "Item", x: marginX + colWidths.entrada, w: colWidths.item, align: "left" },
      { text: "Saída", x: marginX + colWidths.entrada + colWidths.item, w: colWidths.saida, align: "right" },
      { text: "Data", x: marginX + colWidths.entrada + colWidths.item + colWidths.saida, w: colWidths.data, align: "center" },
      { text: "Banco", x: marginX + colWidths.entrada + colWidths.item + colWidths.saida + colWidths.data, w: colWidths.banco, align: "left" }
    ];

    headers.forEach((h) => {
      let xPos = h.x + 5; // Padding left

      if (h.align === "right") {
        const textW = fontBold.widthOfTextAtSize(h.text, 9);
        xPos = h.x + h.w - 5 - textW; // Align right with padding
      } else if (h.align === "center") {
        const textW = fontBold.widthOfTextAtSize(h.text, 9);
        xPos = h.x + (h.w - textW) / 2; // Center alignment
      }

      page.drawText(h.text, {
        x: xPos,
        y: y - 16,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1) // White color
      });
    });

    return y - headerHeight;
  };

  // Initial draw of page header
  currentY = drawPageHeader(currentPage, true);

  /**
   * Helper function to wrap long text based on the font width metrics.
   */
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word);
          currentLine = "";
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [""];
  };

  /**
   * Format currency values to Brazilian standard (R$ #.##0,00).
   */
  const formatCurrency = (val: number | null): string => {
    if (val === null || val === undefined) return "-";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  // Iterate and render transactions
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    const entradaStr = formatCurrency(tx.entrada);
    const saidaStr = formatCurrency(tx.saida);
    const dataStr = tx.data;
    const bancoStr = tx.banco;

    // Wrap the description/item text
    const wrappedItem = wrapText(tx.item, colWidths.item - 10, 8); // 10 points cell padding
    const lineCount = wrappedItem.length;

    // Calculate row height dynamically
    const rowHeight = Math.max(lineCount * 12 + 8, 20);

    // If table exceeds the printable page area, insert a new page
    if (currentY - rowHeight < 60) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = drawPageHeader(currentPage, false);
    }

    // Alternating rows bg color for readability (slate-50)
    if (i % 2 === 1) {
      currentPage.drawRectangle({
        x: marginX,
        y: currentY - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: rgb(248 / 255, 250 / 255, 252 / 255)
      });
    }

    // Draw bottom border line
    currentPage.drawLine({
      start: { x: marginX, y: currentY - rowHeight },
      end: { x: marginX + tableWidth, y: currentY - rowHeight },
      thickness: 0.5,
      color: rgb(226 / 255, 232 / 255, 240 / 255) // slate-200
    });

    // Draw Column 1: Entrada (Credit)
    if (tx.entrada !== null) {
      const wText = font.widthOfTextAtSize(entradaStr, 8);
      currentPage.drawText(entradaStr, {
        x: marginX + colWidths.entrada - 5 - wText,
        y: currentY - rowHeight / 2 - 3,
        size: 8,
        font: font,
        color: rgb(30 / 255, 41 / 255, 59 / 255) // slate-800
      });
    } else {
      const wText = font.widthOfTextAtSize("-", 8);
      currentPage.drawText("-", {
        x: marginX + colWidths.entrada - 5 - wText,
        y: currentY - rowHeight / 2 - 3,
        size: 8,
        font: font,
        color: rgb(148 / 255, 163 / 255, 184 / 255) // slate-400
      });
    }

    // Draw Column 2: Item Description (Multi-line support)
    let textY = currentY - 12;
    wrappedItem.forEach((line) => {
      currentPage.drawText(line, {
        x: marginX + colWidths.entrada + 5,
        y: textY,
        size: 8,
        font: font,
        color: rgb(51 / 255, 65 / 255, 85 / 255) // slate-600
      });
      textY -= 12;
    });

    // Draw Column 3: Saída (Debit)
    if (tx.saida !== null) {
      const wText = font.widthOfTextAtSize(saidaStr, 8);
      currentPage.drawText(saidaStr, {
        x: marginX + colWidths.entrada + colWidths.item + colWidths.saida - 5 - wText,
        y: currentY - rowHeight / 2 - 3,
        size: 8,
        font: font,
        color: rgb(220 / 255, 38 / 255, 38 / 255) // red-600 (Debit alert color)
      });
    } else {
      const wText = font.widthOfTextAtSize("-", 8);
      currentPage.drawText("-", {
        x: marginX + colWidths.entrada + colWidths.item + colWidths.saida - 5 - wText,
        y: currentY - rowHeight / 2 - 3,
        size: 8,
        font: font,
        color: rgb(148 / 255, 163 / 255, 184 / 255)
      });
    }

    // Draw Column 4: Data (Date)
    const wData = font.widthOfTextAtSize(dataStr, 8);
    currentPage.drawText(dataStr, {
      x: marginX + colWidths.entrada + colWidths.item + colWidths.saida + (colWidths.data - wData) / 2,
      y: currentY - rowHeight / 2 - 3,
      size: 8,
      font: font,
      color: rgb(51 / 255, 65 / 255, 85 / 255)
    });

    // Draw Column 5: Banco (Bank)
    let finalBanco = bancoStr;
    const maxBancoW = colWidths.banco - 10;
    // Dynamic text truncation for bank names that are too long
    if (font.widthOfTextAtSize(finalBanco, 8) > maxBancoW) {
      while (finalBanco.length > 0 && font.widthOfTextAtSize(finalBanco + "...", 8) > maxBancoW) {
        finalBanco = finalBanco.substring(0, finalBanco.length - 1);
      }
      finalBanco += "...";
    }
    currentPage.drawText(finalBanco, {
      x: marginX + colWidths.entrada + colWidths.item + colWidths.saida + colWidths.data + 5,
      y: currentY - rowHeight / 2 - 3,
      size: 8,
      font: font,
      color: rgb(51 / 255, 65 / 255, 85 / 255)
    });

    // Decrement vertical draw coordinate
    currentY -= rowHeight;
  }

  // Draw margins & footers (with dynamic page numbering: "Página X de Y")
  const pages = pdfDoc.getPages();
  for (let j = 0; j < pages.length; j++) {
    const page = pages[j];

    // Footer divider line
    page.drawLine({
      start: { x: marginX, y: 45 },
      end: { x: marginX + tableWidth, y: 45 },
      thickness: 0.5,
      color: rgb(203 / 255, 213 / 255, 225 / 255) // slate-300
    });

    // Footer Text
    page.drawText("Gerado automaticamente pelo Conversor OFX", {
      x: marginX,
      y: 30,
      size: 8,
      font: font,
      color: rgb(148 / 255, 163 / 255, 184 / 255) // slate-400
    });

    // Page Number Text
    const pageNumText = `Página ${j + 1} de ${pages.length}`;
    const pageNumW = font.widthOfTextAtSize(pageNumText, 8);
    page.drawText(pageNumText, {
      x: marginX + tableWidth - pageNumW,
      y: 30,
      size: 8,
      font: font,
      color: rgb(148 / 255, 163 / 255, 184 / 255)
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
