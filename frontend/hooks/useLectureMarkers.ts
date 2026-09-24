"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MARKER_LABELS, MARKER_STORAGE_KEY, MAX_MARKERS, MAX_MARKER_NOTE_LENGTH, MAX_MARKER_SECONDS, formatTimestamp,
  markerId, parseMarkerSession, type LectureMarkerType, type MarkerSession } from "@/lib/lectureMarkers";

export default function useLectureMarkers() {
  const [session, setSession] = useState<MarkerSession | null>(null);
  const current = useRef<MarkerSession | null>(null);
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const lastAdded = useRef<Partial<Record<LectureMarkerType, number>>>({});

  const persist = useCallback((next: MarkerSession | null) => {
    try {
      if (next?.markers.length) sessionStorage.setItem(MARKER_STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(MARKER_STORAGE_KEY);
      setStorageWarning(null);
    } catch { setStorageWarning("Markers are available on this page, but this browser could not save recovery data. Keep this tab open."); }
  }, []);
  const commit = useCallback((next: MarkerSession | null) => {
    current.current = next; setSession(next); persist(next);
  }, [persist]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MARKER_STORAGE_KEY);
      if (raw) {
        const restored = parseMarkerSession(raw);
        if (restored?.markers.length) {
          current.current = restored; setSession(restored); setRecovered(true); persist(restored);
        } else { sessionStorage.removeItem(MARKER_STORAGE_KEY); setStorageWarning("Saved marker data could not be recovered."); }
      }
    } catch { setStorageWarning("Marker recovery is unavailable in this browser. Keep this tab open to retain your markers."); }
    setReady(true);
  }, [persist]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(""), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const begin = useCallback(() => {
    lastAdded.current = {}; setRecovered(false); setFeedback("");
    commit({ version: 1, lectureId: markerId(), markers: [] });
  }, [commit]);
  const clear = useCallback(() => {
    lastAdded.current = {}; setRecovered(false); setFeedback(""); commit(null);
  }, [commit]);
  const add = useCallback((type: LectureMarkerType, timestampSeconds: number, note?: string) => {
    const active = current.current;
    if (!active || !Number.isFinite(timestampSeconds) || timestampSeconds < 0 || timestampSeconds > MAX_MARKER_SECONDS) return false;
    if (active.markers.length >= MAX_MARKERS) { setFeedback(`This lecture has reached the ${MAX_MARKERS}-marker limit.`); return false; }
    const text = note?.trim();
    if ((text?.length ?? 0) > MAX_MARKER_NOTE_LENGTH || (type === "note" && !text)) return false;
    const now = performance.now();
    if (lastAdded.current[type] !== undefined && now - lastAdded.current[type]! < 1000) return false;
    lastAdded.current[type] = now;
    commit({ ...active, markers: [...active.markers, { id: markerId(), type, timestampSeconds, createdAt: new Date().toISOString(), ...(text ? { note: text } : {}) }] });
    setFeedback(`${MARKER_LABELS[type].label} marker added at ${formatTimestamp(timestampSeconds)}.`);
    return true;
  }, [commit]);
  const update = useCallback((id: string, note: string) => {
    const active = current.current;
    const text = note.trim();
    const item = active?.markers.find((marker) => marker.id === id);
    if (!active || !item || text.length > MAX_MARKER_NOTE_LENGTH || (item.type === "note" && !text)) return false;
    commit({ ...active, markers: active.markers.map((marker) => marker.id === id ? { ...marker, note: text || undefined } : marker) });
    setFeedback("Marker updated."); return true;
  }, [commit]);
  const remove = useCallback((id: string) => {
    const active = current.current;
    if (active) commit({ ...active, markers: active.markers.filter((marker) => marker.id !== id) });
    setFeedback("Marker deleted.");
  }, [commit]);
  return { markers: session?.markers ?? [], lectureId: session?.lectureId ?? null, ready, recovered, storageWarning, feedback, begin, clear, add, update, remove };
}

export type LectureMarkersController = ReturnType<typeof useLectureMarkers>;
