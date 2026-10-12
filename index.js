// dsh-alt: macOS-style Option/Alt word editing for dsh-TUI.
//
// dsh-TUI reads keys with tty.ReadStream#read() in the same process as the
// DSH plugins, so this wraps that method and rewrites Option sequences into
// the Ctrl bindings the prompt already implements (SPEC.md):
//   Option+Backspace   -> Ctrl+W     (delete previous word, not the draft)
//   Option+Left/Right  -> Ctrl+Left/Right (jump by word)
// Bracketed paste is passed through untouched. A read that ends inside a
// possible sequence is held briefly and released unchanged if nothing
// completes it (SPEC.md P-06, P-10). Disposing the plugin restores the
// original method and releases held bytes.

import tty from 'node:tty';
import { createTranslator } from './lib/translate.js';

export const name = 'dsh-alt';

/** How long a possible sequence start is held (dsh-TUI's own ESC/paste timeouts). */
export const HOLD_MS = 50;
export const PASTE_HOLD_MS = 500;

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  const proto = tty.ReadStream.prototype;
  const original = proto.read;
  const states = new WeakMap();
  const waiting = new Set();

  function stateFor(stream) {
    let state = states.get(stream);
    if (!state) {
      state = { translate: createTranslator(), timer: null, kick: null, release: false, buffer: false, stream };
      states.set(stream, state);
    }
    return state;
  }

  // Put held bytes back at the front of the stream; the next read() (which the
  // stream's 'readable' event triggers) returns them, untranslated.
  function releaseHeld(state, final) {
    clearTimeout(state.timer);
    state.timer = null;
    clearInterval(state.kick);
    state.kick = null;
    waiting.delete(state);
    const held = state.translate.flush();
    if (!held) return;
    if (!final) state.release = true;
    try {
      state.stream.unshift(state.buffer ? Buffer.from(held, 'latin1') : held);
    } catch {
      // The stream has ended or been destroyed; nothing will read it.
    }
  }

  function read(...args) {
    const chunk = original.apply(this, args);
    if (chunk === null || chunk === undefined) return chunk;
    const isBuffer = Buffer.isBuffer(chunk);
    if (typeof chunk !== 'string' && !isBuffer) return chunk;
    const state = stateFor(this);
    clearTimeout(state.timer);
    state.timer = null;
    clearInterval(state.kick);
    state.kick = null;
    waiting.delete(state);
    state.buffer = isBuffer;
    // Every rule and marker is ASCII, so a Buffer is translated byte for byte
    // as latin1: split or invalid UTF-8 passes through untouched (P-09).
    const text = isBuffer ? chunk.toString('latin1') : chunk;
    let out = state.translate(text);
    if (state.release) {
      // This read carries bytes released by the hold timer: nothing more is
      // coming for them, so emit them as they are.
      state.release = false;
      out += state.translate.flush();
    }
    if (state.translate.pending()) {
      waiting.add(state);
      // dsh-TUI's ink pump stops when a read returns null and, on a stream it
      // has already drained, does not see a 'readable' for the next write — so
      // a follow-up byte written inside the hold window (e.g. the DEL of ESC
      // DEL arriving as its own write, as terminals that send Option as Meta
      // do) would only be read after the hold releases it, as a stray Escape.
      // Re-kick the pump while the hold is pending so the pair completes.
      state.kick = setInterval(() => {
        try { state.stream.emit('readable'); } catch { /* stream gone */ }
      }, 5);
      state.kick.unref?.();
      state.timer = setTimeout(() => releaseHeld(state, false), state.translate.inPaste() ? PASTE_HOLD_MS : HOLD_MS);
      state.timer.unref?.();
    }
    if (out === text) return chunk;
    if (out === '') return null;
    return isBuffer ? Buffer.from(out, 'latin1') : out;
  }

  proto.read = read;
  ctx.effect(() => () => {
    if (proto.read === read) proto.read = original;
    for (const state of [...waiting]) releaseHeld(state, true);
  }, 'dsh-alt: tty.ReadStream#read wrapper');
}
