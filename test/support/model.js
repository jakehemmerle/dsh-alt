// Independent oracle for the translator (SPEC.md P-01..P-09). Written from the rule
// table in SPEC.md; deliberately does not import lib/translate.js.

export const ESC = '\x1b';
export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';
export const CTRL_W = '\x17';
export const CTRL_LEFT = '\x1b[1;5D';
export const CTRL_RIGHT = '\x1b[1;5C';

/** SPEC.md rule table, in priority order (longest/most specific first). */
export const SPEC_RULES = [
  ['\x1b\x1b[D', CTRL_LEFT], ['\x1b\x1b[C', CTRL_RIGHT],
  ['\x1b[1;3D', CTRL_LEFT], ['\x1b[1;3C', CTRL_RIGHT],
  ['\x1b\x7f', CTRL_W], ['\x1b\b', CTRL_W],
  ['\x1bb', CTRL_LEFT], ['\x1bf', CTRL_RIGHT],
];

export const OPTION_BACKSPACE = ['\x1b\x7f', '\x1b\b'];
export const OPTION_LEFT = ['\x1b[1;3D', '\x1bb', '\x1b\x1b[D'];
export const OPTION_RIGHT = ['\x1b[1;3C', '\x1bf', '\x1b\x1b[C'];

function rewriteOutside(text) {
  let out = '';
  let i = 0;
  outer: while (i < text.length) {
    for (const [from, to] of SPEC_RULES) {
      if (text.startsWith(from, i)) { out += to; i += from.length; continue outer; }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** Expected output for the whole input delivered as one read (held bytes released). */
export function expected(input) {
  let out = '';
  let rest = input;
  let paste = false;
  while (rest.length) {
    if (paste) {
      const end = rest.indexOf(PASTE_END);
      if (end === -1) return out + rest;
      out += rest.slice(0, end + PASTE_END.length);
      rest = rest.slice(end + PASTE_END.length);
      paste = false;
    } else {
      const start = rest.indexOf(PASTE_START);
      if (start === -1) return out + rewriteOutside(rest);
      out += rewriteOutside(rest.slice(0, start)) + PASTE_START;
      rest = rest.slice(start + PASTE_START.length);
      paste = true;
    }
  }
  return out;
}

/** Split `s` at the given cut points (any numbers; clamped, sorted, deduplicated). */
export function splitAt(s, cuts) {
  const points = [...new Set(cuts.map((c) => Math.max(0, Math.min(s.length, c))))].sort((a, b) => a - b);
  const parts = [];
  let last = 0;
  for (const p of points) { parts.push(s.slice(last, p)); last = p; }
  parts.push(s.slice(last));
  return parts;
}
