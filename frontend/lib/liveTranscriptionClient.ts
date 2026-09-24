import { createLiveSession } from "./api";
import { LiveTranscriptStore, type LiveSegment } from "./liveTranscript";
import type { TranscriptionLanguage } from "./transcriptionLanguage";

export type LiveStatus = "idle" | "connecting" | "live" | "reconnecting" | "paused" | "disconnected" | "error";
export type LiveState = { status: LiveStatus; segments: LiveSegment[]; warning: string | null };
export const EMPTY_LIVE_STATE: LiveState = { status: "idle", segments: [], warning: null };

type Connection = {
  epoch: number; pc: RTCPeerConnection; channel: RTCDataChannel; track: MediaStreamTrack;
  sender: RTCRtpSender; abort: AbortController; context: AudioContext;
  analyser: AnalyserNode; source: MediaStreamAudioSourceNode; samples: Float32Array<ArrayBuffer>;
  ready: boolean; hasSpeech: boolean; lastSpeech: number; bufferSince: number;
  timer?: ReturnType<typeof setInterval>; deadline?: ReturnType<typeof setTimeout>;
  tail?: ReturnType<typeof setTimeout>; drain?: ReturnType<typeof setTimeout>;
  trackChange: Promise<void>;
};

/** Owns only cloned tracks. Failures must never stop or mute the local recorder. */
export class LiveTranscriptionClient {
  private store = new LiveTranscriptStore();
  private connection?: Connection;
  private stream?: MediaStream;
  private stopped = true;
  private paused = false;
  private exhausted = false;
  private retries = 0;
  private epoch = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private status: LiveStatus = "idle";
  private warning: string | null = null;
  private language: TranscriptionLanguage = "en";

  constructor(private publish: (state: LiveState) => void) {}

  start(stream: MediaStream, language: TranscriptionLanguage = "en") {
    this.dispose();
    this.store = new LiveTranscriptStore();
    this.language = language;
    this.stream = stream; this.stopped = false; this.paused = false;
    this.exhausted = false; this.retries = 0; this.warning = null;
    this.setStatus("connecting");
    void this.connect();
  }

  private setStatus(status: LiveStatus) { this.status = status; this.emit(); }
  private emit() {
    clearTimeout(this.publishTimer); this.publishTimer = undefined;
    this.publish({ status: this.status, segments: this.store.snapshot(), warning: this.warning });
  }
  private changed() {
    // At most ten transcript snapshots per second, independent of audio packets.
    if (!this.publishTimer) this.publishTimer = setTimeout(() => this.emit(), 100);
  }

