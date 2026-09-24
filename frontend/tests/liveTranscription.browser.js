// Playwright CLI run-code script. Native recording; synthetic mic and fake OpenAI transport.
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const test = window.__liveTest = { pcs: [], contexts: [], streams: [], micCalls: 0, mode: 'ok', gain: null };
    const NativeContext = AudioContext;
    window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
      if (test.mode === 'context-failure') throw new Error('private initialization diagnostic');
      const context = Reflect.construct(target, args); test.contexts.push(context); return context;
    } });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      test.micCalls++;
      const context = new NativeContext(); test.sourceContext = context; await context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      test.gain = gain; gain.gain.value = 0.1;
      oscillator.connect(gain); gain.connect(destination); oscillator.start();
      test.streams.push(destination.stream); return destination.stream;
    } });
    class FakePeer {
      connectionState = 'new';
      constructor() { test.pcs.push(this); }
      addTrack(track) {
        this.clone = track;
        return this.sender = { track, replaceTrack: async value => { this.sender.track = value; } };
      }
      createDataChannel(label) {
        if (label !== 'oai-events') throw new Error('Unexpected channel');
        return this.channel = { readyState: 'connecting', sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() { this.readyState = 'closed'; } };
      }
      async createOffer() { return { type: 'offer', sdp: 'fixture-sdp-offer' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        if (test.mode === 'connect-hang') return;
        this.connectionState = 'connected'; this.channel.readyState = 'open'; this.channel.onopen?.();
      }
      close() { this.connectionState = 'closed'; }
    }
    window.RTCPeerConnection = FakePeer;
    test.emit = event => test.pcs.at(-1).channel.onmessage?.({ data: JSON.stringify(event) });
    test.drop = () => { const pc = test.pcs.at(-1); pc.connectionState = 'disconnected'; pc.onconnectionstatechange?.(); };
  });
  const headers = { 'access-control-allow-origin': 'http://localhost:3000', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type' };
  let mints = 0, sdpCalls = 0, mintFails = false;
  await page.route('**/api/realtime/session', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    assert(route.request().postDataJSON().language === 'es', 'Selected language persists for initial session and reconnects');
    mints++;
    return route.fulfill({ status: mintFails ? 503 : 200, headers, json: mintFails ? { detail: 'Unavailable' } : { value: 'ek_browser_fixture', expires_at: Date.now() / 1000 + 60 } });
  });
  await page.route('https://api.openai.com/v1/realtime/calls', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    sdpCalls++;
    assert(route.request().headers().authorization === 'Bearer ek_browser_fixture', 'Only ephemeral credential reaches browser transport');
    assert(route.request().postData() === 'fixture-sdp-offer', 'Only SDP is posted; no MediaRecorder chunks');
    return route.fulfill({ headers, body: 'fixture-sdp-answer' });
  });
  let finalUploads = 0, notesRequests = 0;
  const finalText = 'Final full recording transcript, including recovered audio.';
  await page.route('**/api/transcribe', route => {
    finalUploads++;
    const body = route.request().postDataBuffer().toString('latin1');
    assert(body.includes('name="file"') && body.includes('lecture-recording-'), 'Finalize sends full recorded file');
    assert(body.includes('name="language"\r\n\r\nes\r\n'), 'Final upload uses selected language');
    return route.fulfill({ headers, json: { transcript: finalText } });
  });
  await page.route('**/api/notes', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    notesRequests++;
    assert(route.request().postDataJSON().transcript === finalText, 'Notes use final transcript only');
    return route.fulfill({ headers, json: { notes: '# Lecture Summary\nRecovered final lecture.' } });
  });
  const start = page.getByRole('button', { name: 'Start Recording', exact: true });
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  const liveStatus = page.locator('.live-status');
  async function openRecorder() {
    await page.goto('http://localhost:3000');
    await page.getByRole('button', { name: 'Record Lecture', exact: true }).click();
  }
  async function waitLive() { await page.waitForFunction(() => document.querySelector('.live-status')?.textContent === 'Live'); }
  await openRecorder();
  const language = page.getByLabel('Audio language', { exact: true });
  assert(await language.inputValue() === 'en', 'English is the default language');
  await language.selectOption('es');
  assert(mints === 0 && await page.evaluate(() => window.__liveTest.micCalls) === 0, 'No automatic mic or paid session');
  await start.click(); await waitLive();
  assert(await language.isDisabled(), 'Language is locked while recording');
  assert(await page.evaluate(() => window.__liveTest.micCalls) === 1, 'A single microphone request');
  assert(await page.evaluate(() => window.__liveTest.pcs[0].clone !== window.__liveTest.streams[0].getAudioTracks()[0]), 'Live owns only a clone');
  const delta = (item_id, text, event_id) => ({ type: 'conversation.item.input_audio_transcription.delta', item_id, delta: text, event_id });
  const done = (item_id, transcript) => ({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript });
  const commit = (item_id, previous_item_id) => ({ type: 'input_audio_buffer.committed', item_id, previous_item_id });
  async function emit(event) { await page.evaluate(value => window.__liveTest.emit(value), event); }
  await emit(delta('a', 'Today we discuss', 'e1'));
  await page.locator('.live-partial').filter({ hasText: 'Today we discuss' }).waitFor();
  await emit(delta('a', 'Today we discuss', 'e1'));
  await emit(done('b', 'Second sentence.')); await emit(commit('b', 'a'));
  await emit(done('a', 'First sentence.')); await emit(commit('a', null));
  await page.waitForFunction(() => document.querySelector('.live-text').textContent === 'First sentence.Second sentence.');
  assert(await page.getByRole('button', { name: 'Generate Notes', exact: true }).count() === 0, 'Live text cannot generate notes');
  // Silence commits use the documented client event; no audio.append payloads.
  await page.waitForTimeout(650);
  await page.evaluate(() => { window.__liveTest.gain.gain.value = 0; });
  await page.waitForFunction(() => window.__liveTest.pcs.at(-1).channel.sent.some(event => event.type === 'input_audio_buffer.commit'));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForFunction(() => window.__liveTest.pcs.at(-1).sender.track === null);
  assert(await liveStatus.innerText() === 'Paused', 'Pause has accessible status');
  assert(await language.isDisabled(), 'Language stays locked while paused');
  assert(await page.evaluate(() => !window.__liveTest.pcs.at(-1).clone.enabled && window.__liveTest.streams[0].getAudioTracks()[0].enabled), 'Pause disables cloned input only');
  const frozen = await page.getByRole('timer').innerText();
  await page.waitForTimeout(1100);
  assert(await page.getByRole('timer').innerText() === frozen, 'Pause freezes recording time');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await waitLive();
  await page.waitForFunction(() => window.__liveTest.pcs.at(-1).sender.track?.enabled === true);
  await emit(delta('tail', 'Interrupted partial', 'tail1'));
  await page.evaluate(() => window.__liveTest.drop());
  assert(await page.locator('.recording-status').innerText() === 'Recording', 'Connection drop does not stop recorder');
  await page.getByText('Your lecture is still being recorded locally.').waitFor();
  await waitLive();
  assert(await page.evaluate(() => window.__liveTest.pcs.length) === 2, 'One bounded reconnect');
  assert(await page.evaluate(() => window.__liveTest.micCalls) === 1, 'Reconnect reuses original microphone');
  await page.locator('.live-partial').filter({ hasText: '(unconfirmed)' }).waitFor();
  // Long text and manual scrolling: updates must not move a reader to the bottom.
  await page.evaluate(() => {
    for (let i = 0; i < 35; i++) window.__liveTest.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: `long-${i}`, transcript: `Lecture sentence ${i}. Memory maps virtual pages to physical frames.` });
  });
  await page.waitForFunction(() => document.querySelector('.live-text').scrollTop > 0);
  await page.locator('.live-text').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  await emit(done('newest', 'Newest text.'));
  await page.waitForTimeout(200);
  assert(await page.locator('.live-text').evaluate(element => element.scrollTop) === 0, 'Scrolled-up position is preserved');
  await page.getByRole('button', { name: '↓ Jump to live', exact: true }).click();
  assert(await page.locator('.live-text').evaluate(element => element.scrollTop > 0), 'Jump to live works');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Live transcript fits mobile');
  await page.locator('.live-transcript').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/live-transcript-mobile.png' });
  await stop.click();
  await page.getByRole('button', { name: 'Finalize Transcript', exact: true }).waitFor();
  assert(await language.isEnabled(), 'Language can be corrected before final transcription');
  assert(await page.evaluate(() => window.__liveTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) && window.__liveTest.pcs.every(pc => pc.clone.readyState === 'ended')), 'Stop releases original and cloned tracks immediately');
  await emit(done('stop-tail', 'Last completion after Stop.'));
  await page.getByText('Last completion after Stop.', { exact: true }).waitFor();
  await page.waitForFunction(() => window.__liveTest.pcs.every(pc => pc.connectionState === 'closed') && window.__liveTest.contexts.every(c => c.state === 'closed'));
  assert(finalUploads === 0, 'Stop never automatically uploads file');
  await page.locator('audio').evaluate(async audio => { audio.muted = true; await audio.play(); audio.pause(); });
  await page.getByRole('button', { name: 'Finalize Transcript', exact: true }).click();
  await page.getByRole('heading', { name: 'Final Transcript', exact: true }).waitFor();
  assert(await page.getByRole('region', { name: 'Full lecture transcript' }).innerText() === finalText, 'Final text replaces shared results without concatenating live text');
  await page.getByRole('button', { name: 'Generate Notes', exact: true }).click();
  await page.getByRole('heading', { name: 'Lecture Notes', exact: true }).waitFor();
  assert(notesRequests === 1, 'Final notes request succeeded');
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  await start.click(); await waitLive();
  assert(await page.getByRole('button', { name: 'Generate Notes', exact: true }).count() === 0, 'New recording clears stale final results');
  // Malformed data fails only live, and Stop cancels the pending retry.
  // Let the native encoder produce audio before stopping this short recording.
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__liveTest.pcs.at(-1).channel.onmessage({ data: '{bad-json' }));
  await page.getByText('Your lecture is still being recorded locally.').waitFor();
  const beforeStop = mints;
  await stop.click(); await page.waitForTimeout(2500);
  assert(mints === beforeStop, 'Stop during reconnect cancels session mint');
  assert(await page.locator('audio').count() === 1, 'Malformed data preserves recording preview');
  // Unsupported live transport does not disable recording.
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  await page.evaluate(() => { window.__liveTest.peerConstructor = RTCPeerConnection; window.RTCPeerConnection = undefined; });
  await start.click();
  await page.getByText("Live transcription isn't available in this browser. You can still record and finalize afterward.").waitFor();
  assert(await page.locator('.recording-status').innerText() === 'Recording', 'Unsupported live path retains recording');
  await page.waitForTimeout(600); await stop.click();
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  await page.evaluate(() => { window.RTCPeerConnection = window.__liveTest.peerConstructor; });
  // Repeated credential failure has a finite attempt budget.
  mintFails = true; const beforeFailure = mints;
  await start.click();
  await page.waitForFunction(() => document.querySelector('.live-status')?.textContent === 'Live transcription unavailable', null, { timeout: 20000 });
  assert(mints - beforeFailure === 4, 'Initial attempt plus exactly three retries');
  assert(await page.locator('.recording-status').innerText() === 'Recording', 'Session creation failure preserves local recording');
  await stop.click();
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  mintFails = false;
  await page.evaluate(() => { window.__liveTest.mode = 'context-failure'; });
  await start.click();
  await page.getByText('Your lecture is still being recorded locally.').waitFor();
  assert(await page.locator('.recording-status').innerText() === 'Recording', 'Audio initialization failure preserves recorder');
  await page.waitForTimeout(600); await stop.click();
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  await page.evaluate(() => { window.__liveTest.mode = 'ok'; });
  await start.click(); await waitLive();
  await stop.click();
  await page.waitForFunction(() => window.__liveTest.pcs.every(pc => pc.connectionState === 'closed') && window.__liveTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) && window.__liveTest.contexts.every(c => c.state === 'closed'));
  assert(errors.length === 0, `Unexpected browser errors: ${errors.join('; ')}`);
  assert(sdpCalls > 0, 'WebRTC signaling exercised');
  await page.unrouteAll({ behavior: 'wait' });
  return ('PASS: ephemeral SDP; native local recording; live deltas/order/dedup; pause/resume; silence commits; reconnect and finite retries; malformed events; stop drain; cleanup; scroll/mobile; final-only notes; unsupported transport/audio initialization.');
}
