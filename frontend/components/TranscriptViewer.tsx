import { AlignLeft, Sparkles } from "lucide-react";
import CopyButton from "./CopyButton";
import DownloadTranscriptButton from "./DownloadTranscriptButton";
import LoadingState from "./LoadingState";

type Props = {
  transcript: string;
  generating: boolean;
  busy: boolean;
  hasNotes: boolean;
  maxTranscriptChars: number;
  error: string | null;
  onGenerate: () => void;
  markerCount: number;
  includeMarkers: boolean;
  onIncludeMarkers: (include: boolean) => void;
};

export default function TranscriptViewer({ transcript, generating, busy, hasNotes, maxTranscriptChars, error, onGenerate, markerCount, includeMarkers, onIncludeMarkers }: Props) {
  const tooLong = transcript.length > maxTranscriptChars;
  return <section className="card result-card" aria-labelledby="transcript-title">
    <div className="result-heading transcript-heading"><div className="heading-with-icon"><AlignLeft size={20} aria-hidden="true" /><h2 id="transcript-title">Final Transcript</h2></div>
      <div className="transcript-actions"><CopyButton text={transcript} label="Copy Transcript" /><DownloadTranscriptButton text={transcript} /></div>
    </div>
    <div className="transcript-content" tabIndex={0} role="region" aria-label="Full lecture transcript">{transcript}</div>
    {markerCount > 0 && <div className="notes-marker-option"><label><input type="checkbox" checked={includeMarkers} disabled={busy} onChange={(event) => onIncludeMarkers(event.target.checked)} /> Include {markerCount} lecture markers in study notes</label>
      <p className="marker-help">When selected, your markers and written notes are sent to OpenAI with the final transcript when you generate notes. Timestamps refer to audio; they are not aligned to transcript words.</p></div>}
    <div className="result-footer"><span className="muted">{transcript.split(/\s+/u).filter(Boolean).length.toLocaleString()} words</span>
      <button className="button button-primary" disabled={busy || tooLong} onClick={onGenerate}>
        {generating ? <LoadingState text="Generating notes..." /> : <><Sparkles size={16} aria-hidden="true" />{hasNotes ? "Regenerate Notes" : "Generate Notes"}</>}
      </button>
    </div>
    {tooLong && <p className="error-message" role="alert">This transcript exceeds the {maxTranscriptChars.toLocaleString()} character notes limit. You can still copy it. Use a shorter recording to generate notes.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
