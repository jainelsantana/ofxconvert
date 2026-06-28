from __future__ import annotations

import shutil
import logging
import re
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.background import BackgroundTask

from app.config import TEMP_DIR, get_settings
from app.models import ConversionJob, DownloadLinks, EmailPayload, GeneratedFiles
from app.services.email_sender import send_conversion_email, send_test_email
from app.services.excel_generator import generate_excel_report
from app.services.ofx_parser import OFXParserError, parse_ofx_bytes
from app.services.pdf_generator import generate_pdf_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))
JOB_STORE: dict[str, ConversionJob] = {}
JOB_LOCK = threading.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings().ensure_directories()
    _cleanup_expired_jobs()
    yield


app = FastAPI(title="ConvertOFX", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(Path(__file__).resolve().parent / "static")), name="static")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html", _build_page_context(request=request))


@app.post("/convert")
async def convert(background_tasks: BackgroundTasks, file: UploadFile | None = File(None)) -> JSONResponse:
    settings = get_settings()
    _cleanup_expired_jobs()

    try:
        if file is None:
            raise ValueError("Arquivo inválido. Envie um arquivo .ofx.")

        original_name = file.filename or ""
        sanitized_name = _sanitize_filename(original_name)
        _validate_filename(sanitized_name)

        content = await file.read()
        _validate_content(content, settings.max_upload_bytes)
        job_id = uuid.uuid4().hex
        _set_job(
            ConversionJob(
                job_id=job_id,
                status="processing",
                progress=5,
                step="Enviando arquivo",
                message="Arquivo recebido. Iniciando conversão.",
                original_filename=sanitized_name,
                required_downloads=["pdf", "excel"],
            )
        )
        background_tasks.add_task(_process_conversion_job, job_id, sanitized_name, content)
        return JSONResponse(
            {
                "job_id": job_id,
                "status": "started",
                "message": "Conversão iniciada",
            },
            status_code=202,
        )
    except ValueError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=400)
    except Exception:
        logger.exception("Unexpected error while processing OFX file")
        return JSONResponse({"status": "error", "message": "Erro ao processar o arquivo OFX."}, status_code=500)
    finally:
        if file is not None:
            await file.close()


@app.get("/health")
async def health() -> JSONResponse:
    settings = get_settings()
    return JSONResponse({"status": "ok", "service": settings.app_name})


@app.post("/test-email")
async def test_email() -> JSONResponse:
    settings = get_settings()

    try:
        settings.validate_smtp()
    except ValueError as exc:
        return JSONResponse(
            {"status": "error", "message": "Falha ao enviar e-mail de teste.", "detail": str(exc)},
            status_code=400,
        )

    success, error = send_test_email(settings)
    if success:
        return JSONResponse({"status": "ok", "message": "E-mail de teste enviado com sucesso."})

    return JSONResponse(
        {"status": "error", "message": "Falha ao enviar e-mail de teste.", "detail": error},
        status_code=502,
    )


@app.get("/progress/{job_id}")
async def progress(job_id: str) -> JSONResponse:
    _cleanup_expired_jobs()
    job = _get_job(job_id)
    if job is None:
        return JSONResponse({"message": "Processo não encontrado."}, status_code=404)
    return JSONResponse(
        job.model_dump(
            mode="json",
            exclude={"output_dir", "original_filename", "required_downloads", "downloaded_files", "created_at", "completed_at", "expires_at"},
        )
    )


@app.get("/download/{job_id}/{file_type}")
async def download(job_id: str, file_type: str) -> FileResponse:
    _cleanup_expired_jobs()
    job = _get_job(job_id)
    if job is None or job.output_dir is None:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado para este processo.")

    filename_map = {
        "pdf": "relatorio.pdf",
        "excel": "relatorio.xlsx",
    }
    target_name = filename_map.get(file_type)
    if target_name is None:
        raise HTTPException(status_code=404, detail="Tipo de arquivo não disponível.")

    file_path = job.output_dir / target_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo ainda não foi gerado.")

    media_type = "application/pdf" if file_type == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type=media_type,
        background=BackgroundTask(_mark_download_completed, job_id, file_type),
    )


def _build_page_context(
    request: Request,
) -> dict[str, object]:
    return {
        "request": request,
        "app_name": get_settings().app_name,
    }


def _sanitize_filename(filename: str) -> str:
    base_name = Path(filename).name.strip()
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", base_name)
    return sanitized or "arquivo.ofx"


def _validate_filename(filename: str) -> None:
    if not filename.lower().endswith(".ofx"):
        raise ValueError("Arquivo inválido. Envie um arquivo .ofx.")


def _validate_content(content: bytes, max_upload_bytes: int) -> None:
    if not content:
        raise ValueError("Arquivo inválido. Envie um arquivo .ofx.")
    if len(content) > max_upload_bytes:
        raise ValueError("Arquivo excede o tamanho máximo permitido.")


