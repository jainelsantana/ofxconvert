from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import ParsedOFXData


def generate_pdf_report(output_path: Path, parsed_data: ParsedOFXData) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    document = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    title_style.textColor = colors.white
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 18

    body_style = styles["BodyText"]
    body_style.leading = 14
    body_style.textColor = colors.HexColor("#172033")

    cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=10,
        textColor=colors.HexColor("#172033"),
    )

    story = [
        _build_brand_header(),
        Spacer(1, 12),
        Paragraph("Relatório de Conversão OFX", title_style),
        Spacer(1, 8),
        Paragraph(f"Data e hora da conversão: {parsed_data.processed_at.strftime('%d/%m/%Y %H:%M:%S')}", body_style),
        Paragraph(f"Arquivo original: {parsed_data.original_filename}", body_style),
        Paragraph(f"Banco identificado: {parsed_data.banco}", body_style),
        Spacer(1, 10),
    ]

    data = [["Entrada", "Item", "Saida", "Data", "Banco"]]
    for record in parsed_data.records:
        data.append(
            [
                record.entrada,
                Paragraph(record.item, cell_style),
                record.saida,
                record.data,
                record.banco,
            ]
        )

    table = Table(data, repeatRows=1, colWidths=[26 * mm, 78 * mm, 26 * mm, 25 * mm, 28 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#081526")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9e2ec")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4fbfe")]),
                ("LINEBELOW", (0, 0), (-1, 0), 1.1, colors.HexColor("#00c8f2")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    story.extend(
        [
            table,
            Spacer(1, 12),
            Paragraph(f"<font color='#081526'><b>Total de entradas:</b></font> {parsed_data.summary.total_entradas}", body_style),
            Paragraph(f"<font color='#081526'><b>Total de saídas:</b></font> {parsed_data.summary.total_saidas}", body_style),
            Paragraph(f"<font color='#081526'><b>Saldo final:</b></font> {parsed_data.summary.saldo}", body_style),
            Paragraph(
                f"<font color='#081526'><b>Quantidade de movimentações:</b></font> {parsed_data.summary.quantidade_movimentacoes}",
                body_style,
            ),
            Spacer(1, 10),
            Paragraph("<font color='#64748b'>ORA Empresas</font>", body_style),
        ]
    )

    document.build(story)
    return output_path


def _build_brand_header() -> Table:
    table = Table([["ORA Empresas"]], colWidths=[182 * mm], rowHeights=[14 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#081526")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -1), 2, colors.HexColor("#00c8f2")),
            ]
        )
    )
    return table
