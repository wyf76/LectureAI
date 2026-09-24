from typing import Literal

from pydantic import BaseModel, ConfigDict

TranscriptionLanguage = Literal["auto", "en", "zh", "es", "fr", "de", "ja", "ko", "pt", "hi", "ar"]


class TranscriptionOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Existing API clients that omit a language retain automatic detection.
    language: TranscriptionLanguage = "auto"

    @property
    def language_hint(self) -> str | None:
        return None if self.language == "auto" else self.language
