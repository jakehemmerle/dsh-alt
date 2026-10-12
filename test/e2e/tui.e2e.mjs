// Real dsh-TUI property tests over a live dsh-TUI process in a private tmux
// socket against the local mock model (SPEC.md P-01..P-08, P-10, P-13, P-15;
// bead alt-hvt.6). Env: DSH_BIN, DSH_TUI_DIR (apps.e2e sets both, plus
// DSH_TUI_TYPES); E2E_SEED and E2E_RUNS replay a run; every action step is
// asserted against an independent (draft, caret) word-rule model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startMockLlm, lastUserText } from '../rig/mock-llm.mjs';
import { makeProfile, startTui } from '../rig/rig.mjs';
import { sleep } from '../support/stream.js';

const PLUGIN = fileURLToPath(new URL('../../index.js', import.meta.url));
const RUNS = Math.max(1, Number(process.env.E2E_RUNS ?? 25));
const SEED = process.env.E2E_SEED !== undefined ? Number(process.env.E2E_SEED) : 20261012;
const SETTLE = 250; // > one React render + tmux roundtrip

if (!process.env.DSH_BIN || !process.env.DSH_TUI_DIR) {
  console.error('[tui.e2e] DSH_BIN and DSH_TUI_DIR are required (nix run .#e2e sets them)');
}

// mulberry32: small deterministic PRNG so a failed run replays exactly.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

// ---- independent word-rule model (SPEC.md; never imports the plugin) ----
function backspaceWord([d, c]) {
  let i = c;
  while (i > 0 && /\s/.test(d[i - 1])) i -= 1;
  while (i > 0 && !/\s/.test(d[i - 1])) i -= 1;
  return [d.slice(0, i) + d.slice(c), i];
}
function wordLeft(d, c) {
  let i = c;
  while (i > 0 && /\s/.test(d[i - 1])) i -= 1;
  while (i > 0 && !/\s/.test(d[i - 1])) i -= 1;
  return i;
}
function wordRight(d, c) {
  let i = c;
  while (i < d.length && !/\s/.test(d[i])) i += 1;
  while (i < d.length && /\s/.test(d[i])) i += 1;
  return i;
}
const isNarrow = (s) => [...s].every((ch) => ch.charCodeAt(0) < 0x2e80); // single-width only

// ---- raw byte sequences a Meta terminal sends (README/SPEC rule table) ----
const OPT_BS = ['\x1b\x7f', '\x1b\b'];
const OPT_LEFT = ['\x1b[1;3D', '\x1bb', '\x1b\x1b[D'];
const OPT_RIGHT = ['\x1b[1;3C', '\x1bf', '\x1b\x1b[C'];
const WORDS = ['abc', 'hello', 'def', 'word', '中点', 'x', 'Ok'];
const PASTE_WORDS = ['alpha', 'beta', 'gamma', 'delta '];

// ---- draft extraction and caret from the rendered pane ----
// The Launchpad shows a placeholder for an empty draft; generated words never contain it.
const PLACEHOLDER = 'Say something, or type / for commands…';
const PROMPT_RE = { launchpad: '│ ❯ ', chat: '⌸ ❯ ' };
function draftOf(capture, surface) {
  const lines = capture.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].includes(PROMPT_RE[surface])) {
      const text = lines[i].slice(lines[i].indexOf(PROMPT_RE[surface]) + PROMPT_RE[surface].length)
        .replace(/[│⛶].*$/, '').replace(/\s+$/, '');
      return text === PLACEHOLDER ? '' : text;
    }
  }
  throw new Error('no prompt line on ' + surface + ' in:\n' + capture);
}
function caretOf(tui) {
  return Number(tui.tmux('display-message', '-p', '-t', 'rig', '#{cursor_x}').trim());
}

