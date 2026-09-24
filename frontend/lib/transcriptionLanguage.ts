export const TRANSCRIPTION_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "auto", label: "Auto-detect / mixed languages" },
  { value: "zh", label: "Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
] as const;

export type TranscriptionLanguage = typeof TRANSCRIPTION_LANGUAGES[number]["value"];
