// Run with Playwright CLI's run-code --filename from the repository root.
// Real MediaRecorder encodes synthetic Web Audio. No physical microphone or paid AI requests.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const test = window.__recordingTest = { calls: [], streams: [], urls: [], revoked: [], mode: 'ok', contexts: [], beforeUnload: new Set() };
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    window.addEventListener = (type, listener, options) => { if (type === 'beforeunload') test.beforeUnload.add(listener); add(type, listener, options); };
    window.removeEventListener = (type, listener, options) => { if (type === 'beforeunload') test.beforeUnload.delete(listener); remove(type, listener, options); };
    const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = createUrl(blob); test.urls.push(url); return url; };
    URL.revokeObjectURL = url => { test.revoked.push(url); revokeUrl(url); };
    const NativeRecorder = window.MediaRecorder;
    if (sessionStorage.getItem('recording-test-unsupported') === 'true') {
      window.MediaRecorder = undefined;
      return;
    }
    const nativeSupport = NativeRecorder.isTypeSupported.bind(NativeRecorder);
    window.MediaRecorder = new Proxy(NativeRecorder, {
      get(target, property) {
        if (property === 'isTypeSupported') return type => test.mode === 'mp4' && type.startsWith('audio/webm') ? false : nativeSupport(type);
        return Reflect.get(target, property);
      },
      construct(target, args) {
        if (test.mode === 'init-failure') throw new DOMException('test-only diagnostic', 'NotSupportedError');
        if (test.mode === 'empty') {
          return { state: 'inactive', mimeType: 'audio/webm', start() { this.state = 'recording'; }, stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); } };
        }
        const recorder = Reflect.construct(target, args);
        test.recorder = recorder;
        return recorder;
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => {
      test.calls.push(constraints);
      const failures = { denied: 'NotAllowedError', missing: 'NotFoundError', busy: 'NotReadableError' };
      if (failures[test.mode]) throw new DOMException('test-only diagnostic', failures[test.mode]);
      const context = new AudioContext();
      test.contexts.push(context);
      await context.resume();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination); oscillator.start();
      const stream = destination.stream;
      test.streams.push(stream);
      if (test.mode === 'pending') return new Promise(resolve => { test.resolvePermission = () => resolve(stream); });
      return stream;
    } });
  });
  await page.route('**/api/realtime/session', route => route.fulfill({ status: 503, json: { detail: 'Live unavailable in this regression test.' }, headers: { 'access-control-allow-origin': 'http://localhost:3000' } }));
  await page.goto('http://localhost:3000');
  await page.getByRole('button', { name: 'Record Lecture', exact: true }).click();
  assert(await page.evaluate(() => window.__recordingTest.calls.length) === 0, 'No microphone request on page load or mode selection');
  const timer = page.getByRole('timer', { name: 'Elapsed recording time' });
  const start = page.getByRole('button', { name: 'Start Recording', exact: true });
  const recordingState = page.locator('.recording-status');
  let submissions = 0;
  const transcript = 'Recorded lecture: energy is conserved.';
  const headers = { 'access-control-allow-origin': 'http://localhost:3000' };
  await page.route('**/api/transcribe', async route => {
    submissions++;
    const body = route.request().postDataBuffer();
    const text = body.toString('latin1');
    assert(text.includes('name="file"'), 'Same multipart file field');
    assert(text.includes('lecture-recording-') && text.includes('.webm'), 'Correct recorded filename');
    assert(text.includes('audio/webm'), 'Correct recorded MIME');
    if (submissions === 1) {
      await route.fulfill({ status: 503, json: { detail: 'Transcription unavailable. Try again.' }, headers });
    } else await route.fulfill({ json: { transcript }, headers });
  });
  await start.click();
  await page.waitForFunction(() => document.querySelector('.recording-status').textContent === 'Recording');
  assert(await page.evaluate(() => JSON.stringify(window.__recordingTest.calls[0])) === '{"audio":true}', 'Only audio permission requested');
  assert(await page.getByRole('button', { name: 'Upload Audio', exact: true }).isDisabled(), 'Mode switch locked');
  assert(await page.evaluate(() => window.__recordingTest.beforeUnload.size) === 1, 'Active leave warning installed');
  await page.waitForFunction(() => document.querySelector('[role="timer"]').textContent !== '00:00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozen = await timer.innerText();
  await page.waitForTimeout(1200);
  assert(await timer.innerText() === frozen, 'Pause freezes timer');
  assert(await recordingState.innerText() === 'Paused', 'Paused status');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(value => document.querySelector('[role="timer"]').textContent !== value, frozen);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.recording-status').textContent === 'Recording Complete');
  assert(await page.evaluate(() => window.__recordingTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), 'Stop releases microphone tracks');
  assert(await page.evaluate(() => window.__recordingTest.beforeUnload.size) === 0, 'Leave warning removed after stop');
  const stoppedTime = await timer.innerText();
  await page.waitForTimeout(1100);
  assert(await timer.innerText() === stoppedTime, 'Stopped timer stays frozen');
  assert(submissions === 0, 'No upload until explicit transcribe');
  await page.locator('audio').evaluate(async audio => { audio.muted = true; await audio.play(); });
  await page.waitForFunction(() => document.querySelector('audio').currentTime > 0);
  await page.locator('audio').evaluate(audio => audio.pause());
  const url = await page.locator('audio').getAttribute('src');
  await page.getByRole('button', { name: 'Upload Audio', exact: true }).click();
  await page.getByRole('button', { name: 'Record Lecture', exact: true }).click();
  assert(await page.locator('audio').getAttribute('src') === url, 'Mode switch preserves preview');
  await page.getByRole('button', { name: 'Finalize Transcript', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Transcription unavailable' }).waitFor();
  assert(await page.locator('audio').getAttribute('src') === url, 'Transcription failure preserves the recording for retry');
  await page.getByRole('button', { name: 'Finalize Transcript', exact: true }).click();
  await page.getByRole('heading', { name: 'Final Transcript', exact: true }).waitFor();
  assert(submissions === 2, 'Shared endpoint retry succeeds');
  await page.route('**/api/notes', route => route.request().method() === 'OPTIONS' ? route.continue() : route.fulfill({ json: { notes: '# Lecture Summary\nEnergy is conserved.' }, headers }));
  await page.getByRole('button', { name: 'Generate Notes', exact: true }).click();
  await page.getByRole('heading', { name: 'Lecture Notes', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Recorder fits mobile viewport');
  await page.locator('.recording-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playwright/recording-mobile.png' });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  assert(await timer.innerText() === '00:00', 'Discard resets timer');
  assert(await page.locator('audio').count() === 0, 'Discard removes preview');
  assert(await page.evaluate(value => window.__recordingTest.revoked.includes(value), url), 'Discard revokes object URL');
  assert(await page.getByRole('heading', { name: 'Final Transcript', exact: true }).count() === 1, 'Discard retains transcript');
  assert(await page.getByRole('heading', { name: 'Lecture Notes', exact: true }).count() === 1, 'Discard retains notes');
  for (const [mode, message] of [['denied', 'Microphone access was denied'], ['missing', 'No microphone was detected'], ['busy', 'microphone is unavailable'], ['init-failure', 'could not initialize']]) {
    await page.evaluate(value => { window.__recordingTest.mode = value; }, mode);
    await start.click();
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.lecture-modes button')].find(button => button.textContent === 'Upload Audio')?.disabled === false);
  }
  await page.evaluate(() => { window.__recordingTest.mode = 'pending'; });
  await start.click();
  await page.waitForFunction(() => !!window.__recordingTest.resolvePermission);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.__recordingTest.resolvePermission());
  await page.waitForFunction(() => window.__recordingTest.streams.at(-1).getTracks().every(track => track.readyState === 'ended'));
  assert(await recordingState.innerText() === 'Ready when you are', 'Canceled permission cannot start later');
  await page.evaluate(() => { window.__recordingTest.mode = 'empty'; });
  await start.click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'recording is empty' }).waitFor();
  await page.evaluate(() => { window.__recordingTest.mode = 'ok'; });
  await start.click();
  await page.evaluate(() => window.__recordingTest.recorder.dispatchEvent(new Event('error')));
  await page.getByRole('alert').filter({ hasText: 'Recording failed' }).waitFor();
  assert(await page.evaluate(() => window.__recordingTest.streams.at(-1).getTracks()[0].readyState) === 'ended', 'Recording failure releases stream');
  // Repeat with the browser's working native encoder. MP4 negotiation is unit-tested.
  await page.evaluate(() => { window.__recordingTest.mode = 'ok'; });
  await start.click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.recording-status').textContent === 'Recording Complete');
  await page.locator('audio').dispatchEvent('error');
  await page.getByRole('alert').filter({ hasText: 'could not play this preview' }).waitFor();
  const secondUrl = await page.locator('audio').getAttribute('src');
  const calls = await page.evaluate(() => window.__recordingTest.calls.length);
  await page.getByRole('button', { name: 'Record Again', exact: true }).click();
  assert(await page.evaluate(() => window.__recordingTest.calls.length) === calls, 'Record Again returns to idle without automatic mic activation');
  assert(await page.evaluate(value => window.__recordingTest.revoked.includes(value), secondUrl), 'Record Again revokes preview');
  await page.getByRole('button', { name: 'Upload Audio', exact: true }).click();
  await page.unroute('**/api/transcribe');
  await page.route('**/api/transcribe', route => route.fulfill({ json: { transcript: 'Uploaded lecture still works.' }, headers }));
  await page.getByRole('button', { name: 'Choose a lecture recording', exact: true }).setInputFiles('output/playwright/lecture-test.wav');
  await page.getByRole('button', { name: 'Transcribe Lecture', exact: true }).click();
  await page.getByRole('region', { name: 'Full lecture transcript' }).filter({ hasText: 'Uploaded lecture still works.' }).waitFor();
  await page.evaluate(async () => { await Promise.all(window.__recordingTest.contexts.map(context => context.close())); });
  await page.route('**/api/config', route => route.fulfill({ json: { max_upload_bytes: 1000, supported_extensions: ['.webm', '.m4a', '.wav', '.mp3'], max_transcript_chars: 120000 }, headers }));
  await page.reload();
  await page.getByRole('button', { name: 'Record Lecture', exact: true }).click();
  await page.getByText('Up to 0.001 MB. Longer recordings depend on available browser memory.').waitFor();
  await start.click();
  await page.waitForFunction(() => document.querySelector('.recording-status').textContent === 'Recording Complete');
  assert(await page.getByRole('button', { name: 'Finalize Transcript', exact: true }).isDisabled(), 'Oversized recording cannot be submitted');
  assert(await page.evaluate(() => window.__recordingTest.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), 'Size limit releases microphone');
  await page.unroute('**/api/config');
  // Close synthetic source contexts; the live client owns and closes its own analysis contexts.
  await page.evaluate(async () => { await Promise.all(window.__recordingTest.contexts.map(context => context.close())); sessionStorage.setItem('recording-test-unsupported', 'true'); });
  await page.reload();
  await page.getByRole('button', { name: 'Record Lecture', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'does not support microphone recording' }).waitFor();
  assert(await start.isDisabled(), 'Unsupported recording disabled');
  await page.getByRole('button', { name: 'Upload Audio', exact: true }).click();
  assert(await page.getByRole('button', { name: 'browse files', exact: true }).isEnabled(), 'Upload remains usable when unsupported');
  assert(errors.length === 0, `No unexpected browser errors: ${errors.join('; ')}`);
  await page.evaluate(() => sessionStorage.removeItem('recording-test-unsupported'));
  await page.unrouteAll({ behavior: 'wait' });
  return ('PASS: native encoding and playback; timer/pause/resume/stop; track and URL cleanup; recording with live unavailable; shared transcription and notes; upload regression; permission/errors/cancel; mobile and unsupported browser.');
}
