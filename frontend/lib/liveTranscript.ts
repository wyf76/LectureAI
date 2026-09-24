export type LiveSegment = { id: string; text: string; complete: boolean; interrupted: boolean };
type Entry = LiveSegment & { epoch: number; previous?: string | null };

/** Reconcile text by item ID; predecessor links order asynchronous completions. */
export class LiveTranscriptStore {
  private entries = new Map<string, Entry>();
  private seen = new Set<string>();
  private chars = 0;

  apply(event: Record<string, unknown>, epoch: number): boolean {
    const type = event.type;
    const item = event.item as { id?: unknown } | undefined;
    const id = type === "conversation.item.added" ? item?.id : event.item_id;
    if (!["input_audio_buffer.committed", "conversation.item.added", "conversation.item.input_audio_transcription.delta", "conversation.item.input_audio_transcription.completed"].includes(String(type))) return false;
    if (typeof id !== "string") throw new Error("Invalid transcript item");
    const eventId = typeof event.event_id === "string" ? `${epoch}:${event.event_id}` : null;
    if (eventId && this.seen.has(eventId)) return false;
    if (eventId) {
      this.seen.add(eventId);
      if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value!);
    }
    const key = `${epoch}:${id}`;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 10_000) throw new Error("Transcript limit reached");
      entry = { id: key, epoch, text: "", complete: false, interrupted: false };
      this.entries.set(key, entry);
    }
    if (type === "input_audio_buffer.committed" || type === "conversation.item.added") {
      if (event.previous_item_id === null || typeof event.previous_item_id === "string") {
        entry.previous = event.previous_item_id === null ? null : `${epoch}:${event.previous_item_id}`;
      }
    } else if (type === "conversation.item.input_audio_transcription.completed") {
      if (typeof event.transcript !== "string") throw new Error("Invalid completed transcript");
      this.chars += event.transcript.length - entry.text.length;
      entry.text = event.transcript;
      entry.complete = true; entry.interrupted = false;
    } else if (!entry.complete) {
      if (typeof event.delta !== "string") throw new Error("Invalid partial transcript");
      entry.text += event.delta; this.chars += event.delta.length;
    }
    if (this.chars > 600_000) throw new Error("Transcript limit reached");
    return true;
  }

  interrupt(epoch: number) {
    for (const entry of this.entries.values()) if (entry.epoch === epoch && !entry.complete) entry.interrupted = true;
  }

  snapshot(): LiveSegment[] {
    const ordered: Entry[] = [];
    const visited = new Set<string>();
    // Iterative traversal avoids stack overflow on long lectures or malformed cycles.
    for (const entry of this.entries.values()) {
      const chain: Entry[] = [];
      let current: Entry | undefined = entry;
      while (current && !visited.has(current.id)) {
        visited.add(current.id); chain.push(current);
        current = current.previous ? this.entries.get(current.previous) : undefined;
      }
      ordered.push(...chain.reverse());
    }
    return ordered.filter((entry) => entry.text).map(({ id, text, complete, interrupted }) => ({ id, text, complete, interrupted }));
  }
}
