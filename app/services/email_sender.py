from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from app.config import Settings
from app.models import EmailPayload

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    pass


def send_conversion_email(settings: Settings, payload: EmailPayload) -> tuple[bool, str | None]:
    attachments = [payload.generated_files.pdf_path, payload.generated_files.excel_path]
    return send_email_with_attachments(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        smtp_from=settings.smtp_from,
        smtp_to=settings.smtp_to,
        subject="Conversao OFX realizada",
        html_body=_build_html_body(payload),
        text_body=_build_plain_text_body(payload),
        attachments=attachments,
        use_tls=settings.smtp_use_tls,
        use_ssl=settings.smtp_use_ssl,
    )


def send_test_email(settings: Settings) -> tuple[bool, str | None]:
    return send_email_with_attachments(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user,
        smtp_password=settings.smtp_password,
        smtp_from=settings.smtp_from,
        smtp_to=settings.smtp_to,
        subject="Teste SMTP ConvertOFX",
        html_body=_build_test_email_html(settings.smtp_to),
        text_body="Teste SMTP do ConvertOFX.",
        attachments=[],
        use_tls=settings.smtp_use_tls,
        use_ssl=settings.smtp_use_ssl,
    )


def send_email_with_attachments(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    smtp_from: str,
    smtp_to: str,
    subject: str,
    html_body: str,
    text_body: str,
    attachments: list[Path],
    use_tls: bool,
    use_ssl: bool,
    timeout: int = 30,
) -> tuple[bool, str | None]:
    try:
        _validate_smtp_inputs(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            smtp_from=smtp_from,
            smtp_to=smtp_to,
            use_tls=use_tls,
            use_ssl=use_ssl,
        )

        message = EmailMessage()
        message["From"] = smtp_from
        message["To"] = smtp_to
        message["Subject"] = subject
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")

        for attachment in attachments:
            _attach_file(message, attachment)

        logger.info("[EMAIL] Iniciando envio SMTP")
        logger.info("[EMAIL] Host: %s", smtp_host)
        logger.info("[EMAIL] Porta: %s", smtp_port)
        logger.info("[EMAIL] SSL: %s", use_ssl)
        logger.info("[EMAIL] TLS: %s", use_tls)
        logger.info("[EMAIL] From: %s", smtp_from)
        logger.info("[EMAIL] To: %s", smtp_to)
        logger.info("[EMAIL] Anexos: %s", ", ".join([path.name for path in attachments]) if attachments else "nenhum")

        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=timeout, context=context) as server:
                server.login(smtp_user, smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=timeout) as server:
                server.ehlo()
                if use_tls:
                    context = ssl.create_default_context()
                    server.starttls(context=context)
                    server.ehlo()
                server.login(smtp_user, smtp_password)
                server.send_message(message)

        logger.info("[EMAIL] E-mail enviado com sucesso")
        return True, None
    except Exception as exc:
        logger.exception("[EMAIL] Falha no envio SMTP: %s", exc)
        return False, str(exc)


def _attach_file(message: EmailMessage, attachment: Path) -> None:
    if not attachment.exists():
        raise EmailDeliveryError(f"Anexo nao encontrado: {attachment.name}")

    content = attachment.read_bytes()
    maintype = "application"
    subtype = "octet-stream"
    if attachment.suffix.lower() == ".pdf":
        subtype = "pdf"
    elif attachment.suffix.lower() == ".xlsx":
        subtype = "vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    message.add_attachment(content, maintype=maintype, subtype=subtype, filename=attachment.name)


def _build_plain_text_body(payload: EmailPayload) -> str:
    return (
        f"Arquivo original: {payload.original_filename}\n"
        f"Banco: {payload.banco}\n"
        f"Quantidade de movimentações: {payload.summary.quantidade_movimentacoes}\n"
        f"Total de entradas: {payload.summary.total_entradas}\n"
        f"Total de saídas: {payload.summary.total_saidas}\n"
        f"Saldo final: {payload.summary.saldo}\n"
    )


def _build_html_body(payload: EmailPayload) -> str:
    return f"""
    <html>
      <body style="margin:0; font-family: Arial, sans-serif; color: #172033; background: #f4f7fb;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff;">
          <div style="background: #081526; padding: 18px 24px; border-bottom: 3px solid #00c8f2;">
            <h2 style="margin: 0; color: #ffffff;">Conversão OFX realizada</h2>
          </div>
          <div style="padding: 24px;">
            <p>Arquivo original: <strong>{payload.original_filename}</strong></p>
            <p>Banco: <strong>{payload.banco}</strong></p>
            <p>Quantidade de movimentações: <strong style="color:#009ec3;">{payload.summary.quantidade_movimentacoes}</strong></p>
            <p>Total de entradas: <strong style="color:#009ec3;">{payload.summary.total_entradas}</strong></p>
            <p>Total de saídas: <strong style="color:#009ec3;">{payload.summary.total_saidas}</strong></p>
            <p>Saldo final: <strong style="color:#081526;">{payload.summary.saldo}</strong></p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


def _build_test_email_html(recipient: str) -> str:
    return f"""
    <html>
      <body style="margin:0; font-family: Arial, sans-serif; color: #172033; background: #f4f7fb;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff;">
          <div style="background: #081526; padding: 18px 24px; border-bottom: 3px solid #00c8f2;">
            <h2 style="margin: 0; color: #ffffff;">Teste SMTP ConvertOFX</h2>
          </div>
          <div style="padding: 24px;">
            <p>O envio de teste foi disparado para <strong>{recipient}</strong>.</p>
            <p>Se voce recebeu esta mensagem, a configuracao SMTP do ConvertOFX esta funcionando.</p>
          </div>
        </div>
      </body>
    </html>
    """.strip()


def _validate_smtp_inputs(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    smtp_from: str,
    smtp_to: str,
    use_tls: bool,
    use_ssl: bool,
) -> None:
    required_values = {
        "SMTP_HOST": smtp_host,
        "SMTP_PORT": str(smtp_port),
        "SMTP_USER": smtp_user,
        "SMTP_PASSWORD": smtp_password,
        "SMTP_FROM": smtp_from,
        "SMTP_TO": smtp_to,
    }
    missing = [key for key, value in required_values.items() if not value]
    if missing:
        raise EmailDeliveryError(f"Configuracao SMTP incompleta: faltando {', '.join(missing)}.")

    if use_tls and use_ssl:
        raise EmailDeliveryError("Configuracao invalida: SMTP_USE_TLS e SMTP_USE_SSL nao podem ser true ao mesmo tempo.")

    if smtp_port == 465 and not use_ssl:
        raise EmailDeliveryError("Configuracao invalida: porta 465 requer SMTP_USE_SSL=true.")

    if smtp_port == 587 and not use_tls:
        raise EmailDeliveryError("Configuracao invalida: porta 587 requer SMTP_USE_TLS=true.")
