import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../lib/translate.js';

// One read through a fresh translator, then release whatever it holds (SPEC.md P-10).
const T = () => { const t = createTranslator(); return (s) => t(s) + t.flush(); };

test('P-01 Option+Backspace becomes Ctrl+W', () => {
  assert.equal(T()('\x1b\x7f'), '\x17');
  assert.equal(T()('\x1b\b'), '\x17');
});

test('P-02 P-03 Option+Left/Right become Ctrl+Left/Right in every encoding', () => {
  for (const s of ['\x1b[1;3D', '\x1bb', '\x1b\x1b[D']) assert.equal(T()(s), '\x1b[1;5D');
  for (const s of ['\x1b[1;3C', '\x1bf', '\x1b\x1b[C']) assert.equal(T()(s), '\x1b[1;5C');
});

test('P-04 plain keys and Escape are untouched', () => {
  for (const s of ['abc', '\x1b', '\x7f', '\x1b[D', '\x1b[C', '\x1b\x1b', '\x1b[1;5D', 'bf']) {
    assert.equal(T()(s), s);
  }
});

test('P-05 bracketed paste is passed through, even across chunks', () => {
  const t = createTranslator();
  assert.equal(t('x\x1b\x7f\x1b[200~a\x1b\x7f'), 'x\x17\x1b[200~a\x1b\x7f');
  assert.equal(t('\x1bb\x1b[201~\x1bb'), '\x1bb\x1b[201~\x1b[1;5D');
});

// End to end against dsh-TUI's own key parser when its path is supplied.
const types = process.env.DSH_TUI_TYPES;
test('dsh-TUI parses the translations as the bound keys', { skip: !types }, async () => {
  const { parseMultipleKeypresses, INITIAL_STATE } = await import(`${types}/ink/parse-keypress.js`);
  const { InputEvent } = await import(`${types}/ink/events/input-event.js`);
  const keys = (s) => parseMultipleKeypresses(INITIAL_STATE, T()(s))[0].map((k) => new InputEvent(k));
  const [bs] = keys('\x1b\x7f');
  assert.equal(bs.input, 'w');
  assert.equal(bs.key.ctrl, true);
  assert.equal(bs.key.escape, false);
  for (const [s, dir] of [['\x1b[1;3D', 'leftArrow'], ['\x1bf', 'rightArrow']]) {
    const [ev] = keys(s);
    assert.equal(ev.key[dir], true);
    assert.equal(ev.key.ctrl, true);
  }
});
