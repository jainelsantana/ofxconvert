export class OFXParserError extends Error {}

export function parseOfxBytes(buffer, filename) {
  if (!buffer || buffer.length === 0) {
    throw new OFXParserError("Arquivo OFX vazio.");
  }

  const rawText = decodeContent(buffer);
  const blocks = extractTransactionBlocks(rawText);
  if (blocks.length === 0) {
    throw new OFXParserError("Nao foram encontradas movimentacoes no OFX.");
  }

  const banco = resolveBankName(filename, [
    extractTagValue(rawText, "BANKNAME"),
    extractTagValue(rawText, "ORG"),
    extractTagValue(rawText, "BANKID"),
    extractTagValue(rawText, "ACCTID"),
  ]);

  const records = [];
  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const block of blocks) {
    const amountRaw = extractTagValue(block, "TRNAMT");
    if (!amountRaw) continue;

    const amount = parseDecimal(amountRaw);
    if (!Number.isFinite(amount)) continue;

    const item =
      extractTagValue(block, "MEMO") ||
      extractTagValue(block, "NAME") ||
      extractTagValue(block, "CHECKNUM") ||
      extractTagValue(block, "FITID") ||
      "Sem descricao";

    const data = formatOfxDate(extractTagValue(block, "DTPOSTED"));

    if (amount >= 0) {
      totalEntradas += amount;
      records.push({ entrada: normalizeReportAmount(amount), item: cleanText(item), sainda: "", data, banco });
    } else {
      totalSaidas += Math.abs(amount);
      records.push({ entrada: "", item: cleanText(item), sainda: normalizeReportAmount(Math.abs(amount)), data, banco });
    }
  }

  if (records.length === 0) {
    throw new OFXParserError("Nao foram encontradas movimentacoes no OFX.");
  }

  return {
    originalFilename: filename,
    banco,
    records,
    summary: {
      total_entradas: formatDecimal(totalEntradas),
      total_saidas: formatDecimal(totalSaidas),
      saldo: formatDecimal(totalEntradas - totalSaidas),
      quantidade_movimentacoes: records.length,
    },
    processedAt: new Date(),
  };
}

function decodeContent(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return buffer.toString("latin1");
}

function extractTransactionBlocks(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const closedBlocks = [...normalized.matchAll(/<STMTTRN>(.*?)<\/STMTTRN>/gis)].map((match) => match[1]);
  if (closedBlocks.length > 0) return closedBlocks;

  const starts = [...normalized.matchAll(/<STMTTRN>/gi)];
  return starts.map((match, index) => {
    const start = match.index + match[0].length;
    const next = starts[index + 1]?.index || normalized.length;
    return normalized.slice(start, next).split(/<\/BANKTRANLIST>|<\/STMTRS>|<\/OFX>/i)[0];
  });
}

function extractTagValue(text, tag) {
  const match = text.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, "i"));
  return match ? match[1].trim() : null;
}

function parseDecimal(value) {
  return Number.parseFloat(String(value).replace(",", "."));
}

function formatOfxDate(value) {
  if (!value || value.length < 8) {
    return new Intl.DateTimeFormat("pt-BR").format(new Date());
  }
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
}

function resolveBankName(filename, candidates) {
  const found = candidates.find((candidate) => candidate && candidate.trim());
  if (found) return cleanText(found);

  const fromFilename = filename.replace(/\.ofx$/i, "").replace(/[_-]+/g, " ").trim();
  return cleanText(fromFilename || "Banco nao identificado");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,;:()/_-]/gu, "")
    .trim();
}

export function formatDecimal(value) {
  return Number(value).toFixed(2);
}

function normalizeReportAmount(value) {
  return Number(Number(value).toFixed(2));
}
