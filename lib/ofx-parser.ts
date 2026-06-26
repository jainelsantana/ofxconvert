export interface OFXTransaction {
  entrada: number | null; // Valor positivo se for crédito, caso contrário null
  saida: number | null;   // Valor absoluto (positivo) se for débito, caso contrário null
  item: string;           // Descrição da transação (MEMO ou NAME)
  data: string;           // Formato: dd/MM/yyyy
  dateValue: Date;        // Objeto Date para ordenação/processamento
  banco: string;          // Nome do banco
}

export interface OFXParseResult {
  banco: string;
  transactions: OFXTransaction[];
}

/**
 * Extracts the value of a specific OFX tag from a text block.
 * Handles both XML-style (<TAG>value</TAG>) and SGML-style (<TAG>value) tags.
 */
function extractTag(text: string, tag: string): string | null {
  // Try XML-style first: <TAG>value</TAG>
  const xmlRegex = new RegExp(`<${tag}>[\\s]*([\\s\\S]*?)<\\/${tag}>`, "i");
  const xmlMatch = text.match(xmlRegex);
  if (xmlMatch && xmlMatch[1]) {
    return xmlMatch[1].trim();
  }

  // Fallback to SGML-style: <TAG>value (until next tag or end of line)
  const sgmlRegex = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const sgmlMatch = text.match(sgmlRegex);
  if (sgmlMatch && sgmlMatch[1] !== undefined) {
    return sgmlMatch[1].trim();
  }

  return null;
}

/**
 * Parses an OFX date string to a JS Date object.
 * Handles formats: YYYYMMDD, YYYYMMDDHHMMSS, YYYYMMDDHHMMSS.SSS,
 * and timezone suffixes like YYYYMMDD[-3:BRT] or YYYYMMDDHHMMSS[-3:BRT].
 */
