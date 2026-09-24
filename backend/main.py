import logging
import os

import openai
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from config import MAX_TRANSCRIPT_CHARS, SUPPORTED_EXTENSIONS, get_settings
from middleware import RequestSizeLimitMiddleware
from routes import notes, realtime, transcription
from services.openai_client import ServiceError

logger = logging.getLogger("lectureai")
settings = get_settings()
app = FastAPI(title="LectureAI", version="0.1.0")
app.add_middleware(RequestSizeLimitMiddleware, upload_limit=settings.max_upload_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(transcription.router, prefix="/api", tags=["Transcription"])
app.include_router(notes.router, prefix="/api", tags=["Notes"])
app.include_router(realtime.router, prefix="/api", tags=["Live transcription"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config")
async def public_config() -> dict:
    # Explicit allowlist: never serialize the Settings object into a response.
    return {
        "max_upload_bytes": settings.max_upload_bytes,
        "supported_extensions": SUPPORTED_EXTENSIONS,
        "max_transcript_chars": MAX_TRANSCRIPT_CHARS,
    }


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    if request.url.path == "/api/realtime/session":
        return JSONResponse(status_code=422, content={"detail": "Choose a supported transcription language or Auto-detect."})
    if any("markers" in error["loc"] for error in exc.errors()):
        return JSONResponse(status_code=422, content={"detail": "Provide at most 500 markers with a known type, a finite timestamp from 0 to 604800 seconds, and notes of at most 1000 characters."})
    return JSONResponse(status_code=422, content={"detail": f"Provide a non-empty transcript of at most {MAX_TRANSCRIPT_CHARS:,} characters."})


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
    # Multipart parser messages can include user-provided field names.
    message = exc.detail if exc.status_code != 400 else "Unable to read this upload. Choose a non-empty audio file and try again."
    return JSONResponse(status_code=exc.status_code, content={"detail": message})


@app.exception_handler(ServiceError)
async def service_error(request: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(openai.OpenAIError)
async def openai_error(request: Request, exc: openai.OpenAIError) -> JSONResponse:
    # Only class/status metadata; exception bodies may contain sensitive content.
    logger.warning("OpenAI request failed: type=%s status=%s", type(exc).__name__, getattr(exc, "status_code", None))
    status, message = 502, "The AI service could not process this lecture. Please try again."
    if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError, openai.NotFoundError)):
        status, message = 503, "OpenAI configuration needs attention. Check the backend API key, model name, and model access."
    elif isinstance(exc, openai.RateLimitError):
        status, message = 429, "OpenAI is at its usage limit. Check API billing or try again later."
    elif isinstance(exc, openai.APITimeoutError):
        status, message = 504, "Processing took too long. Try again or use a shorter recording."
    elif isinstance(exc, openai.APIConnectionError):
        status, message = 502, "The backend could not reach OpenAI. Check its internet connection and try again."
    elif isinstance(exc, openai.BadRequestError):
        message = "OpenAI could not process this input. Check the recording or transcript and configured model."
    return JSONResponse(status_code=status, content={"detail": message})


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unexpected request failure: type=%s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong while processing the lecture. Please try again."})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=os.getenv("BACKEND_HOST", "127.0.0.1"), port=int(os.getenv("BACKEND_PORT", "8000")))