  private async connect() {
    if (this.stopped || this.connection || this.exhausted) return;
    if (typeof RTCPeerConnection === "undefined" || typeof AudioContext === "undefined") {
      this.exhausted = true;
      this.warning = "Live transcription isn't available in this browser. You can still record and finalize afterward.";
      this.setStatus("error"); return;
    }
    let pc: RTCPeerConnection | undefined, track: MediaStreamTrack | undefined, context: AudioContext | undefined;
    let connection: Connection | undefined;
    try {
      const original = this.stream?.getAudioTracks()[0];
      if (!original || original.readyState !== "live") throw new Error("Microphone unavailable");
      track = original.clone(); track.enabled = !this.paused;
      const stream = new MediaStream([track]);
      pc = new RTCPeerConnection();
      const sender = pc.addTrack(track, stream);
      const channel = pc.createDataChannel("oai-events");
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      source.connect(analyser); // Analysis only: never connect the microphone to speakers.
      connection = {
        epoch: ++this.epoch, pc, channel, sender, track, context, source, analyser,
        samples: new Float32Array(analyser.fftSize), abort: new AbortController(),
        ready: false, hasSpeech: false, lastSpeech: 0, bufferSince: performance.now(),
        trackChange: Promise.resolve(),
      };
      const c = connection;
      this.connection = c;
      if (this.paused) this.attachTrack(c, null);
      c.deadline = setTimeout(() => this.failed(c), 20_000);
      channel.onopen = () => {
        if (this.connection !== c || this.stopped) return;
        clearTimeout(c.deadline); c.ready = true; c.bufferSince = performance.now();
        c.timer = setInterval(() => this.sample(c), 100);
        this.setStatus(this.paused ? "paused" : "live");
      };
      channel.onmessage = (message) => {
        if (this.connection !== c) return;
        try {
          if (typeof message.data !== "string" || message.data.length > 1_000_000) throw new Error("Invalid event");
          const event: unknown = JSON.parse(message.data);
          if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid event");
          const data = event as Record<string, unknown>;
          if (data.type === "error" || data.type === "conversation.item.input_audio_transcription.failed") {
            this.failed(c); return;
          }
          if (data.type === "conversation.item.input_audio_transcription.delta" && !this.paused && !this.stopped) c.hasSpeech = true;
          if (this.store.apply(data, c.epoch)) this.changed();
        } catch { this.failed(c); }
      };
      channel.onerror = channel.onclose = () => this.failed(c);
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(c.pc.connectionState)) this.failed(c);
      };
      await context.resume();
      if (this.connection !== c || this.stopped) return;
      if (context.state !== "running") throw new Error("Audio analysis unavailable");
      const credential = await createLiveSession(c.abort.signal, this.language);
      if (this.connection !== c || this.stopped) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.connection !== c || this.stopped) return;
      // WebRTC negotiates encoding/rate. MediaRecorder's WebM/MP4 never enters this path.
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST", headers: { Authorization: `Bearer ${credential.value}`, "Content-Type": "application/sdp" },
        body: offer.sdp, signal: c.abort.signal,
      });
      if (!answer.ok) throw new Error("Live connection unavailable");
      const sdp = await answer.text();
      if (this.connection !== c || this.stopped) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch {
      if (connection) this.failed(connection);
      else {
        track?.stop(); pc?.close(); if (context) void context.close().catch(() => {});
        if (!this.stopped) this.failed();
      }
    }
  }

  private attachTrack(c: Connection, track: MediaStreamTrack | null) {
    // Serialize rapid pause/resume so a late detach cannot mute a resumed session.
    c.trackChange = c.trackChange.then(async () => {
      if (this.connection === c) await c.sender.replaceTrack(track);
    }).catch(() => this.failed(c));
  }

  private send(c: Connection, type: string) {
    if (this.connection !== c || c.channel.readyState !== "open") return;
    c.channel.send(JSON.stringify({ type }));
  }

  private commit(c: Connection) {
    if (!c.hasSpeech || performance.now() - c.bufferSince < 500) return;
    this.send(c, "input_audio_buffer.commit");
    c.hasSpeech = false; c.bufferSince = performance.now();
  }

  private sample(c: Connection) {
    if (this.connection !== c || this.paused || this.stopped) return;
    try {
      if (c.context.state !== "running") throw new Error("Audio analysis suspended");
      c.analyser.getFloatTimeDomainData(c.samples);
      let power = 0;
      for (const value of c.samples) power += value * value;
      const now = performance.now();
      if (Math.sqrt(power / c.samples.length) > 0.015) { c.hasSpeech = true; c.lastSpeech = now; }
      // gpt-live-transcribe uses client commits, not server/semantic VAD.
      if (c.hasSpeech && (now - c.lastSpeech > 700 || now - c.bufferSince >= 15_000)) this.commit(c);
      else if (!c.hasSpeech && now - c.bufferSince >= 15_000) {
        this.send(c, "input_audio_buffer.clear"); c.bufferSince = now;
      }
    } catch { this.failed(c); }
  }

  pause() {
    if (this.stopped || this.paused) return;
    this.paused = true; clearTimeout(this.retry);
    const c = this.connection;
    if (c) {
      c.track.enabled = false; this.attachTrack(c, null);
      // Allow in-flight RTP to settle before committing the pre-pause tail.
      c.tail = setTimeout(() => { try { this.commit(c); } catch { this.failed(c); } }, 250);
    }
    this.setStatus("paused");
  }

  resume() {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    const c = this.connection;
    if (c) {
      clearTimeout(c.tail);
      try { this.commit(c); } catch { this.failed(c); return; }
      c.track.enabled = true; c.bufferSince = performance.now();
      this.attachTrack(c, c.track);
      this.setStatus(c.ready ? "live" : "connecting");
    } else if (!this.exhausted) { this.setStatus("reconnecting"); void this.connect(); }
    else this.setStatus("error");
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true; clearTimeout(this.retry);
    const c = this.connection;
    if (!c) { this.setStatus("disconnected"); return; }
    c.track.enabled = false; this.attachTrack(c, null); c.track.stop();
    clearInterval(c.timer); clearTimeout(c.tail);
    if (!c.ready) { this.close(c); this.setStatus("disconnected"); return; }
    c.tail = setTimeout(() => { try { this.commit(c); } catch { this.failed(c); } }, 250);
    c.drain = setTimeout(() => {
      if (this.connection !== c) return;
      this.store.interrupt(c.epoch); this.close(c); this.setStatus("disconnected");
    }, 3000);
    this.setStatus("disconnected");
  }

  private failed(c?: Connection) {
    if (c && this.connection !== c) return;
    if (c) { this.store.interrupt(c.epoch); this.close(c); }
    if (this.stopped) { this.setStatus("disconnected"); return; }
    this.warning = "Live transcription may have gaps. Finalize the complete recording afterward to recover the full lecture.";
    if (this.retries >= 3) { this.exhausted = true; this.setStatus(this.paused ? "paused" : "error"); return; }
    const delay = 2000 * 2 ** this.retries++;
    this.setStatus(this.paused ? "paused" : "reconnecting");
    if (!this.paused) this.retry = setTimeout(() => { void this.connect(); }, delay);
  }

  private close(c: Connection) {
    if (this.connection === c) this.connection = undefined;
    c.abort.abort();
    clearInterval(c.timer); clearTimeout(c.deadline); clearTimeout(c.tail); clearTimeout(c.drain);
    c.channel.onopen = c.channel.onmessage = c.channel.onclose = c.channel.onerror = null;
    c.pc.onconnectionstatechange = null;
    c.channel.close(); c.pc.close(); c.track.stop(); c.source.disconnect(); c.analyser.disconnect();
    void c.context.close().catch(() => {});
  }

  dispose() {
    this.stopped = true; clearTimeout(this.retry); clearTimeout(this.publishTimer); this.publishTimer = undefined;
    if (this.connection) this.close(this.connection);
    this.stream = undefined;
  }
}
