from typing import BinaryIO

from config import Settings
from services.openai_client import ServiceError, create_client
from services.transcription_language import language_options


async def transcribe_audio(audio: BinaryIO, filename: str, settings: Settings, language: str | None = None) -> str:
    """One validated file today; future splitting/reassembly belongs in this layer."""
    async with create_client(settings) as client:
        result = await client.audio.transcriptions.create(
            model=settings.transcription_model,
            file=(filename, audio),
            response_format="json",
            **language_options(settings.transcription_model, language),
        )
    transcript = result.text.strip() if isinstance(result.text, str) else ""
    if not transcript:
        raise ServiceError("No speech was found. Try a recording with clear, audible speech.")
    return transcript
