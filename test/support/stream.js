// A stand-in for dsh-TUI's stdin: a PassThrough using the (wrapped)
// tty.ReadStream.prototype.read, drained the way dsh-TUI's ink App does
// ('readable' + read() until null). Collects everything the app would see.
import { PassThrough } from 'node:stream';
import tty from 'node:tty';

export function fakeStdin({ encoding = 'utf8' } = {}) {
  const stream = new PassThrough();
  if (encoding) stream.setEncoding(encoding);
  stream.read = function read(...args) { return tty.ReadStream.prototype.read.apply(this, args); };
  const seen = [];
  stream.on('readable', () => {
    let chunk;
    while ((chunk = stream.read()) !== null) seen.push(chunk);
  });
  return {
    stream,
    seen,
    write: (data) => new Promise((resolve) => stream.write(data, resolve)),
    text: () => seen.map((c) => (Buffer.isBuffer(c) ? c.toString('latin1') : c)).join(''),
    bytes: () => Buffer.concat(seen.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c, 'utf8')))),
  };
}

/** A minimal plugin context: records effects and disposes them in reverse. */
export function fakeContext() {
  const disposers = [];
  return {
    effect(fn, label) { const d = fn(); disposers.push({ d, label }); },
    effects: () => disposers.map((x) => x.label),
    dispose() { while (disposers.length) disposers.pop().d?.(); },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
