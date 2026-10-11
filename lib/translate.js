// Rewrites Option/Alt editing sequences into the Ctrl forms dsh-TUI 0.14.0
// already binds. Pure and stateful only across bracketed paste, so pasted
// text is never altered.

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

const CTRL_W = '\x17';
const CTRL_LEFT = '\x1b[1;5D';
const CTRL_RIGHT = '\x1b[1;5C';

// Option+Backspace arrives as ESC DEL (or ESC BS). dsh-TUI's tokenizer
// splits that pair into Escape + Backspace, and Escape clears the whole
// draft. Option+Left/Right arrive as xterm CSI 1;3D/C, readline ESC b/f, or
// the older ESC ESC [D/C; dsh-TUI moves one character for all of them,
// because only Ctrl/Cmd take its word-jump branch.
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

const pattern = new RegExp(
  RULES.map(([from]) => from.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('|'),
  'g',
);
const replacement = new Map(RULES);

function rewrite(text) {
  return text.replace(pattern, (match) => replacement.get(match));
}

/** One translator per input stream; `inPaste` survives across chunks. */
export function createTranslator() {
  let inPaste = false;
  return function translate(chunk) {
    let out = '';
    let rest = chunk;
    while (rest.length > 0) {
      if (inPaste) {
        const end = rest.indexOf(PASTE_END);
        if (end === -1) return out + rest;
        out += rest.slice(0, end + PASTE_END.length);
        rest = rest.slice(end + PASTE_END.length);
        inPaste = false;
      } else {
        const start = rest.indexOf(PASTE_START);
        if (start === -1) return out + rewrite(rest);
        out += rewrite(rest.slice(0, start)) + PASTE_START;
        rest = rest.slice(start + PASTE_START.length);
        inPaste = true;
      }
    }
    return out;
  };
}