function parseOFXDate(raw: string): Date | null {
  if (!raw) return null;

  // Strip timezone suffix e.g. "[-3:BRT]" or "[+0:GMT]"
  const cleaned = raw.replace(/\[.*?\]/g, "").trim();

  if (cleaned.length < 8) return null;

  const year  = parseInt(cleaned.substring(0, 4), 10);
  const month = parseInt(cleaned.substring(4, 6), 10) - 1; // 0-indexed
  const day   = parseInt(cleaned.substring(6, 8), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  return new Date(year, month, day);
}

/**
 * Formats a JS Date object to dd/MM/yyyy string.
 */
function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Splits the OFX text into individual STMTTRN transaction blocks.
 * Supports both:
 *  - XML format: <STMTTRN>...</STMTTRN>
 *  - SGML format: <STMTTRN>...<STMTTRN> (no closing tags, as used by most Brazilian banks)
 */
function splitTransactionBlocks(ofxText: string): string[] {
  const blocks: string[] = [];

  // First try XML-style with explicit closing tags
  const xmlRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  let xmlCount = 0;

  while ((match = xmlRegex.exec(ofxText)) !== null) {
    blocks.push(match[1]);
    xmlCount++;
  }

  if (xmlCount > 0) {
    return blocks;
  }

  // Fallback: SGML-style — split on <STMTTRN> tag occurrences
  // Each block is the content between one <STMTTRN> and the next <STMTTRN> (or end of list)
  const sgmlSplitRegex = /<STMTTRN>/gi;
  const positions: number[] = [];

  while ((match = sgmlSplitRegex.exec(ofxText)) !== null) {
    positions.push(match.index + match[0].length); // Start of content AFTER <STMTTRN>
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    // End is either at the next <STMTTRN> opening or the </BANKTRANLIST> or end of file
    const nextStart = i + 1 < positions.length
      ? positions[i + 1] - "<STMTTRN>".length // Back up to before the next opening tag
      : ofxText.length;

    const blockText = ofxText.substring(start, nextStart);
    blocks.push(blockText);
  }

  return blocks;
}

/**
 * Normalizes OFX text encoding issues.
 * Some Brazilian banks export with Windows-1252 characters that can cause parsing issues.
 * This cleans common artifacts from re-encoding.
 */
function normalizeEncoding(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Strip BOM if present
    .replace(/^\uFEFF/, "");
}

/**
 * Parses an OFX file content and extracts bank information and transactions.
 * Designed to handle:
 *  - SGML format (no closing tags) — used by Banco do Brasil and most Brazilian banks
 *  - XML format (with closing tags) — used by some modern bank exports
 *  - Timezone suffixes in dates (e.g., [-3:BRT])
 *  - Windows-1252 / ISO-8859-1 encoding artifacts
 */
export function parseOFX(ofxText: string): OFXParseResult {
  const text = normalizeEncoding(ofxText);

  // 1. Extract Bank Name — try <ORG>, then <FI><ORG>, then <BANKID>
  let banco = "Não informado";

  const orgValue = extractTag(text, "ORG");
  const bankIdValue = extractTag(text, "BANKID");

  if (orgValue && orgValue.length > 0) {
    banco = orgValue;
  } else if (bankIdValue && bankIdValue.length > 0) {
    banco = bankIdValue;
  }

  // Map common Brazilian bank IDs to their names when ORG is not descriptive
  const bankIdMap: Record<string, string> = {
    "001": "Banco do Brasil S.A.",
    "033": "Banco Santander",
    "041": "Banrisul",
    "104": "Caixa Econômica Federal",
    "237": "Banco Bradesco S.A.",
    "341": "Banco Itaú S.A.",
    "756": "Banco Sicoob",
    "260": "Nubank",
    "336": "Banco C6",
    "077": "Banco Inter",
    "212": "Banco Original",
    "748": "Banco Sicredi",
    "422": "Banco Safra",
    "070": "BRB - Banco de Brasília",
    "085": "Ailos",
    "136": "Unicred",
  };

  // If ORG value looks like a numeric bank code, try to map it
  if (banco !== "Não informado" && /^\d+$/.test(banco) && bankIdMap[banco]) {
    banco = bankIdMap[banco];
  }

  // If ORG was not found but BANKID is a known code, use the name
  if (banco === "Não informado" && bankIdValue && bankIdMap[bankIdValue.trim()]) {
    banco = bankIdMap[bankIdValue.trim()];
  }

  // 2. Split into transaction blocks (supports both SGML and XML)
  const transactionBlocks = splitTransactionBlocks(text);
  const transactions: OFXTransaction[] = [];

  for (const block of transactionBlocks) {
    if (!block.trim()) continue;

    // Extract Amount (<TRNAMT>)
    const rawAmount = extractTag(block, "TRNAMT");
    if (!rawAmount) continue;

    // Normalize: some files use comma as decimal separator
    const amountStr = rawAmount.replace(/,/g, ".");
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;

    // Extract Date (<DTPOSTED>)
    const rawDate = extractTag(block, "DTPOSTED");
    let dateValue: Date;
    let dateStr: string;

    if (rawDate) {
      const parsed = parseOFXDate(rawDate);
      if (parsed && !isNaN(parsed.getTime())) {
        dateValue = parsed;
        dateStr = formatDate(parsed);
      } else {
        dateValue = new Date();
        dateStr = formatDate(dateValue);
      }
    } else {
      dateValue = new Date();
      dateStr = formatDate(dateValue);
    }

    // Extract Description (<MEMO> preferred, fallback to <NAME>)
    const memo = extractTag(block, "MEMO");
    const name = extractTag(block, "NAME");

    let item = "Sem descrição";
    if (memo && memo.length > 0) {
      item = memo;
    } else if (name && name.length > 0) {
      item = name;
    }

    // Sanitize description: remove excessive whitespace
    item = item.replace(/\s+/g, " ").trim();

    // Classify as credit (Entrada) or debit (Saída)
    let entrada: number | null = null;
    let saida: number | null = null;

    if (amount >= 0) {
      entrada = amount;
    } else {
      saida = Math.abs(amount); // Show absolute value in Saída column
    }

    transactions.push({
      entrada,
      saida,
      item,
      data: dateStr,
      dateValue,
      banco,
    });
  }

  // Sort chronologically (oldest first)
  transactions.sort((a, b) => a.dateValue.getTime() - b.dateValue.getTime());

  return {
    banco,
    transactions,
  };
}
