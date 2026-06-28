from pathlib import Path

from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.main import app


client = TestClient(app)


def test_invalid_extension_returns_friendly_message() -> None:
    response = client.post(
        "/convert",
        files={"file": ("arquivo.txt", b"nao-ofx", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["message"] == "Arquivo inválido. Envie um arquivo .ofx."


def test_convert_starts_job_and_exposes_downloads(tmp_path: Path, monkeypatch) -> None:
    sample_path = Path("sample/exemplo.ofx")
    monkeypatch.setattr(main, "TEMP_DIR", tmp_path / "temp")
    monkeypatch.setattr(main, "send_conversion_email", lambda settings, payload: (True, None))
    monkeypatch.setattr(Settings, "validate_smtp", lambda self: None)

    with sample_path.open("rb") as handle:
        response = client.post(
            "/convert",
            files={"file": ("extrato.ofx", handle.read(), "application/octet-stream")},
        )

    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "started"
    assert "job_id" in payload

    progress = client.get(f"/progress/{payload['job_id']}")
    assert progress.status_code == 200
    progress_payload = progress.json()
    assert progress_payload["status"] == "done"
    assert progress_payload["email_status"] == "sent"
    assert progress_payload["email_error"] is None
    assert progress_payload["downloads"]["pdf"] == f"/download/{payload['job_id']}/pdf"
    assert progress_payload["downloads"]["excel"] == f"/download/{payload['job_id']}/excel"
    assert not (tmp_path / "temp" / payload["job_id"] / "upload.ofx").exists()
    assert (tmp_path / "temp" / payload["job_id"] / "relatorio.pdf").exists()
    assert (tmp_path / "temp" / payload["job_id"] / "relatorio.xlsx").exists()

    pdf_response = client.get(progress_payload["downloads"]["pdf"])
    excel_response = client.get(progress_payload["downloads"]["excel"])

    assert pdf_response.status_code == 200
    assert excel_response.status_code == 200
    assert not (tmp_path / "temp" / payload["job_id"]).exists()


def test_progress_returns_404_for_unknown_job() -> None:
    response = client.get("/progress/job-inexistente")

    assert response.status_code == 404
    assert response.json()["message"] == "Processo não encontrado."


def test_test_email_route_returns_success(monkeypatch) -> None:
    monkeypatch.setattr(Settings, "validate_smtp", lambda self: None)
    monkeypatch.setattr(main, "send_test_email", lambda settings: (True, None))

    response = client.post("/test-email")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_test_email_route_returns_real_error(monkeypatch) -> None:
    monkeypatch.setattr(Settings, "validate_smtp", lambda self: None)
    monkeypatch.setattr(main, "send_test_email", lambda settings: (False, "Authentication failed"))

    response = client.post("/test-email")

    assert response.status_code == 502
    assert response.json()["detail"] == "Authentication failed"


def test_convert_keeps_downloads_when_email_fails(tmp_path: Path, monkeypatch) -> None:
    sample_path = Path("sample/exemplo.ofx")
    monkeypatch.setattr(main, "TEMP_DIR", tmp_path / "temp")
    monkeypatch.setattr(Settings, "validate_smtp", lambda self: None)
    monkeypatch.setattr(main, "send_conversion_email", lambda settings, payload: (False, "Authentication failed"))

    with sample_path.open("rb") as handle:
        response = client.post(
            "/convert",
            files={"file": ("extrato.ofx", handle.read(), "application/octet-stream")},
        )

    payload = response.json()
    progress = client.get(f"/progress/{payload['job_id']}")
    progress_payload = progress.json()

    assert progress_payload["status"] == "done"
    assert progress_payload["warning"] is True
    assert progress_payload["email_status"] == "failed"
    assert progress_payload["email_error"] == "Authentication failed"
    assert progress_payload["downloads"]["pdf"] == f"/download/{payload['job_id']}/pdf"
    assert progress_payload["downloads"]["excel"] == f"/download/{payload['job_id']}/excel"
    assert not (tmp_path / "temp" / payload["job_id"] / "upload.ofx").exists()
    assert (tmp_path / "temp" / payload["job_id"] / "relatorio.pdf").exists()
    assert (tmp_path / "temp" / payload["job_id"] / "relatorio.xlsx").exists()
