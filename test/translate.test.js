import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTranslator } from '../lib/translate.js';
import { resolveTuiTypes } from './support/tui-types.js';

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

// End to end against dsh-TUI's own key parser (SPEC.md P-11): every run, and
// every Option encoding, must parse as the bound Ctrl key. A missing dsh-TUI
// is a failure, not a skip (alt-hvt.14).
const OPTION_ENCODINGS = [
  ['\x1b\x7f', 'backspace'], ['\x1b\b', 'backspace'],
  ['\x1b[1;3D', 'leftArrow'], ['\x1bb', 'leftArrow'], ['\x1b\x1b[D', 'leftArrow'],
  ['\x1b[1;3C', 'rightArrow'], ['\x1bf', 'rightArrow'], ['\x1b\x1b[C', 'rightArrow'],
];

test('P-11 dsh-TUI parses every translation as the bound key', async () => {
  const types = resolveTuiTypes();
  const { parseMultipleKeypresses, INITIAL_STATE } = await import(pathToFileURL(join(types, 'ink', 'parse-keypress.js')).href);
  const { InputEvent } = await import(pathToFileURL(join(types, 'ink', 'events', 'input-event.js')).href);
  const keys = (s) => parseMultipleKeypresses(INITIAL_STATE, T()(s))[0].map((k) => new InputEvent(k));
  for (const [encoding, arrow] of OPTION_ENCODINGS) {
    if (arrow === 'backspace') {
      const [ev] = keys(encoding);
      assert.equal(ev.input, 'w', encoding);
      assert.equal(ev.key.ctrl, true, encoding);
      assert.equal(ev.key.escape, false, encoding);
    } else {
      const [ev] = keys(encoding);
      assert.equal(ev.key[arrow], true, encoding);
      assert.equal(ev.key.ctrl, true, encoding);
    }
  }
});
