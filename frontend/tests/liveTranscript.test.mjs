import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/liveTranscript.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { LiveTranscriptStore } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const delta = (id, text, event_id) => ({ type: 'conversation.item.input_audio_transcription.delta', item_id: id, delta: text, event_id });
const done = (id, text) => ({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
const committed = (id, previous) => ({ type: 'input_audio_buffer.committed', item_id: id, previous_item_id: previous });

test('completion replaces deltas once and late/duplicate events cannot duplicate text', () => {
  const store = new LiveTranscriptStore();
  store.apply(delta('a', 'Hel', '1'), 1); store.apply(delta('a', 'lo', '2'), 1);
  store.apply(delta('a', 'lo', '2'), 1);
  assert.equal(store.snapshot()[0].text, 'Hello');
  store.apply(done('a', 'Hello world.'), 1); store.apply(done('a', 'Hello world.'), 1);
  store.apply(delta('a', ' late', '3'), 1);
  assert.deepEqual(store.snapshot(), [{ id: '1:a', text: 'Hello world.', complete: true, interrupted: false }]);
});

test('predecessor links order completions even if text and links arrive in reverse order', () => {
  const store = new LiveTranscriptStore();
  store.apply(done('c', 'Third'), 1); store.apply(done('b', 'Second'), 1); store.apply(done('a', 'First'), 1);
  store.apply(committed('c', 'b'), 1); store.apply(committed('b', 'a'), 1); store.apply(committed('a', null), 1);
  assert.deepEqual(store.snapshot().map(x => x.text), ['First', 'Second', 'Third']);
});

test('reconnect preserves interrupted partials and namespaces reused item/event IDs', () => {
  const store = new LiveTranscriptStore();
  store.apply(delta('a', 'Before drop', '1'), 1); store.interrupt(1);
  store.apply(delta('a', 'After reconnect', '1'), 2); store.apply(done('a', 'After reconnect.'), 2);
  assert.equal(store.snapshot().length, 2);
  assert.equal(store.snapshot()[0].interrupted, true);
  assert.equal(store.snapshot()[1].text, 'After reconnect.');
});

test('malformed text fails explicitly, unknown events ignored and cycles cannot hang', () => {
  const store = new LiveTranscriptStore();
  assert.equal(store.apply({ type: 'session.created' }, 1), false);
  assert.throws(() => store.apply(delta('a', null), 1));
  store.apply(done('a', 'A'), 1); store.apply(done('b', 'B'), 1);
  store.apply(committed('a', 'b'), 1); store.apply(committed('b', 'a'), 1);
  assert.equal(store.snapshot().length, 2);
});

test('long lecture ordering is iterative and transcript storage is bounded', () => {
  const store = new LiveTranscriptStore();
  for (let i = 4999; i >= 0; --i) {
    store.apply(done(String(i), `Sentence ${i}.`), 1);
    store.apply(committed(String(i), i ? String(i - 1) : null), 1);
  }
  const text = store.snapshot();
  assert.equal(text.length, 5000);
  assert.equal(text[0].text, 'Sentence 0.');
  assert.equal(text.at(-1).text, 'Sentence 4999.');
  assert.throws(() => store.apply(delta('huge', 'x'.repeat(600_001)), 1));
});
