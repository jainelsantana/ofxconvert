from datetime import datetime
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel, Field


class TransactionRecord(BaseModel):
    entrada: str = ""
    item: str
    saida: str = ""
    data: str
    banco: str


class SummaryTotals(BaseModel):
    total_entradas: str
    total_saidas: str
    saldo: str
    quantidade_movimentacoes: int


class ParsedOFXData(BaseModel):
    original_filename: str
    banco: str
    records: list[TransactionRecord]
    summary: SummaryTotals
    processed_at: datetime = Field(default_factory=datetime.utcnow)


class GeneratedFiles(BaseModel):
    pdf_path: Path
    excel_path: Path


class EmailPayload(BaseModel):
    original_filename: str
    banco: str
    summary: SummaryTotals
    generated_files: GeneratedFiles


class DownloadLinks(BaseModel):
    pdf: str | None = None
    excel: str | None = None


class ConversionJob(BaseModel):
    job_id: str
    status: str
    progress: int
    step: str
    message: str
    downloads: DownloadLinks = Field(default_factory=DownloadLinks)
    warning: bool = False
    email_status: str = "pending"
    email_error: str | None = None
    original_filename: str | None = None
    output_dir: Path | None = None
    required_downloads: list[str] = Field(default_factory=list)
    downloaded_files: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    expires_at: datetime | None = None


def format_decimal(value: Decimal) -> str:
    quantized = value.quantize(Decimal("0.01"))
    return f"{quantized:.2f}"
