"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useLiveTranscription from "@/hooks/useLiveTranscription";
import { formatRecordingTime } from "@/lib/recording";
import LoadingState from "./LoadingState";
import LiveTranscript from "./LiveTranscript";
import LectureMarkers from "./LectureMarkers";
import type { LectureMarkersController } from "@/hooks/useLectureMarkers";
import { markerSeekTime, playbackDuration } from "@/lib/lectureMarkers";
import type { TranscriptionLanguage } from "@/lib/transcriptionLanguage";

type Props = {
  maxBytes: number;
  busy: boolean;
  transcribing: boolean;
  error: string | null;
  onActiveChange: (active: boolean) => void;
  onResetError: () => void;
  onTranscribe: (file: File) => void;
  onStart: () => void;
  finalizedFile: File | null;
  markers: LectureMarkersController;
  language: TranscriptionLanguage;
};

export default function AudioRecorder({ maxBytes, busy, transcribing, error, onActiveChange, onResetError, onTranscribe, onStart, finalizedFile, markers, language }: Props) {
  const live = useLiveTranscription();
  const recording = useAudioRecorder(maxBytes, { start: (stream) => { onStart(); live.start(stream, language); }, pause: live.pause, resume: live.resume, stop: live.stop });
  const [previewError, setPreviewError] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [metadataDuration, setMetadataDuration] = useState(0);
  const duration = playbackDuration(metadataDuration, recording.elapsedMs / 1000);
  useEffect(() => { onActiveChange(recording.active); }, [recording.active, onActiveChange]);
  const { status, file, previewUrl } = recording;
  const tooLarge = !!file && file.size > maxBytes;
  const statusText = { idle: "Ready when you are", "requesting-permission": "Waiting for microphone permission", recording: "Recording", paused: "Paused", stopping: "Finishing recording...", stopped: "Recording Complete" }[status];

  function mayClear(action: string) {
    return !markers.markers.length || window.confirm(`${action}? This will also remove ${markers.markers.length} lecture markers. They belong to this recording.`);
  }
  function reset(action: string) {
    if (!mayClear(action)) return;
    recording.discard(); live.reset(); markers.clear(); setMetadataDuration(0); pendingSeek.current = null; setPreviewError(false); onResetError();
  }
  function start() {
    if (!mayClear("Start a new recording")) return;
    live.reset(); setMetadataDuration(0); pendingSeek.current = null; setPreviewError(false); onResetError(); void recording.start();
  }
  function seek(seconds: number) {
    const element = audio.current;
    if (!element || !file) return;
    if (element.readyState < 1) { pendingSeek.current = seconds; return; }
    try {
      element.currentTime = markerSeekTime(seconds, playbackDuration(element.duration, recording.elapsedMs / 1000));
      void element.play().catch(() => { /* Seek still works; native controls let the student press Play. */ });
    } catch { setPreviewError(true); }
  }
  function audioMetadata() {
    if (audio.current) setMetadataDuration(Number.isFinite(audio.current.duration) ? audio.current.duration : 0);
    if (pendingSeek.current !== null && audio.current && audio.current.readyState >= 1) {
      const target = pendingSeek.current; pendingSeek.current = null; seek(target);
    }
  }

  return <section className="recorder-content" aria-labelledby="recorder-title" aria-busy={transcribing}>
    <div className="card-heading"><h2 id="recorder-title">Record Lecture</h2><span className="section-icon"><Mic size={21} aria-hidden="true" /></span></div>
    <p className="section-description">Follow along with live text, then finalize the full recording.</p>
    <div className="recording-panel">
      <div className={`recording-status ${status === "recording" ? "is-recording" : ""}`} role="status">
        <span className="recording-dot" aria-hidden="true" />{statusText}
      </div>
      <div className="recording-timer" role="timer" aria-label="Elapsed recording time" aria-live="off">{formatRecordingTime(recording.elapsedMs)}</div>
      <p className="recording-hint">{status === "paused" ? "Recording and live audio are paused. Your transcript stays here." : recording.active ? "Keep this tab open. Stop recording before switching modes." : "The full recording stays available for final transcription."}</p>
      <div className="recording-controls">
        {status === "idle" && <button className="button button-primary" disabled={busy || !markers.ready || recording.checkingSupport || !!recording.supportError} onClick={start}><Mic size={16} aria-hidden="true" />Start Recording</button>}
        {status === "requesting-permission" && <><LoadingState text="Allow microphone access in your browser" /><button className="button button-secondary" onClick={recording.cancelPermission}>Cancel</button></>}
        {status === "recording" && <button className="button button-secondary" onClick={recording.pause}><Pause size={16} aria-hidden="true" />Pause</button>}
        {status === "paused" && <button className="button button-secondary" onClick={recording.resume}><Play size={16} aria-hidden="true" />Resume</button>}
        {(status === "recording" || status === "paused") && <button className="button button-primary" onClick={recording.stop}><Square size={14} aria-hidden="true" />Stop</button>}
        {status === "stopping" && <LoadingState text="Preparing your recording..." />}
      </div>
      {previewUrl && file && <div className="recording-preview">
        <audio ref={audio} key={previewUrl} controls preload="metadata" src={previewUrl} aria-label="Recording preview" onLoadedMetadata={audioMetadata} onDurationChange={audioMetadata} onError={() => setPreviewError(true)} />
        <p className="recorded-file">{file.name}<br />{(file.size / 1_000_000).toFixed(2)} MB · Duration: {formatRecordingTime(duration * 1000)}</p>
        <div className="recording-controls">
          <button className="button button-secondary" disabled={busy} onClick={() => reset("Discard this recording")}><Trash2 size={15} aria-hidden="true" />Discard</button>
          <button className="button button-secondary" disabled={busy} onClick={() => reset("Record again")}><RotateCcw size={15} aria-hidden="true" />Record Again</button>
        </div>
      </div>}
    </div>
    {live.status !== "idle" && <LiveTranscript status={live.status} segments={live.segments} warning={live.warning} active={status === "recording" || status === "paused"} finalized={!!file && finalizedFile === file} />}
    {(status === "recording" || status === "paused" || file || markers.markers.length > 0) && <LectureMarkers key={markers.lectureId ?? "none"} controller={markers}
      recording={status === "recording"} paused={status === "paused"} stopped={!recording.active} busy={busy} getTimestamp={recording.getElapsedSeconds}
      duration={duration} canSeek={!!file && !!previewUrl && !previewError && !markers.recovered} onSeek={seek} />}
    {status === "idle" && markers.markers.length > 0 && <button className="button button-secondary" onClick={() => reset("Discard recovered markers")}>Discard Markers</button>}
    {recording.supportError && <p className="error-message" role="alert">{recording.supportError}</p>}
    {recording.error && <p className="error-message" role="alert">{recording.error}</p>}
    {previewError && <p className="error-message" role="alert">Your browser could not play this preview. Try recording again or use another supported browser.</p>}
    {tooLarge && <p className="error-message" role="alert">This recording exceeds the {maxBytes / 1_000_000} MB upload limit. Record a shorter lecture to transcribe it.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {file && <button className="button button-primary transcribe-button" disabled={busy || tooLarge} onClick={() => onTranscribe(file)}>
      {transcribing ? <LoadingState text="Finalizing transcript..." /> : <><AudioLines size={18} aria-hidden="true" />Finalize Transcript</>}
    </button>}
    <p className="upload-footnote">Up to {maxBytes / 1_000_000} MB. Longer recordings depend on available browser memory.</p>
    <p className="recording-permission">Live transcription sends microphone audio to OpenAI while recording. The full recording remains available for final transcription after the lecture.</p>
    <p className="recording-permission">Make sure you have permission before recording a lecture or conversation.</p>
  </section>;
}