def _process_conversion_job(job_id: str, filename: str, content: bytes) -> None:
    settings = get_settings()
    output_dir = TEMP_DIR / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    upload_path = output_dir / "upload.ofx"

    try:
        _update_job(job_id, progress=12, step="Enviando arquivo", message="Salvando arquivo recebido.")
        upload_path.write_bytes(content)

        _update_job(job_id, progress=24, step="Validando OFX", message="Validando estrutura do arquivo OFX.")
        _validate_content(content, settings.max_upload_bytes)

        _update_job(job_id, progress=42, step="Extraindo movimentações", message="Lendo e extraindo dados do OFX.")
        parsed_data = parse_ofx_bytes(content, filename)

        parsed_data.processed_at = datetime.utcnow()
        generated_files = GeneratedFiles(
            pdf_path=output_dir / "relatorio.pdf",
            excel_path=output_dir / "relatorio.xlsx",
        )

        _update_job(job_id, progress=60, step="Gerando PDF", message="PDF sendo criado.")
        generate_pdf_report(generated_files.pdf_path, parsed_data)

        _update_job(job_id, progress=80, step="Gerando Excel", message="Planilha Excel sendo criada.")
        generate_excel_report(generated_files.excel_path, parsed_data)
        _remove_file(upload_path)

        payload = EmailPayload(
            original_filename=parsed_data.original_filename,
            banco=parsed_data.banco,
            summary=parsed_data.summary,
            generated_files=generated_files,
        )

        _update_job(
            job_id,
            progress=85,
            step="Enviando e-mail",
            message="Enviando PDF e Excel por SMTP.",
            email_status="sending",
            email_error=None,
        )
        try:
            settings.validate_smtp()
            email_sent, email_error = send_conversion_email(settings, payload)
            if not email_sent:
                raise ValueError(email_error or "Falha desconhecida no envio SMTP.")

            _complete_job(
                job_id,
                output_dir,
                "Arquivo convertido e enviado com sucesso.",
                warning=False,
                email_status="sent",
                email_error=None,
            )
        except ValueError as exc:
            logger.warning("Job %s finished with email delivery warning.", job_id)
            _complete_job(
                job_id,
                output_dir,
                "Arquivos gerados com sucesso, mas houve erro no envio do e-mail. Baixe o PDF e o Excel pela tela.",
                warning=True,
                email_status="failed",
                email_error=str(exc),
            )
    except (ValueError, OFXParserError) as exc:
        logger.warning("Job %s failed during conversion: %s", job_id, exc)
        _update_job(job_id, status="error", progress=100, step="Erro", message=str(exc), email_status="failed", email_error=str(exc))
        _remove_file(upload_path)
    except Exception:
        logger.exception("Job %s failed unexpectedly", job_id)
        _update_job(
            job_id,
            status="error",
            progress=100,
            step="Erro",
            message="Erro ao processar o arquivo OFX.",
            email_status="failed",
            email_error="Erro interno ao processar o arquivo OFX.",
        )
        _remove_file(upload_path)


def _complete_job(
    job_id: str,
    output_dir: Path,
    message: str,
    warning: bool,
    email_status: str,
    email_error: str | None,
) -> None:
    settings = get_settings()
    completed_at = datetime.utcnow()
    downloads = DownloadLinks(
        pdf=f"/download/{job_id}/pdf",
        excel=f"/download/{job_id}/excel",
    )
    step = "Concluído com aviso" if warning else "Concluído"
    _update_job(
        job_id,
        status="done",
        progress=100,
        step=step,
        message=message,
        downloads=downloads,
        warning=warning,
        email_status=email_status,
        email_error=email_error,
        output_dir=output_dir,
        completed_at=completed_at,
        expires_at=completed_at + timedelta(seconds=settings.temp_retention_seconds),
    )
    cleanup_timer = threading.Timer(settings.temp_retention_seconds, _cleanup_job, args=(job_id,))
    cleanup_timer.daemon = True
    cleanup_timer.start()


def _set_job(job: ConversionJob) -> None:
    with JOB_LOCK:
        JOB_STORE[job.job_id] = job


def _get_job(job_id: str) -> ConversionJob | None:
    with JOB_LOCK:
        job = JOB_STORE.get(job_id)
        return job.model_copy(deep=True) if job is not None else None


def _update_job(job_id: str, **changes: object) -> None:
    with JOB_LOCK:
        job = JOB_STORE.get(job_id)
        if job is None:
            return
        JOB_STORE[job_id] = job.model_copy(update=changes)


def _mark_download_completed(job_id: str, file_type: str) -> None:
    with JOB_LOCK:
        job = JOB_STORE.get(job_id)
        if job is None:
            return
        downloaded = list(job.downloaded_files)
        if file_type not in downloaded:
            downloaded.append(file_type)
        updated_job = job.model_copy(update={"downloaded_files": downloaded})
        JOB_STORE[job_id] = updated_job

    if _should_cleanup_after_download(updated_job):
        _cleanup_job(job_id)


def _should_cleanup_after_download(job: ConversionJob) -> bool:
    return bool(job.required_downloads) and all(item in job.downloaded_files for item in job.required_downloads)


def _cleanup_expired_jobs() -> None:
    now = datetime.utcnow()
    expired_job_ids: list[str] = []
    with JOB_LOCK:
        for job_id, job in JOB_STORE.items():
            if job.expires_at is not None and job.expires_at <= now:
                expired_job_ids.append(job_id)
    for job_id in expired_job_ids:
        _cleanup_job(job_id)


def _cleanup_job(job_id: str) -> None:
    output_dir: Path | None = None
    with JOB_LOCK:
        job = JOB_STORE.pop(job_id, None)
        if job is not None:
            output_dir = job.output_dir
    if output_dir is not None and output_dir.exists():
        shutil.rmtree(output_dir, ignore_errors=True)


def _remove_file(file_path: Path) -> None:
    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove temporary file %s", file_path, exc_info=True)
