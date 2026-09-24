from fastapi import APIRouter, HTTPException, Request, Response

from config import get_settings
from schemas.transcription import TranscriptionOptions
from services.realtime_service import RealtimeCredential, create_transcription_session

router = APIRouter()


@router.post("/realtime/session", response_model=RealtimeCredential)
async def realtime_session(request: Request, response: Response, body: TranscriptionOptions | None = None) -> RealtimeCredential:
    settings = get_settings()
    # CORS alone doesn't stop a cross-site POST from causing a credential mint.
    origin = request.headers.get("origin")
    if origin and origin != settings.frontend_url:
        raise HTTPException(403, "This origin is not allowed to create a live-transcription session.")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return await create_transcription_session(settings, body.language_hint if body else None)
