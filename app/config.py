from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
STORAGE_DIR = APP_DIR / "storage"
TEMP_DIR = STORAGE_DIR / "temp"


class Settings(BaseSettings):
    app_name: str = "ConvertOFX"
    app_env: str = "development"
    app_url: str = "http://localhost:8000"

    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_to: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    max_upload_mb: int = 10
    temp_retention_minutes: int = Field(
        default=30,
        validation_alias=AliasChoices("TEMP_RETENTION_MINUTES", "TEMP_FILE_TTL_MINUTES"),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("max_upload_mb")
    @classmethod
    def validate_max_upload_mb(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("MAX_UPLOAD_MB must be greater than zero.")
        return value

    @field_validator("temp_retention_minutes")
    @classmethod
    def validate_temp_retention_minutes(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("TEMP_FILE_TTL_MINUTES must be greater than zero.")
        return value

    @model_validator(mode="after")
    def normalize_smtp_security(self) -> "Settings":
        if self.smtp_use_tls and self.smtp_use_ssl:
            raise ValueError("SMTP_USE_TLS e SMTP_USE_SSL nao podem ser true ao mesmo tempo.")

        if not self.smtp_use_tls and not self.smtp_use_ssl:
            if self.smtp_port == 465:
                self.smtp_use_ssl = True
            elif self.smtp_port == 587:
                self.smtp_use_tls = True

        return self

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def temp_retention_seconds(self) -> int:
        return self.temp_retention_minutes * 60

    def ensure_directories(self) -> None:
        TEMP_DIR.mkdir(parents=True, exist_ok=True)

    def validate_smtp(self) -> None:
        required_values = {
            "SMTP_HOST": self.smtp_host,
            "SMTP_PORT": str(self.smtp_port),
            "SMTP_USER": self.smtp_user,
            "SMTP_PASSWORD": self.smtp_password,
            "SMTP_FROM": self.smtp_from,
            "SMTP_TO": self.smtp_to,
        }
        missing = [key for key, value in required_values.items() if not value]
        if missing:
            raise ValueError(f"Configuracao SMTP incompleta: faltando {', '.join(missing)}.")

        if self.smtp_use_tls and self.smtp_use_ssl:
            raise ValueError("Configuracao invalida: SMTP_USE_TLS e SMTP_USE_SSL nao podem ser true ao mesmo tempo.")

        if self.smtp_port == 465 and not self.smtp_use_ssl:
            raise ValueError("Configuracao invalida: porta 465 requer SMTP_USE_SSL=true.")

        if self.smtp_port == 587 and not self.smtp_use_tls:
            raise ValueError("Configuracao invalida: porta 587 requer SMTP_USE_TLS=true.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
