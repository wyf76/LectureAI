import type { MarkerMetadata } from "./lectureMarkers";
import type { TranscriptionLanguage } from "./transcriptionLanguage";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type AppConfig = {
  max_upload_bytes: number;
  supported_extensions: string[];
  max_transcript_chars: number;
};

export const DEFAULT_CONFIG: AppConfig = {
  max_upload_bytes: 25_000_000,
  supported_extensions: [".mp3", ".m4a", ".wav", ".mp4", ".mpeg", ".mpga", ".webm"],
  max_transcript_chars: 120_000,
};

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // Allow room for the backend's upstream timeout plus upload time.
      signal: init?.signal ?? AbortSignal.timeout(600_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("The request timed out. Try a smaller recording or try again later.");
    }
    throw new Error("Unable to reach the backend. Make sure it is running and check your connection.");
  }
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new Error("The backend returned an unreadable response. Please try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The backend returned an unexpected response. Please try again.");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.detail === "string" ? body.detail : "Unable to process this lecture. Please try again.");
  }
  return body;
}

function readText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The backend returned an empty or unexpected result. Please try again.");
  }
  return value;
}

export async function getConfig(): Promise<AppConfig> {
  const data = await request("/api/config");
  if (typeof data.max_upload_bytes !== "number" || data.max_upload_bytes <= 0 ||
      !Array.isArray(data.supported_extensions) || !data.supported_extensions.every((item) => typeof item === "string") ||
      typeof data.max_transcript_chars !== "number" || data.max_transcript_chars <= 0) {
    throw new Error("Unable to read the backend upload settings. Please refresh to try again.");
  }
  return data as AppConfig;
}

export async function transcribeAudio(file: File, language: TranscriptionLanguage = "en"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  return readText(await request("/api/transcribe", { method: "POST", body: form }), "transcript");
}

export async function generateNotes(transcript: string, markers?: MarkerMetadata[]): Promise<string> {
  return readText(await request("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, ...(markers?.length ? { markers } : {}) }),
  }), "notes");
}

export async function createLiveSession(signal: AbortSignal, language: TranscriptionLanguage = "en"): Promise<{ value: string; expires_at: number }> {
  const data = await request("/api/realtime/session", { method: "POST", signal, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
  if (typeof data.value !== "string" || !data.value.startsWith("ek_") ||
      typeof data.expires_at !== "number" || data.expires_at * 1000 <= Date.now()) {
    throw new Error("Live transcription could not get a valid temporary session. You can still record and finalize afterward.");
  }
  return { value: data.value, expires_at: data.expires_at };
}
