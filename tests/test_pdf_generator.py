from datetime import datetime
from pathlib import Path

from app.models import ParsedOFXData, SummaryTotals, TransactionRecord
from app.services.pdf_generator import generate_pdf_report


def test_generate_pdf_report(tmp_path: Path) -> None:
    parsed_data = ParsedOFXData(
        original_filename="extrato.ofx",
        banco="Banco Exemplo",
        processed_at=datetime(2026, 6, 25, 10, 30, 0),
        records=[
            TransactionRecord(
                entrada="1500.00",
                item="PIX RECEBIDO CLIENTE X",
                saida="",
                data="25/06/2026",
                banco="Banco Exemplo",
            )
        ],
        summary=SummaryTotals(
            total_entradas="1500.00",
            total_saidas="0.00",
            saldo="1500.00",
            quantidade_movimentacoes=1,
        ),
    )

    output = generate_pdf_report(tmp_path / "saida.pdf", parsed_data)

    assert output.exists()
    assert output.stat().st_size > 100
