// fast-check settings shared by every property suite: NUM_RUNS, FC_SEED and FC_PATH
// replay a run; the seed is always printed.
import fc from 'fast-check';

export const NUM_RUNS = Number(process.env.NUM_RUNS ?? 1000);

export function params(extra = {}) {
  const seed = process.env.FC_SEED !== undefined ? Number(process.env.FC_SEED) : (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  const p = { numRuns: NUM_RUNS, seed, ...extra };
  if (process.env.FC_PATH) p.path = process.env.FC_PATH;
  return p;
}

/** fc.assert with the seed logged (stderr) whatever the outcome. */
export function check(name, property, extra) {
  const p = params(extra);
  process.stderr.write(`[fc] ${name} seed=${p.seed} numRuns=${p.numRuns}${p.path ? ` path=${p.path}` : ''}\n`);
  return fc.assert(property, p);
}

export async function checkAsync(name, property, extra) {
  const p = params(extra);
  process.stderr.write(`[fc] ${name} seed=${p.seed} numRuns=${p.numRuns}${p.path ? ` path=${p.path}` : ''}\n`);
  return fc.assert(property, p);
}

const atoms = [
  '\x1b', '\x1b', '\x1b', '[', '1', ';', '3', '5', 'D', 'C', 'b', 'f', '\x7f', '\b', '2', '0', '~',
  'a', 'z', ' ', '\n', '\t', 'é', '中', '😀', '\u0301', '\x17',
  '\x1b\x7f', '\x1b\b', '\x1bb', '\x1bf', '\x1b[1;3D', '\x1b[1;3C', '\x1b\x1b[D', '\x1b\x1b[C',
  '\x1b[1;5D', '\x1b[D', '\x1b[C', '\x1b[200~', '\x1b[201~', '\x1b\x1b',
];

/** Hostile terminal input: rule sequences, their fragments, paste markers, Unicode. */
export const terminalInput = fc.array(fc.constantFrom(...atoms), { maxLength: 40 }).map((a) => a.join(''));

/** Cut points for splitting a string into reads. */
export const cuts = fc.array(fc.nat({ max: 400 }), { maxLength: 12 });

export { fc };
