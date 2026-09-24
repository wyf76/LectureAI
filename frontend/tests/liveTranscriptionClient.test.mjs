import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(file, replacements = {}) {
  let source = await readFile(new URL(file, import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const api = await moduleUrl('../lib/api.ts'), store = await moduleUrl('../lib/liveTranscript.ts');
const { LiveTranscriptionClient } = await import(await moduleUrl('../lib/liveTranscriptionClient.ts', { '"./api"': JSON.stringify(api), '"./liveTranscript"': JSON.stringify(store) }));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function fixture(t, pendingMint = false) {
  const pcs = [], contexts = [], states = [], calls = [];
  let resolveMint;
  class Track {
    readyState = 'live'; enabled = true;
    clone() { return new Track(); }
    stop() { this.readyState = 'ended'; }
  }
  class Stream { constructor(tracks) { this.tracks = tracks; } getAudioTracks() { return this.tracks; } }
  class Peer {
    connectionState = 'new';
    constructor() { pcs.push(this); }
    addTrack(track) { this.clone = track; return this.sender = { track, replaceTrack: async value => { this.sender.track = value; } }; }
    createDataChannel() { return this.channel = { readyState: 'connecting', send() {}, close() { this.readyState = 'closed'; } }; }
    async createOffer() { return { type: 'offer', sdp: 'fixture' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.channel.readyState = 'open'; this.connectionState = 'connected'; this.channel.onopen?.(); }
    close() { this.connectionState = 'closed'; }
  }
  class Context {
    state = 'running';
    constructor() { contexts.push(this); }
    async resume() {}
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, disconnect() {}, getFloatTimeDomainData(data) { data.fill(0); } }; }
  }
  for (const [name, value] of Object.entries({ MediaStream: Stream, RTCPeerConnection: Peer, AudioContext: Context })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; });
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, signal: options.signal, body: options.body });
    if (String(url).endsWith('/api/realtime/session')) {
      const response = () => new Response(JSON.stringify({ value: 'ek_test', expires_at: Date.now() / 1000 + 60 }));
      if (pendingMint) return new Promise(resolve => { resolveMint = () => resolve(response()); });
      return response();
    }
    return new Response('fixture-answer');
  });
  const original = new Track(), stream = new Stream([original]);
  const client = new LiveTranscriptionClient(state => states.push(state));
  t.after(() => client.dispose());
  return { client, stream, original, pcs, contexts, states, calls, resolve: () => resolveMint() };
}

test('unmount disposal aborts pending credentials, releases owned resources and cannot reconnect', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t, true);
  f.client.start(f.stream); await settle();
  assert.equal(f.calls.length, 1);
  const before = f.states.length;
  f.client.dispose();
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.pcs[0].clone.readyState, 'ended');
  assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.original.readyState, 'live', 'Live disposal never releases recorder-owned microphone');
  f.resolve(); await settle(); t.mock.timers.tick(120_000); await settle();
  assert.equal(f.calls.length, 1, 'Late credentials cannot open SDP or retry');
  assert.equal(f.states.length, before, 'No state updates after disposal');
});

test('dispose after channel opens cancels transcript batching and clears event handlers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t); f.client.start(f.stream); await settle();
  assert.equal(f.states.at(-1).status, 'live');
  const channel = f.pcs[0].channel;
  channel.onmessage({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a', delta: 'Pending update' }) });
  const count = f.states.length;
  f.client.dispose(); t.mock.timers.tick(60_000); await settle();
  assert.equal(f.states.length, count);
  assert.equal(channel.onmessage, null); assert.equal(channel.onclose, null);
  assert.equal(f.pcs[0].connectionState, 'closed');
  assert.equal(f.original.enabled, true);
});

test('rapid pause/resume serializes sender changes and Stop prevents late reconnection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t); f.client.start(f.stream); await settle();
  f.client.pause(); f.client.resume(); f.client.pause(); await settle();
  assert.equal(f.pcs[0].sender.track, null);
  assert.equal(f.pcs[0].clone.enabled, false);
  assert.equal(f.original.enabled, true);
  f.client.resume(); await settle();
  assert.equal(f.pcs[0].sender.track, f.pcs[0].clone);
  f.pcs[0].connectionState = 'failed'; f.pcs[0].onconnectionstatechange();
  assert.equal(f.states.at(-1).status, 'reconnecting');
  f.client.stop(); t.mock.timers.tick(60_000); await settle();
  assert.equal(f.pcs.length, 1);
  assert.equal(f.states.at(-1).status, 'disconnected');
});

test('connection deadline aborts stalled signaling without stopping the recorder', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t, true); f.client.start(f.stream); await settle();
  t.mock.timers.tick(20_000); await settle();
  assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.states.at(-1).status, 'reconnecting');
  assert.equal(f.original.readyState, 'live');
  f.client.stop();
  f.resolve(); await settle(); t.mock.timers.tick(60_000); await settle();
  assert.equal(f.calls.length, 1);
});

test('live language stays fixed across reconnects and defaults to English', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(t);
  f.client.start(f.stream); await settle();
  assert.deepEqual(JSON.parse(f.calls[0].body), { language: 'en' });
  f.client.start(f.stream, 'es'); await settle();
  const peer = f.pcs.at(-1);
  peer.connectionState = 'failed'; peer.onconnectionstatechange();
  t.mock.timers.tick(2000); await settle();
  const mints = f.calls.filter(call => String(call.url).endsWith('/api/realtime/session'));
  assert.deepEqual(mints.map(call => JSON.parse(call.body).language), ['en', 'es', 'es']);
});
