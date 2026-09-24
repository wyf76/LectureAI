"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_LIVE_STATE, LiveTranscriptionClient } from "@/lib/liveTranscriptionClient";
import type { TranscriptionLanguage } from "@/lib/transcriptionLanguage";

export default function useLiveTranscription() {
  const [state, setState] = useState(EMPTY_LIVE_STATE);
  const client = useRef<LiveTranscriptionClient | null>(null);
  useEffect(() => () => { client.current?.dispose(); client.current = null; }, []);
  const start = useCallback((stream: MediaStream, language: TranscriptionLanguage = "en") => {
    client.current?.dispose();
    client.current = new LiveTranscriptionClient(setState);
    client.current.start(stream, language);
  }, []);
  const pause = useCallback(() => client.current?.pause(), []);
  const resume = useCallback(() => client.current?.resume(), []);
  const stop = useCallback(() => client.current?.stop(), []);
  const reset = useCallback(() => {
    client.current?.dispose(); client.current = null; setState(EMPTY_LIVE_STATE);
  }, []);
  return { ...state, start, pause, resume, stop, reset };
}