// ---- actions: drive the real terminal, then update the model ----
const ACTIONS = {
  type: { step: (tui, r, m) => { const w = pick(r, WORDS) + (r() < 0.5 ? ' ' : ''); tui.text(w); m[0] = m[0].slice(0, m[1]) + w + m[0].slice(m[1]); m[1] += w.length; } },
  bspace: { step: (tui, r, m) => { tui.keys('BSpace'); if (m[1] > 0) { m[0] = m[0].slice(0, m[1] - 1) + m[0].slice(m[1]); m[1] -= 1; } } },
  // Left at caret 0 is dsh-TUI's own session-dashboard navigation (stock
  // behaviour, outside the plugin's editor contract), so only exercise the
  // arrow where it moves the caret.
  left: { step: (tui, r, m) => { if (m[1] === 0) return; tui.keys('Left'); m[1] -= 1; } },
  right: { step: (tui, r, m) => { tui.keys('Right'); m[1] = Math.min(m[0].length, m[1] + 1); } },
  optbs: { step: (tui, r, m) => { tui.raw(pick(r, OPT_BS)); const [d, c] = backspaceWord(m); m[0] = d; m[1] = c; } },
  optleft: { step: (tui, r, m) => { tui.raw(pick(r, OPT_LEFT)); m[1] = wordLeft(m[0], m[1]); } },
  optright: { step: (tui, r, m) => { tui.raw(pick(r, OPT_RIGHT)); m[1] = wordRight(m[0], m[1]); } },
  ctrlw: { step: (tui, r, m) => { tui.keys('C-w'); const [d, c] = backspaceWord(m); m[0] = d; m[1] = c; } },
  ctrlleft: { step: (tui, r, m) => { tui.keys('C-Left'); m[1] = wordLeft(m[0], m[1]); } },
  ctrlright: { step: (tui, r, m) => { tui.keys('C-Right'); m[1] = wordRight(m[0], m[1]); } },
  paste: { step: (tui, r, m) => {
    const body = Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(r, PASTE_WORDS)).join('');
    tui.raw('\x1b[200~' + body + '\x1b[201~');
    m[0] = m[0].slice(0, m[1]) + body + m[0].slice(m[1]); m[1] += body.length;
  } },
};
function genSequence(r) {
  const names = ['type', 'bspace', 'left', 'right', 'optbs', 'optleft', 'optright', 'ctrlw', 'ctrlleft', 'ctrlright', 'paste'];
  const n = 3 + Math.floor(r() * 5);
  const seq = [];
  for (let i = 0; i < n; i += 1) {
    const name = pick(r, names);
    if (name === 'type' && seq.filter((s) => s === 'type').length >= 2) continue; // keep drafts short
    seq.push(name);
  }
  return seq.length ? seq : ['type'];
}

async function assertStep(tui, surface, model, trace) {
  await sleep(SETTLE);
  const capture = tui.capture();
  let got;
  try { got = draftOf(capture, surface); } catch (e) { throw new Error('after [' + trace.join(' -> ') + ']: ' + e.message); }
  // Trailing whitespace does not render (the pane trims it); the exact caret
  // assert below still pins it, and submitDraft checks the submitted prompt.
  assert.equal(got.replace(/\s+$/, ''), model[0].replace(/\s+$/, ''), 'draft after ' + trace.join(' -> '));
  if (isNarrow(model[0])) {
    const caret = caretOf(tui) - baseBySurface[surface];
    assert.equal(caret, model[1], 'caret after ' + trace.join(' -> ') + ' (draft ' + JSON.stringify(model[0]) + ')');
  }
}
const baseBySurface = { launchpad: 0, chat: 0 };
async function calibrate(tui, surface) {
  const capture = await tui.waitFor(/❯/, { timeout: 60000 });
  assert.equal(draftOf(capture, surface), '', 'prompt starts empty on ' + surface);
  baseBySurface[surface] = caretOf(tui);
}
async function ensureEmptyPrompt(tui, surface, model) {
  if (draftOf(tui.capture(), surface) === '') { model[0] = ''; model[1] = 0; return; }
  tui.raw('\x1b'); // lone Escape clears the draft in stock dsh-TUI (P-10)
  await sleep(SETTLE);
  assert.equal(draftOf(tui.capture(), surface), '', 'Escape reset failed on ' + surface);
  model[0] = ''; model[1] = 0;
}
async function submitDraft(tui, mock, turnsBefore, draft, surface) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(250);
    tui.keys('Enter');
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const newTurns = mock.turns().slice(turnsBefore);
      const want = draft.replace(/\s+$/, '');
      const userTexts = (t) => (t.messages ?? []).filter((m) => m.role === 'user')
        .map((m) => typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p?.text ?? '').join(''));
      if (newTurns.some((t) => userTexts(t).some((u) => u.replace(/\s+$/, '') === want || u.startsWith(want)))) return;
      await sleep(150);
    }
  }
  assert.fail('prompt never reached the mock model on ' + surface + ': ' + JSON.stringify(draft) + '\n--- final pane ---\n' + tui.capture());
}

