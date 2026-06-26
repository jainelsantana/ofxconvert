import ExcelJS from "exceljs";
import { OFXTransaction } from "./ofx-parser";

/**
 * Generates an Excel spreadsheet buffer from OFX transactions.
 * Assumes strict requirements: Bold headers, auto-fit columns, frozen top row,
 * auto-filter, correct date/currency formatting, and all in-memory.
 */
export async function generateExcel(transactions: OFXTransaction[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Extrato");

  // Define columns
  worksheet.columns = [
    { header: "Entrada", key: "entrada", width: 18 },
    { header: "Item", key: "item", width: 35 },
    { header: "Saída", key: "saida", width: 18 },
    { header: "Data", key: "data", width: 15 },
    { header: "Banco", key: "banco", width: 25 }
  ];

  // Freeze the first row (header)
  worksheet.views = [
    { state: "frozen", ySplit: 1 }
  ];

  // Populate transaction data
  transactions.forEach((tx) => {
    worksheet.addRow({
      entrada: tx.entrada,
      item: tx.item,
      saida: tx.saida,
      data: tx.dateValue, // Pass as native JS Date for proper formatting
      banco: tx.banco
    });
  });

  // Enable Auto-filter on the filled range
  const lastRowNumber = worksheet.lastRow ? worksheet.lastRow.number : 1;
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRowNumber, column: 5 }
  };

  // Style the Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "0F172A" } // Charcoal slate gray header for a modern professional look
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  // Format and style data rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip headers

    row.height = 20;

    // Align columns
    row.getCell(1).alignment = { vertical: "middle", horizontal: "right" }; // Entrada
    row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };  // Item
    row.getCell(3).alignment = { vertical: "middle", horizontal: "right" }; // Saída
    row.getCell(4).alignment = { vertical: "middle", horizontal: "center" }; // Data
    row.getCell(5).alignment = { vertical: "middle", horizontal: "left" };  // Banco

    // Currency format for columns 1 (Entrada) and 3 (Saída)
    // Format: R$ #.##0,00;[Red]-R$ #.##0,00;R$ 0,00
    const currencyFormat = '"R$ " #,##0.00;[Red]"R$ " -#,##0.00;"R$ " 0.00;@';

    const cellEntrada = row.getCell(1);
    if (cellEntrada.value !== null && cellEntrada.value !== undefined) {
      cellEntrada.numFmt = currencyFormat;
    }

    const cellSaida = row.getCell(3);
    if (cellSaida.value !== null && cellSaida.value !== undefined) {
      cellSaida.numFmt = currencyFormat;
    }

    // Date format for column 4 (Data)
    const cellData = row.getCell(4);
    cellData.numFmt = "dd/mm/yyyy";

    // Standard styling borders
    row.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10 };
      cell.border = {
        top: { style: "thin", color: { argb: "E2E8F0" } },
        bottom: { style: "thin", color: { argb: "E2E8F0" } },
        left: { style: "thin", color: { argb: "E2E8F0" } },
        right: { style: "thin", color: { argb: "E2E8F0" } }
      };
    });
  });

  // Dynamically auto-fit column widths based on maximum content length
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      let cellText = "";
      if (cell.value instanceof Date) {
        cellText = "10/10/2026"; // Date format width fallback
      } else if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === "object") {
          cellText = JSON.stringify(cell.value);
        } else {
          cellText = cell.value.toString();
        }
      }

      // Add visual margin for currency symbols
      if (column.key === "entrada" || column.key === "saida") {
        cellText = "R$ " + cellText + "   ";
      }

      if (cellText.length > maxLength) {
        maxLength = cellText.length;
      }
    });

    column.width = Math.min(maxLength + 4, 50); // Set width with margin, max 50 chars
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
