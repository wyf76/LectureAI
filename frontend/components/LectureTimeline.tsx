import { MARKER_LABELS, formatTimestamp, type LectureMarker } from "@/lib/lectureMarkers";

export default function LectureTimeline({ markers, duration, onSeek }: { markers: LectureMarker[]; duration: number; onSeek: (time: number) => void }) {
  if (!(duration > 0) || !markers.length) return null;
  return <div className="lecture-timeline" role="group" aria-label="Lecture marker timeline">
    <div className="timeline-track">{[...markers].sort((a, b) => a.timestampSeconds - b.timestampSeconds).map((marker, index) => {
      const position = Math.min(100, Math.max(0, marker.timestampSeconds / duration * 100));
      const label = `${MARKER_LABELS[marker.type].label} · ${formatTimestamp(marker.timestampSeconds)}${marker.note ? ` · ${marker.note}` : ""}`;
      return <button key={marker.id} className={`timeline-point marker-${marker.type}`} style={{ left: `${position}%`, top: `${index % 3 * 23}px` }}
        aria-label={label} onClick={() => onSeek(marker.timestampSeconds)}>
        <span aria-hidden="true">{MARKER_LABELS[marker.type].icon}</span>
        <span className={`timeline-tooltip ${position > 50 ? "align-right" : ""}`} aria-hidden="true">{label}</span>
      </button>;
    })}</div>
    <div className="timeline-times"><span>00:00</span><span>{formatTimestamp(duration)}</span></div>
  </div>;
}
