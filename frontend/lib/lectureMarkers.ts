import { formatRecordingTime } from "./recording";

export const MARKER_TYPES = ["important", "confusing", "review", "note"] as const;
export type LectureMarkerType = typeof MARKER_TYPES[number];
export type LectureMarker = {
  id: string; type: LectureMarkerType; timestampSeconds: number; createdAt: string; note?: string;
};
export type MarkerMetadata = Pick<LectureMarker, "type" | "timestampSeconds" | "note">;
export type MarkerSession = { version: 1; lectureId: string; markers: LectureMarker[] };
export const MARKER_STORAGE_KEY = "lectureai:current-markers:v1";
export const MAX_MARKERS = 500;
export const MAX_MARKER_NOTE_LENGTH = 1000;
export const MAX_MARKER_SECONDS = 604_800;
export const MARKER_PLAYBACK_LEAD_IN_SECONDS = 5;
export const MARKER_LABELS: Record<LectureMarkerType, { icon: string; label: string }> = {
  important: { icon: "⭐", label: "Important" }, confusing: { icon: "❓", label: "Confusing" },
  review: { icon: "📌", label: "Review Later" }, note: { icon: "✍️", label: "Note" },
};
export const formatTimestamp = (seconds: number) => formatRecordingTime(seconds * 1000);

export function markerId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function playbackDuration(metadata: number, elapsed: number): number {
  return Number.isFinite(metadata) && metadata > 0 ? metadata : Math.max(0, elapsed);
}

export function markerSeekTime(timestamp: number, duration: number, leadIn = MARKER_PLAYBACK_LEAD_IN_SECONDS): number {
  if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0) return 0;
  // Stay just inside the playable interval when metadata is shorter than the timer.
  return Math.min(Math.max(0, duration - 0.05), Math.max(0, timestamp - leadIn));
}

export function parseMarkerSession(raw: string): MarkerSession | null {
  if (raw.length > 650_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.lectureId !== "string" || !value.lectureId || value.lectureId.length > 100 ||
        !Array.isArray(value.markers) || value.markers.length > MAX_MARKERS) return null;
    const ids = new Set<string>();
    const markers: LectureMarker[] = [];
    for (const item of value.markers) {
      if (!item || typeof item.id !== "string" || !item.id || item.id.length > 100 || ids.has(item.id) ||
          !MARKER_TYPES.includes(item.type) || typeof item.timestampSeconds !== "number" || !Number.isFinite(item.timestampSeconds) ||
          item.timestampSeconds < 0 || item.timestampSeconds > MAX_MARKER_SECONDS || typeof item.createdAt !== "string" ||
          item.createdAt.length > 40 || !Number.isFinite(Date.parse(item.createdAt)) ||
          (item.note !== undefined && (typeof item.note !== "string" || item.note.length > MAX_MARKER_NOTE_LENGTH))) return null;
      ids.add(item.id);
      markers.push({ id: item.id, type: item.type, timestampSeconds: item.timestampSeconds, createdAt: item.createdAt,
        ...(item.note?.trim() ? { note: item.note.trim() } : {}) });
    }
    return { version: 1, lectureId: value.lectureId, markers };
  } catch { return null; }
}

export function markerMetadata(markers: LectureMarker[]): MarkerMetadata[] {
  return [...markers].sort((a, b) => a.timestampSeconds - b.timestampSeconds)
    .map(({ type, timestampSeconds, note }) => ({ type, timestampSeconds, ...(note ? { note } : {}) }));
}

export function isMarkerShortcut(event: KeyboardEvent): LectureMarkerType | null {
  const target = event.target;
  if (event.repeat || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return null;
  return ({ Digit1: "important", Digit2: "confusing", Digit3: "review", Digit4: "note" } as const)[event.code as "Digit1"] ?? null;
}
