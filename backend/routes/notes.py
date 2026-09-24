from fastapi import APIRouter

from config import get_settings
from schemas.notes import NotesRequest, NotesResponse
from services.notes_service import generate_notes

router = APIRouter()


@router.post("/notes", response_model=NotesResponse)
async def notes(body: NotesRequest) -> NotesResponse:
    return NotesResponse(notes=await generate_notes(body.transcript, get_settings(), body.markers))
