"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState } from "@/lib/liveTranscriptionClient";

export default function LiveTranscript({ status, segments, warning, active, finalized }: LiveState & { active: boolean; finalized: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (element && follow.current) element.scrollTop = element.scrollHeight;
  }, [segments]);
  const labels = { idle: "Ready", connecting: "Connecting...", live: "Live", reconnecting: "Reconnecting...", paused: "Paused", disconnected: "Disconnected", error: "Live transcription unavailable" };
  return <section className="live-transcript" aria-labelledby="live-transcript-title">
    <div className="live-heading"><h3 id="live-transcript-title">Live Transcript{!active && " — Provisional"}</h3><span className={`live-status live-status-${status}`} role="status" aria-live="polite">{labels[status]}</span></div>
    {(status === "reconnecting" || status === "error") && active && <p className="live-notice">Your lecture is still being recorded locally.</p>}
    {warning && <p className="live-notice">{warning}</p>}
    <div ref={viewport} className="live-text" role="region" aria-label="Provisional live transcript" tabIndex={0} onScroll={() => {
      const element = viewport.current;
      if (element) { follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; setAway(!follow.current); }
    }}>
      {segments.length ? segments.map((segment) => <p key={segment.id} className={segment.complete ? "" : "live-partial"}>{segment.text}{!segment.complete && <span className="segment-label"> {segment.interrupted ? "(unconfirmed)" : "(partial)"}</span>}</p>) : <p className="muted">{active ? "Your words will appear here as you speak." : "No live text captured. You can still finalize the full recording."}</p>}
    </div>
    {away && <button className="button button-secondary jump-live" onClick={() => {
      follow.current = true; setAway(false);
      if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
    }}>↓ Jump to live</button>}
    <p className="live-footnote">{finalized ? "Final Transcript Ready. Generate notes from the final transcript below." : "Live transcription is provisional. Finalize the recording before generating notes."}</p>
  </section>;
}
