"use client";

import { useEffect, useRef, useState } from "react";
import { microphoneError, preferredRecordingType, recordingExtension, recordingSupportError } from "@/lib/recording";

export type RecordingStatus = "idle" | "requesting-permission" | "recording" | "paused" | "stopping" | "stopped";

type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  bytes: number;
  accumulatedMs: number;
  runningSince: number | null;
  stopping: boolean;
};

function elapsed(session: Session): number {
  return session.accumulatedMs + (session.runningSince === null ? 0 : performance.now() - session.runningSince);
}

function freezeTimer(session: Session) {
  session.accumulatedMs = elapsed(session);
  session.runningSince = null;
}

function releaseSession(session: Session) {
  // Detach handlers first so disposal cannot finalize or update an unmounted UI.
  session.recorder.ondataavailable = null;
  session.recorder.onstop = null;
  session.recorder.onerror = null;
  session.stream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
  if (session.recorder.state !== "inactive") {
    try { session.recorder.stop(); } catch { /* Tracks have already been released. */ }
  }
  session.chunks = [];
}

type RecordingObserver = { start: (stream: MediaStream) => void; pause: () => void; resume: () => void; stop: () => void };

export default function useAudioRecorder(maxBytes: number, observer?: RecordingObserver) {
  const observerRef = useRef(observer);
  observerRef.current = observer;
  // Optional live transcription cannot throw into the local recording lifecycle.
  function notify(action: "pause" | "resume" | "stop") {
    try { observerRef.current?.[action](); } catch { /* Local recording remains independent. */ }
  }
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [checkingSupport, setCheckingSupport] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestId = useRef(0);
  const requesting = useRef(false);
  const active = status === "requesting-permission" || status === "recording" || status === "paused" || status === "stopping";

  useEffect(() => {
    setSupportError(recordingSupportError());
    setCheckingSupport(false);
    return () => {
      ++requestId.current;
      requesting.current = false;
      if (sessionRef.current) releaseSession(sessionRef.current);
      sessionRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    // Sampling an elapsed clock avoids accumulating setInterval/time-slice drift.
    const timer = setInterval(() => {
      if (sessionRef.current) setElapsedMs(elapsed(sessionRef.current));
    }, 250);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!active || status === "requesting-permission") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, status]);

  function discard() {
    if (sessionRef.current || requesting.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreviewUrl(null); setFile(null); setElapsedMs(0); setError(null); setStatus("idle");
  }

  function fail(session: Session, message: string) {
    if (sessionRef.current !== session) return;
    sessionRef.current = null;
    notify("stop");
    releaseSession(session);
    setElapsedMs(0); setStatus("idle"); setError(message);
  }

  function stopSession(session: Session) {
    if (sessionRef.current !== session || session.stopping) return;
    session.stopping = true;
    notify("stop");
    freezeTimer(session);
    setElapsedMs(session.accumulatedMs);
    setStatus("stopping");
    try {
      // An inactive recorder may already have a final stop event queued.
      if (session.recorder.state !== "inactive") session.recorder.stop();
    } catch {
      fail(session, "The recording could not be stopped correctly. Please record again.");
    }
  }

  async function start() {
    if (sessionRef.current || requesting.current) return;
    const unsupported = recordingSupportError();
    setSupportError(unsupported);
    if (unsupported) return;
    discard();
    requesting.current = true;
    const id = ++requestId.current;
    setStatus("requesting-permission");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission requests cannot be aborted. Release late results after cancel/unmount.
      if (id !== requestId.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mimeType = preferredRecordingType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000 });
      const session: Session = { recorder, stream, chunks: [], bytes: 0, accumulatedMs: 0, runningSince: null, stopping: false };
      sessionRef.current = session;
      recorder.ondataavailable = (event) => {
        if (sessionRef.current !== session || !event.data.size) return;
        session.chunks.push(event.data);
        session.bytes += event.data.size;
        if (session.bytes >= maxBytes && !session.stopping) {
          setError("Recording stopped at the upload size limit. Preview it below; if it is too large, record a shorter lecture.");
          stopSession(session);
        }
      };
      recorder.onerror = () => fail(session, "Recording failed. Your microphone has been released. Please try recording again.");
      recorder.onstop = () => {
        if (sessionRef.current !== session) return;
        notify("stop");
        freezeTimer(session);
        setElapsedMs(session.accumulatedMs);
        const type = recorder.mimeType || session.chunks.find((chunk) => chunk.type)?.type || "";
        const extension = recordingExtension(type);
        const blob = new Blob(session.chunks, { type });
        sessionRef.current = null;
        releaseSession(session);
        if (!blob.size || !extension) {
          setStatus("idle"); setElapsedMs(0);
          setError(!blob.size ? "The recording is empty. Record for a few seconds and try again." : "Your browser produced an unsupported audio format. Try another browser or upload a recording.");
          return;
        }
        try {
          const name = `lecture-recording-${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`;
          const recording = new File([blob], name, { type });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setFile(recording); setPreviewUrl(url); setStatus("stopped");
        } catch {
          setStatus("idle"); setElapsedMs(0);
          setError("Unable to prepare an audio preview. Please try a shorter recording.");
        }
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (sessionRef.current !== session || session.stopping) return;
          setError("The microphone disconnected. Recording has stopped; check the preview before transcribing.");
          stopSession(session);
        };
      });
      // Chunks stay in refs. The observer independently streams a cloned track.
      recorder.start(1000);
      session.runningSince = performance.now();
      requesting.current = false;
      setStatus("recording");
      try { observerRef.current?.start(stream); } catch { /* Preserve the full recording. */ }
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      if (id !== requestId.current) return;
      requesting.current = false;
      if (sessionRef.current) releaseSession(sessionRef.current);
      sessionRef.current = null;
      setStatus("idle"); setError(microphoneError(cause));
    }
  }

  function pause() {
    const session = sessionRef.current;
    if (!session || session.stopping || session.recorder.state !== "recording") return;
    try {
      session.recorder.pause();
      notify("pause");
      freezeTimer(session); setElapsedMs(session.accumulatedMs); setStatus("paused");
    } catch { fail(session, "Unable to pause the recording. Please record again."); }
  }

  function resume() {
    const session = sessionRef.current;
    if (!session || session.stopping || session.recorder.state !== "paused") return;
    try {
      session.recorder.resume();
      notify("resume");
      session.runningSince = performance.now(); setStatus("recording");
    } catch { fail(session, "Unable to resume the recording. Please record again."); }
  }

  function cancelPermission() {
    if (!requesting.current) return;
    ++requestId.current; requesting.current = false; setStatus("idle");
  }

  return { status, elapsedMs, file, previewUrl, error, supportError, checkingSupport, active,
    getElapsedSeconds: () => (sessionRef.current ? elapsed(sessionRef.current) : elapsedMs) / 1000,
    start, pause, resume, stop: () => { if (sessionRef.current) stopSession(sessionRef.current); },
    discard, cancelPermission };
}
