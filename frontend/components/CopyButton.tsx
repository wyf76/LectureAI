"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch { setState("error"); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3500);
  }

  return <div className="copy-control">
    <button className="button button-secondary button-small" onClick={copy}>
      {state === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {state === "copied" ? "Copied!" : label}
    </button>
    <span className={state === "error" ? "copy-error" : "sr-only"} role="status">
      {state === "error" ? "Copy failed. Select the text and copy it manually." : state === "copied" ? "Copied to clipboard." : ""}
    </span>
  </div>;
}
