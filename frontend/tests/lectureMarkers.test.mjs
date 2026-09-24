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
const recording = await moduleUrl('../lib/recording.ts');
const { formatTimestamp, markerSeekTime, playbackDuration, parseMarkerSession, markerMetadata, markerId } = await import(await moduleUrl('../lib/lectureMarkers.ts', { '"./recording"': JSON.stringify(recording) }));
const marker = { id: 'one', type: 'note', timestampSeconds: 8, createdAt: '2026-09-24T12:00:00.000Z', note: 'Student note' };
const session = markers => JSON.stringify({ version: 1, lectureId: 'lecture-one', markers });

test('shared timestamp format covers minute and hour boundaries', () => {
  for (const [seconds, text] of [[8, '00:08'], [75, '01:15'], [1938, '32:18'], [4477, '01:14:37']]) assert.equal(formatTimestamp(seconds), text);
});

test('seek uses lead-in and clamps start/end to playable duration', () => {
  assert.equal(markerSeekTime(1938, 3000), 1933);
  assert.equal(markerSeekTime(2, 30), 0);
  assert.equal(markerSeekTime(35, 20), 19.95);
  assert.equal(markerSeekTime(10, 20, 2), 8);
  assert.equal(markerSeekTime(NaN, 20), 0);
  assert.equal(markerSeekTime(20, 0), 0);
  assert.equal(playbackDuration(19.8, 20), 19.8);
  assert.equal(playbackDuration(Infinity, 20), 20);
  assert.equal(playbackDuration(NaN, 20), 20);
});

test('recovery restores only validated marker data and strips unrelated fields', () => {
  const restored = parseMarkerSession(session([{ ...marker, secret: 'never persist this', note: '  Student note  ' }]));
  assert.deepEqual(restored.markers, [marker]);
  for (const item of [{ ...marker, type: 'exam' }, { ...marker, timestampSeconds: -1 }, { ...marker, timestampSeconds: Infinity }, { ...marker, timestampSeconds: '8' }, { ...marker, createdAt: 'invalid' }, { ...marker, note: 'x'.repeat(1001) }]) {
    assert.equal(parseMarkerSession(session([item])), null);
  }
  assert.equal(parseMarkerSession(session([marker, marker])), null);
  assert.equal(parseMarkerSession('{bad'), null);
  assert.equal(parseMarkerSession(session(Array(501).fill(marker))), null);
  assert.equal(parseMarkerSession('x'.repeat(650001)), null);
});

test('notes metadata is chronological and excludes IDs/creation timestamps', () => {
  const second = { ...marker, id: 'second', type: 'important', timestampSeconds: 12, note: undefined };
  assert.deepEqual(markerMetadata([second, marker]), [
    { type: 'note', timestampSeconds: 8, note: 'Student note' }, { type: 'important', timestampSeconds: 12 },
  ]);
});

test('marker IDs are unique across rapid creation', () => {
  assert.equal(new Set(Array.from({ length: 500 }, () => markerId())).size, 500);
});
