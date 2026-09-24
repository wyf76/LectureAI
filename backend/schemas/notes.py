from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

from config import MAX_TRANSCRIPT_CHARS


class LectureMarkerMetadata(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    type: Literal["important", "confusing", "review", "note"]
    timestampSeconds: float = Field(ge=0, le=604800, allow_inf_nan=False, strict=True)
    note: str | None = Field(default=None, max_length=1000, strict=True)


class NotesRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    transcript: str = Field(min_length=1, max_length=MAX_TRANSCRIPT_CHARS)
    markers: list[LectureMarkerMetadata] = Field(default_factory=list, max_length=500)


class NotesResponse(BaseModel):
    notes: str


class TranscriptionResponse(BaseModel):
    transcript: str
