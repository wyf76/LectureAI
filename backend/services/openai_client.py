"""Short-lived asynchronous clients: no key is required just to start the app."""

from openai import AsyncOpenAI

from config import Settings


class ServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def create_client(settings: Settings) -> AsyncOpenAI:
    if not settings.api_key or settings.api_key == "your_openai_api_key_here":
        raise ServiceError(
            "OpenAI is not configured. Add OPENAI_API_KEY to the backend's root .env file and restart the backend.",
            503,
        )
    return AsyncOpenAI(
        api_key=settings.api_key,
        timeout=settings.timeout_seconds,
        max_retries=0,  # Explicit retries in the UI avoid hidden duplicate costs.
    )
