"use client";

import { useState } from "react";
import type { LectureMarkersController } from "@/hooks/useLectureMarkers";
import { MARKER_LABELS, MARKER_TYPES, MAX_MARKER_NOTE_LENGTH, MARKER_PLAYBACK_LEAD_IN_SECONDS, formatTimestamp, type LectureMarker, type LectureMarkerType } from "@/lib/lectureMarkers";
import LectureMarkerToolbar from "./LectureMarkerToolbar";
import LectureMarkerList from "./LectureMarkerList";
import LectureTimeline from "./LectureTimeline";

type Editor = { id?: string; type: LectureMarkerType; timestampSeconds: number; note?: string };
type Props = { controller: LectureMarkersController; recording: boolean; paused: boolean; stopped: boolean; busy: boolean;
  getTimestamp: () => number; duration: number; canSeek: boolean; onSeek: (time: number) => void };

export default function LectureMarkers({ controller, recording, paused, stopped, busy, getTimestamp, duration, canSeek, onSeek }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  function mark(type: LectureMarkerType) {
    if (!recording) return;
    const timestampSeconds = getTimestamp();
    if (type === "note") { if (!editor) setEditor({ type, timestampSeconds }); }
    else controller.add(type, timestampSeconds);
  }
  function edit(marker: LectureMarker) {
    if (editor && !window.confirm("Replace your unsaved marker note?")) return;
    setEditor(marker);
  }
  return <section className="lecture-markers" aria-labelledby="lecture-markers-title">
    {(recording || paused) && <LectureMarkerToolbar enabled={recording} onMark={mark} />}
    <div className="marker-panel-heading"><h3 id="lecture-markers-title">Lecture Markers</h3><span>{controller.markers.length}</span></div>
    {controller.recovered && <p className="marker-recovery" role="status">Recovered markers from a previous lecture. Its audio was not saved, so playback is unavailable. These markers will not be attached to new recordings or uploads.</p>}
    {controller.storageWarning && <p className="marker-help" role="status">{controller.storageWarning}</p>}
    {stopped && controller.markers.length > 0 && <div className="marker-summary" aria-label="Marker summary">{MARKER_TYPES.map((type) => <span key={type}><span aria-hidden="true">{MARKER_LABELS[type].icon}</span> {MARKER_LABELS[type].label}: {controller.markers.filter((item) => item.type === type).length}</span>)}</div>}
    {canSeek && <><LectureTimeline markers={controller.markers} duration={duration} onSeek={onSeek} /><p className="marker-help">Click a timestamp or timeline marker to play from {MARKER_PLAYBACK_LEAD_IN_SECONDS} seconds before it.</p></>}
    {editor && <MarkerEditor key={`${editor.id ?? "new"}:${editor.timestampSeconds}`} editor={editor} disabled={busy} onCancel={() => setEditor(null)} onSave={(text) => {
      const saved = editor.id ? controller.update(editor.id, text) : controller.add(editor.type, editor.timestampSeconds, text);
      if (saved) setEditor(null);
    }} />}
    <LectureMarkerList markers={controller.markers} canSeek={canSeek} onSeek={onSeek} disabled={busy} onEdit={edit} onDelete={(id) => {
      controller.remove(id); if (editor?.id === id) setEditor(null);
    }} />
    {!controller.markers.length && <p className="marker-help">Mark a moment to find it again after the lecture.</p>}
    <p className="marker-feedback" role="status" aria-live="polite">{controller.feedback}</p>
    <p className="marker-help">Markers stay in this browser until you include them in Generate Notes.</p>
  </section>;
}

function MarkerEditor({ editor, disabled, onSave, onCancel }: { editor: Editor; disabled: boolean; onSave: (note: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(editor.note ?? "");
  return <form className="marker-editor" onSubmit={(event) => { event.preventDefault(); onSave(text); }}>
    <label htmlFor="marker-note-input">{editor.id ? "Edit marker note" : "Add note"} · {formatTimestamp(editor.timestampSeconds)}</label>
    <textarea id="marker-note-input" autoFocus maxLength={MAX_MARKER_NOTE_LENGTH} rows={3} value={text} disabled={disabled} onChange={(event) => setText(event.target.value)} />
    <span className="marker-help">{text.length} / {MAX_MARKER_NOTE_LENGTH} characters · Timestamp stays fixed while you type</span>
    <div className="marker-editor-actions"><button type="submit" className="button button-primary" disabled={disabled || (editor.type === "note" && !text.trim())}>Save</button>
      <button type="button" className="button button-secondary" disabled={disabled} onClick={onCancel}>Cancel</button></div>
  </form>;
}
