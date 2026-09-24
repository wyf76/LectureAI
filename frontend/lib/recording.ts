/** Only containers accepted by the existing transcription endpoint. */
export function recordingExtension(mimeType: string): string | null {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (type === "audio/webm") return ".webm";
  if (type === "audio/mp4" || type === "audio/x-m4a") return ".m4a";
  if (type === "audio/mpeg") return ".mp3";
  if (type === "audio/wav" || type === "audio/x-wav") return ".wav";
  return null;
}

export function preferredRecordingType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type));
}

export function formatRecordingTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60];
  if (seconds >= 3600) parts.unshift(Math.floor(seconds / 3600));
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function recordingSupportError(): string | null {
  if (!window.isSecureContext) return "Microphone recording requires HTTPS or localhost. You can still upload an audio file.";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "Your browser does not support microphone recording. You can still upload an audio file.";
  }
  return null;
}

export function microphoneError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was denied. Allow microphone access in your browser settings and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was detected. You can upload a lecture recording instead.";
  if (name === "NotReadableError" || name === "AbortError") return "Your microphone is unavailable or in use by another application. Close other recording apps and try again.";
  if (name === "NotSupportedError") return "Your browser could not initialize a supported recording format. Try another browser or upload an audio file.";
  return "Unable to start recording. Check your microphone and try again, or upload an audio file.";
}
