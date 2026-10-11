// Rewrites Option/Alt editing sequences into the Ctrl forms dsh-TUI 0.14.0
// already binds (SPEC.md). Streaming and chunk-boundary safe: a read that ends
// in the middle of a sequence or a bracketed-paste marker is held until the
// next read (or an explicit flush), so the output never depends on how the
// terminal's bytes were split into reads (SPEC.md P-06..P-08). Pasted text is
// never altered (P-05).

export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';

const CTRL_W = '\x17';
const CTRL_LEFT = '\x1b[1;5D';
const CTRL_RIGHT = '\x1b[1;5C';

// Option+Backspace arrives as ESC DEL (or ESC BS). dsh-TUI's tokenizer
// splits that pair into Escape + Backspace, and Escape clears the whole
// draft. Option+Left/Right arrive as xterm CSI 1;3D/C, readline ESC b/f, or
// the older ESC ESC [D/C; dsh-TUI moves one character for all of them,
// because only Ctrl/Cmd take its word-jump branch. Order is priority.
export const RULES = [
  ['\x1b\x1b[D', CTRL_LEFT],
  ['\x1b\x1b[C', CTRL_RIGHT],
  ['\x1b[1;3D', CTRL_LEFT],
  ['\x1b[1;3C', CTRL_RIGHT],
  ['\x1b\x7f', CTRL_W],
  ['\x1b\b', CTRL_W],
  ['\x1bb', CTRL_LEFT],
  ['\x1bf', CTRL_RIGHT],
];

const OUTSIDE = [PASTE_START, ...RULES.map(([from]) => from)];

/** True when `tail` is a proper prefix of one of `patterns`. */
function couldStart(tail, patterns) {
  return patterns.some((p) => p.length > tail.length && p.startsWith(tail));
}

/**
 * One translator per input stream. `translate(chunk)` returns what can be
 * emitted now and keeps a possible sequence start; `flush()` releases it
 * unchanged. `pending()` and `inPaste()` expose the state for the reader.
 */
export function createTranslator() {
  let held = '';
  let paste = false;

  function run(chunk, final) {
    const text = held + chunk;
    held = '';
    let out = '';
    let i = 0;
    while (i < text.length) {
      const esc = text.indexOf('\x1b', i);
      if (paste) {
        const end = text.indexOf(PASTE_END, i);
        if (end !== -1) {
          out += text.slice(i, end + PASTE_END.length);
          i = end + PASTE_END.length;
          paste = false;
          continue;
        }
        // Hold a trailing piece of the end marker; emit the rest verbatim.
        let keep = 0;
        if (!final) {
          for (let k = Math.min(PASTE_END.length - 1, text.length - i); k > 0; k -= 1) {
            if (PASTE_END.startsWith(text.slice(text.length - k))) { keep = k; break; }
          }
        }
        out += text.slice(i, text.length - keep);
        held = text.slice(text.length - keep);
        return out;
      }
      if (esc === -1) { out += text.slice(i); break; }
      out += text.slice(i, esc);
      i = esc;
      if (text.startsWith(PASTE_START, i)) {
        out += PASTE_START;
        i += PASTE_START.length;
        paste = true;
        continue;
      }
      const rule = RULES.find(([from]) => text.startsWith(from, i));
      if (rule) {
        out += rule[1];
        i += rule[0].length;
        continue;
      }
      if (!final && couldStart(text.slice(i), OUTSIDE)) {
        held = text.slice(i);
        return out;
      }
      out += '\x1b';
      i += 1;
    }
    return out;
  }

  const translate = (chunk) => run(chunk, false);
  translate.flush = () => run('', true);
  translate.pending = () => held;
  translate.inPaste = () => paste;
  return translate;
}
