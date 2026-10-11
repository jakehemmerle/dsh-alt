// dsh-alt: macOS-style Option/Alt word editing for dsh-TUI.
//
// dsh-TUI reads keys with tty.ReadStream#read() in the same process as the
// DSH plugins, so this wraps that method and rewrites Option sequences into
// the Ctrl bindings the prompt already implements:
//   Option+Backspace   -> Ctrl+W     (delete previous word, not the draft)
//   Option+Left/Right  -> Ctrl+Left/Right (jump by word)
// Bracketed paste is passed through untouched. Disposing the plugin
// restores the original method.

import tty from 'node:tty';
import { createTranslator } from './lib/translate.js';

export const name = 'dsh-alt';

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  const proto = tty.ReadStream.prototype;
  const original = proto.read;
  const translators = new WeakMap();
  function read(...args) {
    const chunk = original.apply(this, args);
    if (chunk === null || chunk === undefined) return chunk;
    let translate = translators.get(this);
    if (!translate) {
      translate = createTranslator();
      translators.set(this, translate);
    }
    if (typeof chunk === 'string') return translate(chunk);
    if (Buffer.isBuffer(chunk)) {
      const text = chunk.toString('utf8');
      const next = translate(text);
      return next === text ? chunk : Buffer.from(next, 'utf8');
    }
    return chunk;
  }
  proto.read = read;
  ctx.effect(() => () => {
    if (proto.read === read) proto.read = original;
  }, 'dsh-alt: tty.ReadStream#read wrapper');
}
