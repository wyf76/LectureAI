import re
from pathlib import PurePosixPath
from typing import get_args

from fastapi import APIRouter, HTTPException, Request
from starlette.datastructures import UploadFile
from pydantic import ValidationError

from config import SUPPORTED_EXTENSIONS, get_settings
from schemas.notes import TranscriptionResponse
from schemas.transcription import TranscriptionLanguage, TranscriptionOptions
from services.transcription_service import transcribe_audio

router = APIRouter()


@router.post(
    "/transcribe",
    response_model=TranscriptionResponse,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"multipart/form-data": {"schema": {
                "type": "object", "required": ["file"],
                "properties": {"file": {"type": "string", "format": "binary"},
                               "language": {"type": "string", "enum": list(get_args(TranscriptionLanguage)), "default": "auto"}},
            }}},
        },
    },
)
async def transcribe(request: Request) -> TranscriptionResponse:
    settings = get_settings()
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise HTTPException(400, "Choose an audio file to transcribe.")
    # The context manager closes every spooled upload, even on an API failure.
    async with request.form(max_files=1, max_fields=1) as form:
        file = form.get("file")
        if not isinstance(file, UploadFile) or not file.filename:
            raise HTTPException(400, "Choose an audio file to transcribe.")
        try:
            options = TranscriptionOptions(language=form.get("language", "auto"))
        except ValidationError:
            raise HTTPException(422, "Choose a supported transcription language or Auto-detect.") from None
        name = PurePosixPath(file.filename.replace("\\", "/")).name
        extension = PurePosixPath(name).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(415, "Unsupported file type. Choose MP3, M4A, WAV, MP4, MPEG, MPGA, or WebM.")
        mime = (file.content_type or "").lower().split(";")[0]
        if mime and mime != "application/octet-stream" and not mime.startswith(("audio/", "video/")):
            raise HTTPException(415, "This file does not have an audio or video content type.")
        if not file.size:
            raise HTTPException(400, "The selected file is empty. Choose a different recording.")
        if file.size > settings.max_upload_bytes:
            raise HTTPException(413, f"The recording exceeds the {settings.max_upload_bytes / 1_000_000:g} MB upload limit.")
        # No user-controlled path is ever opened. The SDK receives only a safe basename.
        safe_stem = re.sub(r"[^A-Za-z0-9_-]", "_", PurePosixPath(name).stem)[:80] or "lecture"
        await file.seek(0)
        transcript = await transcribe_audio(file.file, safe_stem + extension, settings, options.language_hint)
        return TranscriptionResponse(transcript=transcript)
