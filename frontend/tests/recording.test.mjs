import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the existing TypeScript compiler; no test framework/runtime dependency.
const source = await readFile(new URL('../lib/recording.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { formatRecordingTime, recordingExtension, microphoneError, preferredRecordingType } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('elapsed time handles minute/hour boundaries without rounding up', () => {
  for (const [ms, expected] of [[0, '00:00'], [999, '00:00'], [1000, '00:01'], [59999, '00:59'], [60000, '01:00'], [3599999, '59:59'], [3600000, '01:00:00'], [4477000, '01:14:37']]) {
    assert.equal(formatRecordingTime(ms), expected);
  }
});

test('actual MIME container determines filename; codec parameters are supported', () => {
  assert.equal(recordingExtension('audio/webm;codecs=opus'), '.webm');
  assert.equal(recordingExtension('audio/mp4;codecs=mp4a.40.2'), '.m4a');
  assert.equal(recordingExtension(' AUDIO/X-M4A '), '.m4a');
  assert.equal(recordingExtension('audio/wav'), '.wav');
  assert.equal(recordingExtension('audio/mpeg'), '.mp3');
  assert.equal(recordingExtension('audio/ogg'), null);
  assert.equal(recordingExtension(''), null);
});

test('microphone failures return actionable messages without raw details', () => {
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'AbortError', 'NotSupportedError', 'UnexpectedError']) {
    const error = new Error('sensitive test diagnostic');
    error.name = name;
    const message = microphoneError(error);
    assert.ok(message.length > 20);
    assert.ok(!message.includes(error.message));
  }
});


test('MIME negotiation falls back to MP4 and allows browser defaults', () => {
  const original = globalThis.MediaRecorder;
  try {
    globalThis.MediaRecorder = { isTypeSupported: type => type === 'audio/mp4' };
    assert.equal(preferredRecordingType(), 'audio/mp4');
    globalThis.MediaRecorder = { isTypeSupported: () => false };
    assert.equal(preferredRecordingType(), undefined);
  } finally {
    if (original === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = original;
  }
});