// ---- fixtures ----
async function withRig(plugins, fn) {
  const mock = await startMockLlm({ script: () => ({ text: 'pong' }) });
  const profile = makeProfile({ kind: 'tui', mock, plugins });
  const cfg = await profile.dumpConfig();
  assert.equal(cfg.status, 0, 'dumpConfig failed: ' + cfg.stderr);
  const names = plugins.map((p) => p.id);
  for (const id of names) assert.ok(cfg.stdout.includes('id: ' + id), id + ' row missing from the composed profile');
  const warnings = profile.logs().split('\n').filter((l) => names.some((id) => l.includes(id) && /warn|error/i.test(l)));
  assert.equal(warnings.length, 0, 'plugin load warnings: ' + warnings.join('\n'));
  try { await fn(mock, profile); } finally { await mock.close(); profile.dispose(); }
}

test('P-01..P-08 P-10 P-13 P-15 Launchpad: generated sequences match the word-rule model', { timeout: 900000 }, async () => {
  console.error('[tui.e2e] Launchpad RUNS=' + RUNS + ' SEED=' + SEED);
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: {} }], async (mock, profile) => {
    for (let run = 0; run < RUNS; run += 1) {
      const r = rng(SEED + run);
      const seq = genSequence(r);
      console.error('[tui.e2e] Launchpad case ' + run + ': ' + seq.join(','));
      const tui = startTui(profile, { cols: 100, rows: 30 });
      try {
        await calibrate(tui, 'launchpad');
        const model = ['', 0];
        for (const name of seq) {
          ACTIONS[name].step(tui, r, model);
          await assertStep(tui, 'launchpad', model, [name]);
        }
        // Enter on an empty Launchpad prompt is a no-op, so give every case a
        // non-empty final draft to submit (P-15 fidelity for the actual draft).
        if (model[0] === '') { tui.text('end'); model[0] = 'end'; model[1] = 3; await assertStep(tui, 'launchpad', model, ['end-marker']); }
        const turnsBefore = mock.turns().length;
        await submitDraft(tui, mock, turnsBefore, model[0], 'launchpad');
      } finally { await tui.kill(); }
    }
  });
});

test('P-01..P-08 P-10 P-15 chat: generated sequences match the word-rule model', { timeout: 900000 }, async () => {
  console.error('[tui.e2e] chat RUNS=' + RUNS + ' SEED=' + SEED);
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: {} }], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      await tui.submit('first prompt', { until: () => mock.turns().length > 0 });
      await sleep(400);
      await calibrate(tui, 'chat');
      for (let run = 0; run < RUNS; run += 1) {
        const r = rng(SEED + 1000 + run);
        const seq = genSequence(r);
        console.error('[tui.e2e] chat case ' + run + ': ' + seq.join(','));
        const model = ['', 0];
        await ensureEmptyPrompt(tui, 'chat', model);
        for (const name of seq) {
          ACTIONS[name].step(tui, r, model);
          await assertStep(tui, 'chat', model, [name]);
        }
        if (model[0] === '') { tui.text('end'); model[0] = 'end'; model[1] = 3; await assertStep(tui, 'chat', model, ['end-marker']); }
        const turnsBefore = mock.turns().length;
        await submitDraft(tui, mock, turnsBefore, model[0], 'chat');
        await sleep(300);
        try { draftOf(tui.capture(), 'chat'); } catch (e) { throw new Error('case ' + run + ': prompt gone right after submit:\n' + tui.capture()); }
      }
    } finally { await tui.kill(); }
  });
});

test('P-06 TUI: ESC and DEL in two fast writes still delete one word (chat)', { timeout: 120000 }, async () => {
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: {} }], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      await tui.submit('warmup', { until: () => mock.turns().length > 0 });
      await sleep(400);
      await calibrate(tui, 'chat');
      for (let i = 0; i < 5; i += 1) {
        const model = ['', 0];
        await ensureEmptyPrompt(tui, 'chat', model);
        tui.text('abc def');
        await sleep(SETTLE);
        model[0] = 'abc def'; model[1] = 7;
        const t0 = Date.now();
        tui.raw('\x1b');
        tui.raw('\x7f');
        const gap = Date.now() - t0;
        await sleep(120); // the second byte must land inside the 50 ms hold window
        await assertStep(tui, 'chat', ['abc ', 4], ['split ESC|DEL gap=' + gap + 'ms']);
        console.error('[tui.e2e] P-06 split gap=' + gap + 'ms');
      }
    } finally { await tui.kill(); }
  });
});

