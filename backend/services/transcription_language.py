def language_options(model: str, language: str | None) -> dict:
    if not language:
        return {}
    # Current transcription models use plural hints; legacy models use singular.
    field = "languages" if model.startswith(("gpt-transcribe", "gpt-live-transcribe")) else "language"
    return {field: [language] if field == "languages" else language}
