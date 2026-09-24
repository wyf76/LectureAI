"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

export default function DownloadTranscriptButton({ text }: { text: string }) {
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = downloads.current;
    return () => {
      for (const [url, timer] of pending) { clearTimeout(timer); URL.revokeObjectURL(url); }
      pending.clear();
    };
  }, []);

  function download() {
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      link.href = url;
      link.download = `lecture-transcript-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      // Let the browser consume the Blob before releasing the temporary URL.
      const downloadUrl = url;
      downloads.current.set(downloadUrl, setTimeout(() => {
        URL.revokeObjectURL(downloadUrl); downloads.current.delete(downloadUrl);
      }, 30_000));
      setFailed(false); setRequested(true);
    } catch {
      if (url) URL.revokeObjectURL(url);
      setFailed(true); setRequested(false);
    } finally { link.remove(); }
  }

  return <div className="copy-control">
    <button className="button button-secondary button-small" onClick={download}><Download size={15} aria-hidden="true" />Download Transcript</button>
    <span className={failed ? "copy-error" : "sr-only"} role="status">
      {failed ? "Download could not start. Use Copy Transcript to save the text manually." : requested ? "Download requested. Check your browser downloads." : ""}
    </span>
  </div>;
}
