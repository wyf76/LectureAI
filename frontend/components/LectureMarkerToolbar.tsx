"use client";

import { useEffect } from "react";
import { isMarkerShortcut, MARKER_LABELS, MARKER_TYPES, type LectureMarkerType } from "@/lib/lectureMarkers";

export default function LectureMarkerToolbar({ enabled, onMark }: { enabled: boolean; onMark: (type: LectureMarkerType) => void }) {
  useEffect(() => {
    if (!enabled) return;
    const handleKey = (event: KeyboardEvent) => {
      const type = isMarkerShortcut(event);
      if (type) { event.preventDefault(); onMark(type); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled, onMark]);
  return <div className="marker-toolbar" role="group" aria-label="Mark this moment">
    <h3>Mark this moment</h3>
    <div className="marker-actions">{MARKER_TYPES.map((type, index) => <button key={type} className={`button button-secondary marker-${type}`} disabled={!enabled}
      aria-keyshortcuts={`Alt+${index + 1}`} onClick={() => onMark(type)}>
      <span aria-hidden="true">{MARKER_LABELS[type].icon}</span>{type === "note" ? "Add Note" : MARKER_LABELS[type].label}
    </button>)}</div>
    <p className="marker-help">Alt / ⌥ + 1 Important · 2 Confusing · 3 Review · 4 Note</p>
    {!enabled && <p className="marker-help">Resume recording to add new markers.</p>}
  </div>;
}
