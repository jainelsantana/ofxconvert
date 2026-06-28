from __future__ import annotations

import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.models import ParsedOFXData, SummaryTotals, TransactionRecord, format_decimal

logger = logging.getLogger(__name__)

try:
    from ofxparse import OfxParser  # type: ignore
except ImportError:  # pragma: no cover
    OfxParser = None


class OFXParserError(Exception):
    pass


def parse_ofx_bytes(content: bytes, filename: str) -> ParsedOFXData:
    if not content:
        raise OFXParserError("Arquivo OFX vazio.")

    if OfxParser is not None:
        parsed = _parse_with_ofxparse(content, filename)
        if parsed is not None:
            return parsed

    return _parse_manually(content, filename)


def _parse_with_ofxparse(content: bytes, filename: str) -> ParsedOFXData | None:
    try:
        from io import BytesIO

        ofx = OfxParser.parse(BytesIO(content))
        accounts = getattr(ofx, "accounts", []) or []
        if not accounts:
            return None

        bank = _resolve_bank_name(
            filename=filename,
            candidates=[
                getattr(getattr(ofx, "signon", None), "financial_institution", None),
                getattr(getattr(accounts[0], "statement", None), "bank_id", None),
            ],
        )
        transactions = []
        total_entradas = Decimal("0")
        total_saidas = Decimal("0")

        for account in accounts:
            for transaction in getattr(account.statement, "transactions", []):
                amount = Decimal(str(transaction.amount))
                if amount >= 0:
                    entrada = format_decimal(amount)
                    saida = ""
                    total_entradas += amount
                else:
                    entrada = ""
                    saida = format_decimal(abs(amount))
                    total_saidas += abs(amount)

                item = (
                    getattr(transaction, "memo", None)
                    or getattr(transaction, "payee", None)
                    or getattr(transaction, "id", None)
                    or "Sem descricao"
                )
                date_value = getattr(transaction, "date", None)
                if isinstance(date_value, datetime):
                    data = date_value.strftime("%d/%m/%Y")
                else:
                    data = datetime.utcnow().strftime("%d/%m/%Y")

                transactions.append(
                    TransactionRecord(
                        entrada=entrada,
                        item=_clean_text(item),
                        saida=saida,
                        data=data,
                        banco=bank,
                    )
                )

        if not transactions:
            return None

        return ParsedOFXData(
            original_filename=filename,
            banco=bank,
            records=transactions,
            summary=SummaryTotals(
                total_entradas=format_decimal(total_entradas),
                total_saidas=format_decimal(total_saidas),
                saldo=format_decimal(total_entradas - total_saidas),
                quantidade_movimentacoes=len(transactions),
            ),
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("Fallback manual OFX parsing after ofxparse failure: %s", exc)
        return None


def _parse_manually(content: bytes, filename: str) -> ParsedOFXData:
    raw_text = _decode_content(content)
    blocks = _extract_transaction_blocks(raw_text)
    if not blocks:
        raise OFXParserError("Não foram encontradas movimentações no OFX.")

    bank = _resolve_bank_name(
        filename=filename,
        candidates=[
            _extract_tag_value(raw_text, "BANKNAME"),
            _extract_tag_value(raw_text, "ORG"),
            _extract_tag_value(raw_text, "BANKID"),
        ],
    )

    transactions: list[TransactionRecord] = []
    total_entradas = Decimal("0")
    total_saidas = Decimal("0")

    for block in blocks:
        amount_raw = _extract_tag_value(block, "TRNAMT")
        if not amount_raw:
            continue

        try:
            amount = _parse_decimal(amount_raw)
        except InvalidOperation as exc:
            logger.warning("Ignoring transaction with invalid amount '%s': %s", amount_raw, exc)
            continue

        item = None
        for field_name in ("MEMO", "NAME", "CHECKNUM", "FITID"):
            value = _extract_tag_value(block, field_name)
            if value:
                item = value
                break

        dtposted = _extract_tag_value(block, "DTPOSTED")
        date_string = _format_ofx_date(dtposted)

        if amount >= 0:
            entrada = format_decimal(amount)
            saida = ""
            total_entradas += amount
        else:
            entrada = ""
            saida = format_decimal(abs(amount))
            total_saidas += abs(amount)

        transactions.append(
            TransactionRecord(
                entrada=entrada,
                item=_clean_text(item or "Sem descricao"),
                saida=saida,
                data=date_string,
                banco=bank,
            )
        )

    if not transactions:
        raise OFXParserError("Não foram encontradas movimentações no OFX.")

    return ParsedOFXData(
        original_filename=filename,
        banco=bank,
        records=transactions,
        summary=SummaryTotals(
            total_entradas=format_decimal(total_entradas),
            total_saidas=format_decimal(total_saidas),
            saldo=format_decimal(total_entradas - total_saidas),
            quantidade_movimentacoes=len(transactions),
        ),
    )


def _decode_content(content: bytes) -> str:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_transaction_blocks(raw_text: str) -> list[str]:
    normalized = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    regex_blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", normalized, flags=re.IGNORECASE | re.DOTALL)
    if regex_blocks:
        return regex_blocks

    starts = list(re.finditer(r"<STMTTRN>", normalized, flags=re.IGNORECASE))
    if not starts:
        return []

    boundaries = [match.start() for match in starts] + [len(normalized)]
    blocks: list[str] = []
    for index, match in enumerate(starts):
        start = match.end()
        end = boundaries[index + 1]
        block = normalized[start:end]
        block = re.split(r"</BANKTRANLIST>|</STMTRS>|</OFX>", block, maxsplit=1, flags=re.IGNORECASE)[0]
        blocks.append(block)
    return blocks


def _extract_tag_value(text: str, tag: str) -> str | None:
    pattern = rf"<{tag}>([^<\n\r]+)"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _parse_decimal(value: str) -> Decimal:
    normalized = value.strip().replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    return Decimal(normalized)


def _format_ofx_date(value: str | None) -> str:
    if not value:
        return datetime.utcnow().strftime("%d/%m/%Y")

    digits = "".join(character for character in value if character.isdigit())
    if len(digits) < 8:
        return datetime.utcnow().strftime("%d/%m/%Y")

    try:
        return datetime.strptime(digits[:8], "%Y%m%d").strftime("%d/%m/%Y")
    except ValueError:
        return datetime.utcnow().strftime("%d/%m/%Y")


def _clean_text(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or "Sem descricao"


def _resolve_bank_name(filename: str, candidates: list[object]) -> str:
    for candidate in candidates:
        if candidate is None:
            continue
        if hasattr(candidate, "organization"):
            organization = getattr(candidate, "organization", None)
            if organization:
                return _clean_text(str(organization))
        if hasattr(candidate, "fid"):
            fid = getattr(candidate, "fid", None)
            if fid:
                return _clean_text(str(fid))
        if isinstance(candidate, str) and candidate.strip():
            return _clean_text(candidate)

    return _clean_text(Path(filename).stem.replace("_", " ").replace("-", " "))
