// The tty.ReadStream#read wrapper (index.js) driven like dsh-TUI drives stdin.
import test from 'node:test';
import assert from 'node:assert/strict';
import tty from 'node:tty';
import { apply, HOLD_MS } from '../index.js';
import { expected, splitAt } from './support/model.js';
import { fakeStdin, fakeContext, sleep } from './support/stream.js';
import { checkAsync, fc, terminalInput, cuts, NUM_RUNS } from './support/fc.js';

function withPlugin(config) {
  const ctx = fakeContext();
  apply(ctx, config);
  return ctx;
}

test('P-10 a lone Escape is released unchanged after the hold window', async () => {
  const ctx = withPlugin();
  try {
    const s = fakeStdin();
    await s.write('ab\x1b');
    await sleep(5);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('ab'), 'ESC is held at first');
    await sleep(HOLD_MS * 3);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('ab\x1b'), 'ESC is released, once');
    await s.write('\x7f');
    await sleep(5);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('ab\x1b\x7f'), 'a late DEL is a plain Backspace');
  } finally { ctx.dispose(); }
});

test('P-06 P-10 ESC then DEL within the hold window becomes Ctrl+W', async () => {
  const ctx = withPlugin();
  try {
    const s = fakeStdin();
    await s.write('word \x1b');
    await sleep(10);
    await s.write('\x7f');
    await sleep(HOLD_MS * 3);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('word \x17'));
  } finally { ctx.dispose(); }
});

test('P-06 P-10 reads split at any point and released by timers equal the single-read output', async () => {
  const ctx = withPlugin();
  try {
    await checkAsync('P-06/P-10 stream', fc.asyncProperty(terminalInput, cuts, async (input, at) => {
      const s = fakeStdin();
      for (const part of splitAt(input, at)) { if (part) await s.write(part); }
      await sleep(input.includes('\x1b[200~') ? 560 : HOLD_MS + 30);
      assert.equal(JSON.stringify(s.text()), JSON.stringify(expected(input)));
    }), { numRuns: Math.max(10, Math.floor(NUM_RUNS / 10)) });
  } finally { ctx.dispose(); }
});
