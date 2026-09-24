"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, AudioLines, BookOpen, Check, FileText, Leaf, Mic, Sparkles, Upload } from "lucide-react";
import AudioUploader from "@/components/AudioUploader";
import AudioRecorder from "@/components/AudioRecorder";
import TranscriptViewer from "@/components/TranscriptViewer";
import NotesViewer from "@/components/NotesViewer";
import { DEFAULT_CONFIG, generateNotes, getConfig, transcribeAudio } from "@/lib/api";
import useLectureMarkers from "@/hooks/useLectureMarkers";
import { markerMetadata } from "@/lib/lectureMarkers";
import { TRANSCRIPTION_LANGUAGES, type TranscriptionLanguage } from "@/lib/transcriptionLanguage";

export default function Home() {
  const markers = useLectureMarkers();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"upload" | "record">("upload");
  const [language, setLanguage] = useState<TranscriptionLanguage>("en");
  const [recordingActive, setRecordingActive] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [configError, setConfigError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [finalizedFile, setFinalizedFile] = useState<File | null>(null);
  const [finalLectureId, setFinalLectureId] = useState<string | null>(null);
  const [includeMarkers, setIncludeMarkers] = useState(true);
  const [notes, setNotes] = useState("");
  const [operation, setOperation] = useState<"transcription" | "notes" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const busy = operation !== null;

  useEffect(() => {
    let active = true;
    getConfig().then((value) => { if (active) setConfig(value); })
      .catch((error: Error) => { if (active) setConfigError(error.message); });
    return () => { active = false; };
  }, []);

  function changeFile(next: File | null) {
    setFinalLectureId(null);
    setFinalizedFile(null);
    setFile(next); setTranscript(""); setNotes(""); setUploadError(null); setNotesError(null); setAnnouncement("");
  }

  async function transcribe(source: File, lectureId: string | null = null) {
    if (busy || recordingActive) return;
    setOperation("transcription"); setUploadError(null); setNotesError(null); setTranscript(""); setNotes("");
    setFinalizedFile(null);
    setFinalLectureId(null);
    try {
      setTranscript(await transcribeAudio(source, language));
      setFinalizedFile(source);
      setFinalLectureId(lectureId); setIncludeMarkers(true);
      setConfigError(null);
      setAnnouncement("Transcription complete. Your transcript is ready below.");
    } catch (error) { setUploadError(error instanceof Error ? error.message : "Unable to transcribe this lecture. Please try again."); }
    finally { setOperation(null); }
  }

  async function createNotes() {
    if (!transcript || busy || recordingActive) return;
    setOperation("notes"); setNotesError(null);
    try {
      setNotes(await generateNotes(transcript, includeMarkers && finalLectureId && finalLectureId === markers.lectureId && !markers.recovered ? markerMetadata(markers.markers) : undefined));
      setAnnouncement("Your lecture notes are ready below.");
    } catch (error) { setNotesError(error instanceof Error ? error.message : "Unable to generate notes. Please try again."); }
    finally { setOperation(null); }
  }

  const step = notes ? 3 : transcript ? 2 : 1;

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <a href="/" className="brand" aria-label="LectureAI home"><span className="brand-symbol"><AudioLines size={23} aria-hidden="true" /></span>Lecture<span className="brand-ai">AI</span></a>
      <span className="header-caption">A little more present. A little more prepared.</span>
      <span className="workspace-label"><span />YOUR STUDY SPACE</span>
    </div></header>
    <main id="main" className="main-container">
      <div className="hero"><div className="eyebrow hero-eyebrow"><span className="small-line" />FROM LISTENING TO LEARNING</div>
        <h1>Stay in the lecture.<br /><span>We’ll take it from here.</span></h1>
        <p>Turn lecture recordings into transcripts and study notes.</p>
      </div>
      <ol className="steps" aria-label="Lecture workflow">
        {["Add your lecture", "Get the transcript", "Make it study-ready"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step >= index + 1 ? "step-active" : ""}>
          <span className="step-number">{step > index + 1 ? <Check size={13} aria-hidden="true" /> : `0${index + 1}`}</span><span>{label}</span>{index < 2 && <ArrowRight className="step-arrow" size={16} aria-hidden="true" />}
        </li>)}
      </ol>
      {configError && <p className="connection-notice" role="alert">{configError} Upload limits will be checked again by the backend when you submit.</p>}
      {markers.recovered && markers.markers.length > 0 && mode !== "record" && <p className="marker-recovery">Recovered {markers.markers.length} lecture markers. <button className="marker-time" disabled={busy || recordingActive} onClick={() => setMode("record")}>View recovered markers</button></p>}
      <div className="workspace-grid">
        <section className="card upload-card" aria-labelledby="add-lecture-title">
          <h2 id="add-lecture-title" className="add-lecture-title">Add Lecture</h2>
          <div className="lecture-modes" role="group" aria-label="Choose how to add a lecture">
            <button className={mode === "upload" ? "selected" : ""} aria-pressed={mode === "upload"} aria-controls="upload-panel" disabled={busy || recordingActive} onClick={() => { setMode("upload"); setUploadError(null); }}><Upload size={15} aria-hidden="true" />Upload Audio</button>
            <button className={mode === "record" ? "selected" : ""} aria-pressed={mode === "record"} aria-controls="record-panel" disabled={busy || recordingActive} onClick={() => { setMode("record"); setUploadError(null); }}><Mic size={15} aria-hidden="true" />Record Lecture</button>
          </div>
          <div className="transcription-language">
            <label htmlFor="transcription-language">Audio language</label>
            <select id="transcription-language" value={language} disabled={busy || recordingActive} aria-describedby="language-hint" onChange={(event) => setLanguage(event.target.value as TranscriptionLanguage)}>
              {TRANSCRIPTION_LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p id="language-hint">Choose the language being spoken for live and final transcription. This guides recognition; it does not translate or filter the recording.</p>
          </div>
          {/* Keep panels mounted so switching modes preserves a stopped preview. */}
          <div id="upload-panel" hidden={mode !== "upload"}>
            <AudioUploader file={file} config={config} busy={busy || recordingActive} transcribing={operation === "transcription"} error={uploadError} onFileChange={changeFile} onError={setUploadError} onTranscribe={() => { if (file) void transcribe(file); }} />
          </div>
          <div id="record-panel" hidden={mode !== "record"}>
            <AudioRecorder language={language} maxBytes={config.max_upload_bytes} busy={busy} transcribing={operation === "transcription"} error={uploadError} onActiveChange={setRecordingActive} onResetError={() => setUploadError(null)} onTranscribe={(source) => transcribe(source, markers.lectureId)} finalizedFile={finalizedFile} markers={markers} onStart={() => { markers.begin(); setFinalLectureId(null); setTranscript(""); setNotes(""); setFinalizedFile(null); setNotesError(null); setAnnouncement(""); }} />
          </div>
        </section>
        <aside className="study-aside" aria-labelledby="study-title">
          <span className="aside-badge"><Sparkles size={14} aria-hidden="true" />LESS REPLAYING. MORE UNDERSTANDING.</span>
          <h2 id="study-title">Good notes.<br />Clearer thinking.</h2>
          <p>Give your next study session<br className="desktop-break" /> a head start.</p>
          <div className="benefit"><span><FileText size={20} aria-hidden="true" /></span><div><h3>Every word, in one place</h3><p>A readable transcript you can revisit<br className="desktop-break" /> at your own pace.</p></div></div>
          <div className="benefit"><span><BookOpen size={20} aria-hidden="true" /></span><div><h3>The ideas that matter</h3><p>Organized concepts, definitions, and<br className="desktop-break" /> questions grounded in your lecture.</p></div></div>
          <div className="aside-footer"><Leaf size={17} aria-hidden="true" /><span>Room to focus on the bigger picture.</span></div>
        </aside>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {transcript ? <div className="results">
        <div className="results-label"><span className="eyebrow">YOUR LECTURE, MADE CLEARER</span><ArrowDown size={16} aria-hidden="true" /></div>
        <TranscriptViewer key={transcript} transcript={transcript} generating={operation === "notes"} busy={busy || recordingActive} hasNotes={!!notes} maxTranscriptChars={config.max_transcript_chars} error={notesError} onGenerate={createNotes}
          markerCount={finalLectureId === markers.lectureId && finalLectureId && !markers.recovered ? markers.markers.length : 0} includeMarkers={includeMarkers} onIncludeMarkers={setIncludeMarkers} />
        {notes && <NotesViewer key={notes} notes={notes} />}
      </div> : <div className="empty-result"><span className="empty-result-icon"><BookOpen size={23} strokeWidth={1.5} aria-hidden="true" /></span><div><h2>Your next study session starts here.</h2><p>Your transcript and notes will appear below once they’re ready.</p></div></div>}
      <footer className="page-footer"><span><AudioLines size={15} aria-hidden="true" />Made for the way you learn.</span><p>Audio isn’t saved. Copy your results before leaving.</p></footer>
    </main>
  </>;
}
