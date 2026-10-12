// Lifecycle of the tty.ReadStream#read wrapper (SPEC.md P-12, bead alt-hvt.15):
// exactly one wrapper per apply, dispose restores the original read and
// releases held bytes, enabled:false installs nothing, and each stream keeps
// independent translator state.
import test from 'node:test';
import assert from 'node:assert/strict';
import tty from 'node:tty';
import { apply, HOLD_MS } from '../index.js';
import { fakeStdin, fakeContext, sleep } from './support/stream.js';

const LABEL = 'dsh-alt: tty.ReadStream#read wrapper';

test('P-12 apply installs exactly one wrapper; dispose restores the original read', () => {
  const before = tty.ReadStream.prototype.read;
  const ctx = fakeContext();
  apply(ctx);
  try {
    assert.notEqual(tty.ReadStream.prototype.read, before, 'read was not wrapped');
    const wrapped = tty.ReadStream.prototype.read;
    assert.equal(ctx.effects().length, 1, 'exactly one effect');
    assert.equal(ctx.effects()[0], LABEL);
    // A second apply stacks a second wrapper (documented, reversible behaviour).
    const ctx2 = fakeContext();
    apply(ctx2);
    assert.notEqual(tty.ReadStream.prototype.read, wrapped, 'second apply wraps again');
    assert.equal(ctx2.effects().length, 1);
    ctx2.dispose();
    assert.equal(tty.ReadStream.prototype.read, wrapped, 'inner dispose restores the first wrapper');
  } finally { ctx.dispose(); }
  assert.equal(tty.ReadStream.prototype.read, before, 'dispose restores the original');
});

test('P-12 enabled:false installs nothing', () => {
  const before = tty.ReadStream.prototype.read;
  const ctx = fakeContext();
  apply(ctx, { enabled: false });
  assert.equal(tty.ReadStream.prototype.read, before, 'no wrapper with enabled:false');
  assert.equal(ctx.effects().length, 0, 'no effect registered');
});

test('P-12 dispose releases bytes held by a live timer', async () => {
  const ctx = fakeContext();
  apply(ctx);
  try {
    const s = fakeStdin();
    await s.write('ab\x1b');
    await sleep(5);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('ab'), 'ESC is held');
    ctx.dispose();
    await sleep(10);
    assert.equal(JSON.stringify(s.text()), JSON.stringify('ab\x1b'), 'held ESC released by dispose');
  } finally { ctx.dispose(); }
});

test('P-12 after dispose, reads pass through untranslated', async () => {
  const ctx = fakeContext();
  apply(ctx);
  ctx.dispose();
  const s = fakeStdin();
  await s.write('\x1b\x7f');
  await sleep(HOLD_MS + 30);
  assert.equal(JSON.stringify(s.text()), JSON.stringify('\x1b\x7f'), 'no translation after dispose');
});

test('P-12 two streams hold independent translator state', async () => {
  const ctx = fakeContext();
  apply(ctx);
  try {
    const a = fakeStdin();
    const b = fakeStdin();
    await a.write('x \x1b');
    await b.write('y \x1b');
    await sleep(5);
    await a.write('\x7f');
    await b.write('\x7f');
    await sleep(HOLD_MS + 30);
    assert.equal(JSON.stringify(a.text()), JSON.stringify('x \x17'), 'stream A');
    assert.equal(JSON.stringify(b.text()), JSON.stringify('y \x17'), 'stream B');
  } finally { ctx.dispose(); }
});
