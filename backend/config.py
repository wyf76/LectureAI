"""Backend-only configuration, loaded from the repository root."""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPPORTED_EXTENSIONS = (".mp3", ".m4a", ".wav", ".mp4", ".mpeg", ".mpga", ".webm")
MAX_TRANSCRIPT_CHARS = 120_000


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default="", repr=False)
    transcription_model: str = "gpt-transcribe"
    notes_model: str = "gpt-5.6"
    live_transcription_model: str = "gpt-live-transcribe"
    frontend_url: str = "http://localhost:3000"
    max_upload_mb: float = 25
    timeout_seconds: float = 180

    @property
    def max_upload_bytes(self) -> int:
        # Never promise a file size the single-file upstream API cannot handle.
        return int(min(self.max_upload_mb, 25) * 1_000_000)


@lru_cache
def get_settings() -> Settings:
    max_mb = float(os.getenv("MAX_UPLOAD_MB", "25"))
    timeout = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "180"))
    if max_mb <= 0 or timeout <= 0:
        raise ValueError("MAX_UPLOAD_MB and OPENAI_TIMEOUT_SECONDS must be positive.")
    return Settings(
        api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        transcription_model=os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-transcribe"),
        notes_model=os.getenv("OPENAI_NOTES_MODEL", "gpt-5.6"),
        live_transcription_model=os.getenv("OPENAI_LIVE_TRANSCRIPTION_MODEL", "gpt-live-transcribe"),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/"),
        max_upload_mb=max_mb,
        timeout_seconds=timeout,
    )