test('P-08 P-05 P-15 TUI: split paste-end then translation resumes; paste body verbatim (chat)', { timeout: 180000 }, async () => {
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: {} }], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      await tui.submit('warmup', { until: () => mock.turns().length > 0 });
      await sleep(400);
      await calibrate(tui, 'chat');

      // P-08: the paste-end marker arrives as its own write (split), then an
      // Option+Backspace must translate again (the plugin must not stick in paste).
      {
        const model = ['', 0];
        await ensureEmptyPrompt(tui, 'chat', model);
        tui.text('pre ');
        await sleep(SETTLE);
        model[0] = 'pre '; model[1] = 4;
        tui.raw('\x1b[200~alpha beta');
        await sleep(SETTLE);
        // dsh-TUI buffers the paste body until the end marker: the visible
        // draft is unchanged by the first write.
        await assertStep(tui, 'chat', ['pre ', 4], ['paste-start+body (buffered)']);
        tui.raw('\x1b[201~');
        await sleep(SETTLE + 100);
        model[0] = 'pre alpha beta'; model[1] = 14;
        await assertStep(tui, 'chat', model, ['paste-end (split)']);
        tui.raw('\x1b\x7f');
        await sleep(SETTLE);
        model[0] = 'pre alpha '; model[1] = 10;
        await assertStep(tui, 'chat', model, ['Option+Backspace after split paste']);
        const turnsBefore = mock.turns().length;
        await submitDraft(tui, mock, turnsBefore, model[0], 'chat P-08');
      }

      // P-05: a paste whose body contains Option-like bytes is not rewritten
      // by the plugin: the body reaches the model with no 0x17 and no word edit
      // (dsh-TUI 0.14.0's editor itself strips C0 controls from paste bodies;
      // the plugin's byte-verbatim contract is proven at the Core layer).
      {
        const model = ['', 0];
        await ensureEmptyPrompt(tui, 'chat', model);
        tui.raw('\x1b[200~pasted esc:\x1b\x7f inside\x1b[201~');
        await sleep(400);
        const turnsBefore = mock.turns().length;
        await submitDraft(tui, mock, turnsBefore, 'pasted esc: inside', 'chat P-05');
      }
    } finally { await tui.kill(); }
  });
});

test('P-10 TUI: a lone Escape still clears the draft (chat)', { timeout: 120000 }, async () => {
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: {} }], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      await tui.submit('warmup', { until: () => mock.turns().length > 0 });
      await sleep(400);
      await calibrate(tui, 'chat');
      const model = ['', 0];
      await ensureEmptyPrompt(tui, 'chat', model);
      tui.text('abc def');
      await sleep(SETTLE);
      tui.raw('\x1b');
      await sleep(120); // released by the hold timer, then the editor clears
      await assertStep(tui, 'chat', ['', 0], ['lone Escape']);
    } finally { await tui.kill(); }
  });
});

test('negative control: without dsh-alt the stock editor clears the draft on ESC DEL (Launchpad)', { timeout: 120000 }, async () => {
  await withRig([], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      tui.text('abc def');
      await sleep(SETTLE);
      assert.equal(draftOf(tui.capture(), 'launchpad'), 'abc def');
      tui.raw('\x1b\x7f');
      await sleep(SETTLE);
      // Stock 0.14.0 pairs ESC+DEL into a single-character delete (observed:
      // 'abc def' -> 'abc de'; via terminals that split ESC/DEL into two reads
      // it instead splits into Escape-clear + Backspace). Either way the word
      // delete is broken without the plugin; the plugin's result is 'abc '.
      assert.equal(draftOf(tui.capture(), 'launchpad').replace(/\s+$/, ''), 'abc de', 'stock dsh-TUI 0.14.0 must NOT word-delete (the bug dsh-alt fixes)');
    } finally { await tui.kill(); }
  });
});

test('negative control: enabled:false installs nothing (Launchpad)', { timeout: 120000 }, async () => {
  await withRig([{ id: 'dsh-alt', name: PLUGIN, config: { enabled: false } }], async (mock, profile) => {
    const tui = startTui(profile, { cols: 100, rows: 30 });
    try {
      await calibrate(tui, 'launchpad');
      tui.text('abc def');
      await sleep(SETTLE);
      assert.equal(draftOf(tui.capture(), 'launchpad'), 'abc def');
      tui.raw('\x1b\x7f');
      await sleep(SETTLE);
      assert.equal(draftOf(tui.capture(), 'launchpad').replace(/\s+$/, ''), 'abc de', 'enabled:false must leave stock behaviour');
    } finally { await tui.kill(); }
  });
});