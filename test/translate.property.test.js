// Fast property suite for the pure translator (SPEC.md). Oracle: test/support/model.js.
// Replay: FC_SEED=<seed> [FC_PATH=<path>] NUM_RUNS=<n> node --test test/translate.property.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../lib/translate.js';
import { expected, splitAt } from './support/model.js';
import { check, fc, terminalInput, cuts } from './support/fc.js';

/** Feed reads to one translator, then release anything it still holds. */
function feed(parts) {
  const t = createTranslator();
  let out = '';
  for (const p of parts) out += t(p);
  return out + (typeof t.flush === 'function' ? t.flush() : '');
}

test('P-06 any split of the input into reads gives the single-read output', () => {
  check('P-06', fc.property(terminalInput, cuts, (input, at) => {
    assert.equal(JSON.stringify(feed(splitAt(input, at))), JSON.stringify(expected(input)));
  }));
});

// A paste whose start marker is cut at every possible point; the body carries Option
// sequences that must survive verbatim.
const optionish = fc.array(fc.constantFrom('\x1b\x7f', '\x1bb', '\x1bf', '\x1b[1;3D', '\x1b\x1b[C', 'x', ' ', '中'), { minLength: 1, maxLength: 8 }).map((a) => a.join(''));

test('P-07 a paste-start marker split across reads still protects the paste body', () => {
  check('P-07', fc.property(optionish, optionish, fc.integer({ min: 1, max: 5 }), (before, body, cut) => {
    const input = `${before}\x1b[200~${body}\x1b[201~`;
    const at = before.length + cut; // inside "\x1b[200~"
    const out = feed(splitAt(input, [at]));
    assert.equal(JSON.stringify(out), JSON.stringify(expected(input)));
    assert.ok(out.includes(`\x1b[200~${body}\x1b[201~`), 'paste body rewritten');
  }));
});

test('P-06 regression: ESC and DEL in separate reads still become Ctrl+W', () => {
  assert.equal(JSON.stringify(feed(['abc \x1b', '\x7f'])), JSON.stringify('abc \x17'));
  assert.equal(JSON.stringify(feed(['\x1b[1;', '3D'])), JSON.stringify('\x1b[1;5D'));
  assert.equal(JSON.stringify(feed(['\x1b\x1b', '[C'])), JSON.stringify('\x1b[1;5C'));
});
