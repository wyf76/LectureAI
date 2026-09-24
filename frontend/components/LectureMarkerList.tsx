import { MARKER_LABELS, formatTimestamp, type LectureMarker } from "@/lib/lectureMarkers";

type Props = { markers: LectureMarker[]; canSeek: boolean; onSeek: (seconds: number) => void; onEdit: (marker: LectureMarker) => void; onDelete: (id: string) => void; disabled: boolean };

export default function LectureMarkerList({ markers, canSeek, onSeek, onEdit, onDelete, disabled }: Props) {
  return <ol className="marker-list" aria-label="Lecture markers in time order">{[...markers].sort((a, b) => a.timestampSeconds - b.timestampSeconds).map((marker) => {
    const label = MARKER_LABELS[marker.type];
    return <li key={marker.id} className={`marker-item marker-${marker.type}`}>
      <div className="marker-item-heading"><span><span aria-hidden="true">{label.icon}</span> {label.label}</span>
        {canSeek ? <button className="marker-time" onClick={() => onSeek(marker.timestampSeconds)} aria-label={`Play ${label.label} marker at ${formatTimestamp(marker.timestampSeconds)}`}>{formatTimestamp(marker.timestampSeconds)}</button>
          : <span className="marker-time-static">{formatTimestamp(marker.timestampSeconds)}</span>}
      </div>
      {marker.note && <p className="marker-note">{marker.note}</p>}
      <div className="marker-item-actions">
        <button disabled={disabled} onClick={() => onEdit(marker)} aria-label={`Edit ${label.label} marker at ${formatTimestamp(marker.timestampSeconds)}`}>Edit</button>
        <button disabled={disabled} onClick={() => onDelete(marker.id)} aria-label={`Delete ${label.label} marker at ${formatTimestamp(marker.timestampSeconds)}`}>Delete</button>
      </div>
    </li>;
  })}</ol>;
}
