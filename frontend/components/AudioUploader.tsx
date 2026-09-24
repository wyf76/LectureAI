"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, AudioLines, Check, FileAudio, Upload, X } from "lucide-react";
import type { AppConfig } from "@/lib/api";
import LoadingState from "./LoadingState";

type Props = {
  file: File | null;
  config: AppConfig;
  busy: boolean;
  transcribing: boolean;
  error: string | null;
  onFileChange: (file: File | null) => void;
  onError: (message: string) => void;
  onTranscribe: () => void;
};

export default function AudioUploader({ file, config, busy, transcribing, error, onFileChange, onError, onTranscribe }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const maxMB = config.max_upload_bytes / 1_000_000;

  function selectFile(files: FileList | null) {
    if (busy || !files?.length) return;
    if (files.length !== 1) { onError("Choose one lecture recording at a time."); return; }
    const next = files[0];
    const extension = `.${next.name.split(".").pop()?.toLowerCase()}`;
    if (!config.supported_extensions.includes(extension)) {
      onError("Unsupported file type. Choose an MP3, M4A, WAV, MP4, MPEG, MPGA, or WebM recording."); return;
    }
    if (!next.size) { onError("This file is empty. Choose a different recording."); return; }
    if (next.size > config.max_upload_bytes) { onError(`This file is too large. Choose a recording under ${maxMB} MB.`); return; }
    onFileChange(next);
  }

  return <section className="uploader-content" aria-labelledby="upload-title" aria-busy={transcribing}>
    <div className="card-heading">
      <div><div className="eyebrow">START WITH A RECORDING</div><h2 id="upload-title">Upload Lecture</h2></div>
      <span className="section-icon"><AudioLines size={21} aria-hidden="true" /></span>
    </div>
    <p className="section-description">Bring your recording. Leave with a clearer picture.</p>
    <input ref={input} id="lecture-file" className="sr-only" type="file" disabled={busy}
      aria-label="Choose a lecture recording"
      accept={`${config.supported_extensions.join(",")},audio/mpeg,audio/mp4,audio/wav,audio/webm,video/mp4,video/mpeg,video/webm`}
      onChange={(event) => { selectFile(event.target.files); event.target.value = ""; }} />
    <div className={`drop-zone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current++; if (!busy) setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); if (--dragDepth.current <= 0) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); selectFile(event.dataTransfer.files); }}>
      {file ? <>
        <span className="upload-symbol selected"><FileAudio size={28} strokeWidth={1.5} aria-hidden="true" /></span>
        <strong className="file-name">{file.name}</strong>
        <p className="file-details">{file.size < 1_000_000 ? `${(file.size / 1000).toFixed(1)} KB` : `${(file.size / 1_000_000).toFixed(1)} MB`}<span>·</span><Check size={13} aria-hidden="true" /> Ready to transcribe</p>
        <div className="file-actions">
          <button className="text-button" disabled={busy} onClick={() => input.current?.click()}>Change file</button>
          <button className="text-button muted" disabled={busy} onClick={() => onFileChange(null)}><X size={14} aria-hidden="true" />Remove</button>
        </div>
      </> : <>
        <span className="upload-symbol"><Upload size={27} strokeWidth={1.5} aria-hidden="true" /></span>
        <strong>Drop your lecture here</strong>
        <p>or <button className="text-button" disabled={busy} onClick={() => input.current?.click()}>browse files <ArrowUpRight size={14} aria-hidden="true" /></button> from your device</p>
        <span className="format-list">MP3, M4A, WAV, MP4, MPEG, MPGA, WebM <span>·</span> Up to {maxMB} MB</span>
      </>}
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button button-primary transcribe-button" disabled={!file || busy} onClick={onTranscribe}>
      {transcribing ? <LoadingState text="Transcribing lecture..." /> : <><AudioLines size={18} aria-hidden="true" />Transcribe Lecture<ArrowUpRight size={17} aria-hidden="true" /></>}
    </button>
    <p className="upload-footnote">{transcribing ? "Longer recordings can take a few minutes. Keep this page open." : "Your recording is sent to OpenAI for transcription."}</p>
  </section>;
}
