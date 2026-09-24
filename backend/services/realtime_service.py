import time

from pydantic import BaseModel, Field

from config import Settings
from services.openai_client import ServiceError, create_client
from services.transcription_language import language_options


class RealtimeCredential(BaseModel):
    # Avoid accidental token exposure in repr/logging.
    value: str = Field(repr=False)
    expires_at: int


async def create_transcription_session(settings: Settings, language: str | None = None) -> RealtimeCredential:
    async with create_client(settings) as client:
        result = await client.realtime.client_secrets.create(
            expires_after={"anchor": "created_at", "seconds": 60},
            session={
                "type": "transcription",
                "audio": {"input": {
                    "transcription": {"model": settings.live_transcription_model,
                                      **language_options(settings.live_transcription_model, language)},
                    # gpt-live-transcribe requires client-managed audio commits.
                    "turn_detection": None,
                }},
            },
            timeout=15,
        )
    # Return an explicit allowlist, never the complete upstream response/config.
    if (not isinstance(result.value, str) or not result.value.startswith("ek_")
            or result.value == settings.api_key or not isinstance(result.expires_at, (int, float))
            or result.expires_at <= time.time()):
        raise ServiceError("Unable to create a temporary live-transcription session. You can still record and finalize afterward.")
    return RealtimeCredential(value=result.value, expires_at=result.expires_at)
